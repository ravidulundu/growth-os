import { Injectable, Logger, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { getPool } from "../../shared/db/pool";
import { decryptSecret, encryptSecret } from "../../shared/security/token-vault";
import { getXClient } from "./x-client";

function base64UrlSha256(input: string) {
  return createHash("sha256").update(input).digest("base64url");
}

function nowPlusMinutes(minutes: number) {
  return new Date(Date.now() + minutes * 60_000);
}

function generateCodeVerifier() {
  // RFC 7636 allows 43-128 chars from the unreserved URI set.
  return randomBytes(48).toString("base64url");
}

function configuredScopes() {
  return (process.env.X_SCOPES ?? "tweet.read tweet.write users.read offline.access")
    .split(/\s+/)
    .filter(Boolean);
}

@Injectable()
export class XIntegrationService {
  private readonly logger = new Logger(XIntegrationService.name);

  protected dbPool() {
    return getPool();
  }

  protected xClient() {
    return getXClient();
  }

  async startConnect(workspaceId: string) {
    const state = randomBytes(24).toString("base64url");
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = base64UrlSha256(codeVerifier);

    await this.dbPool().query(
      `
        INSERT INTO x_oauth_states (
          workspace_id,
          state_hash,
          code_verifier_hash,
          code_verifier_encrypted,
          expires_at
        )
        VALUES ($1, $2, $3, $4, $5);
      `,
      [
        workspaceId,
        base64UrlSha256(state),
        base64UrlSha256(codeVerifier),
        encryptSecret(codeVerifier),
        nowPlusMinutes(15)
      ]
    );

    const redirectUri = process.env.X_REDIRECT_URI ?? "http://localhost:4000/x/connect/callback";
    const params = new URLSearchParams({
      response_type: "code",
      client_id: process.env.X_CLIENT_ID ?? "mock-client",
      redirect_uri: redirectUri,
      scope: configuredScopes().join(" "),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256"
    });

    return {
      authUrl: `https://x.com/i/oauth2/authorize?${params.toString()}`,
      state
    };
  }

  async completeConnect(params: { workspaceId: string; state: string; code: string }) {
    const stateHash = base64UrlSha256(params.state);
    const stateClient = await this.dbPool().connect();
    let codeVerifier: string;

    try {
      await stateClient.query("BEGIN");
      const stateResult = await stateClient.query<{
        id: string;
        code_verifier_hash: string;
        code_verifier_encrypted: string | null;
      }>(
        `
          SELECT id, code_verifier_hash, code_verifier_encrypted
          FROM x_oauth_states
          WHERE workspace_id = $1
            AND state_hash = $2
            AND consumed_at IS NULL
            AND expires_at > now()
          ORDER BY created_at DESC
          LIMIT 1
          FOR UPDATE;
        `,
        [params.workspaceId, stateHash]
      );

      if (!stateResult.rows[0]) {
        throw new UnauthorizedException("Invalid or expired OAuth state");
      }

      if (!stateResult.rows[0].code_verifier_encrypted) {
        throw new UnauthorizedException("OAuth verifier missing or invalid");
      }

      codeVerifier = decryptSecret(stateResult.rows[0].code_verifier_encrypted);
      if (base64UrlSha256(codeVerifier) !== stateResult.rows[0].code_verifier_hash) {
        throw new UnauthorizedException("OAuth verifier mismatch");
      }

      await stateClient.query("UPDATE x_oauth_states SET consumed_at = now() WHERE id = $1", [
        stateResult.rows[0].id
      ]);
      await stateClient.query("COMMIT");
    } catch (error) {
      try {
        await stateClient.query("ROLLBACK");
      } catch (rollbackError) {
        this.logger.warn(
          `Failed to rollback OAuth state transaction: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`
        );
      }
      throw error;
    } finally {
      stateClient.release();
    }

    // External API calls run outside DB transaction/row lock scope.
    const token = await this.xClient().exchangeCodeForToken(params.code, {
      codeVerifier
    });
    const profile = await this.xClient().getProfile(token.accessToken);

    const client = await this.dbPool().connect();

    try {
      await client.query("BEGIN");
      const accountResult = await client.query<{ id: string }>(
        `
          INSERT INTO x_accounts (workspace_id, x_user_id, username, is_active)
          VALUES ($1, $2, $3, true)
          ON CONFLICT (workspace_id, x_user_id)
          DO UPDATE SET username = EXCLUDED.username, is_active = true, updated_at = now()
          RETURNING id;
        `,
        [params.workspaceId, profile.xUserId, profile.username]
      );

      await client.query(
        "UPDATE x_tokens SET revoked_at = now() WHERE account_id = $1 AND revoked_at IS NULL",
        [accountResult.rows[0].id]
      );

      await client.query(
        `
          INSERT INTO x_tokens (
            account_id,
            access_token_encrypted,
            refresh_token_encrypted,
            scopes,
            expires_at
          )
          VALUES ($1, $2, $3, $4, $5);
        `,
        [
          accountResult.rows[0].id,
          encryptSecret(token.accessToken),
          encryptSecret(token.refreshToken),
          token.scopes,
          new Date(Date.now() + token.expiresInSeconds * 1000)
        ]
      );

      await client.query(
        `
          INSERT INTO audit_logs (workspace_id, action, entity_type, entity_id, result, metadata)
          VALUES ($1, 'x.connect', 'x_account', $2, 'success', $3::jsonb);
        `,
        [
          params.workspaceId,
          accountResult.rows[0].id,
          JSON.stringify({ username: profile.username, scopes: token.scopes })
        ]
      );

      await client.query("COMMIT");
      return {
        ok: true,
        accountId: accountResult.rows[0].id,
        username: profile.username
      };
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        this.logger.warn(
          `Failed to rollback X connect persistence transaction: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async listWorkspaceAccounts(workspaceId: string) {
    const result = await this.dbPool().query<{
      id: string;
      x_user_id: string;
      username: string;
      created_at: string;
      updated_at: string;
    }>(
      `
        SELECT id, x_user_id, username, created_at, updated_at
        FROM x_accounts
        WHERE workspace_id = $1
          AND is_active = true
        ORDER BY updated_at DESC;
      `,
      [workspaceId]
    );

    return result.rows;
  }

  async ingestTimeline(workspaceId: string, accountId: string, limit = 10) {
    const tokenResult = await this.dbPool().query<{ access_token_encrypted: string }>(
      `
        SELECT xt.access_token_encrypted
        FROM x_tokens xt
        JOIN x_accounts xa ON xa.id = xt.account_id
        WHERE xt.account_id = $1
          AND xa.workspace_id = $2
          AND xt.revoked_at IS NULL
        ORDER BY xt.created_at DESC
        LIMIT 1;
      `,
      [accountId, workspaceId]
    );

    if (!tokenResult.rows[0]) {
      throw new NotFoundException("No active X token found for account");
    }

    const accessToken = decryptSecret(tokenResult.rows[0].access_token_encrypted);
    const timeline = await this.xClient().fetchTimeline(accessToken, limit);

    const client = await this.dbPool().connect();
    try {
      await client.query("BEGIN");
      for (const post of timeline) {
        await client.query(
          `
            INSERT INTO x_timeline_posts (workspace_id, account_id, x_post_id, text_body, posted_at)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (account_id, x_post_id)
            DO UPDATE SET text_body = EXCLUDED.text_body, posted_at = EXCLUDED.posted_at;
          `,
          [workspaceId, accountId, post.xPostId, post.textBody, post.postedAt]
        );
      }

      await client.query(
        `
          INSERT INTO usage_events (workspace_id, account_id, event_type, endpoint_key, units, metadata)
          VALUES ($1, $2, 'x.timeline_ingest', 'timeline.read', $3, $4::jsonb);
        `,
        [workspaceId, accountId, timeline.length, JSON.stringify({ limit })]
      );

      await client.query(
        `
          INSERT INTO audit_logs (workspace_id, action, entity_type, entity_id, result, metadata)
          VALUES ($1, 'x.timeline_ingest', 'x_account', $2, 'success', $3::jsonb);
        `,
        [workspaceId, accountId, JSON.stringify({ insertedCount: timeline.length })]
      );

      await client.query("COMMIT");
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        this.logger.warn(
          `Failed to rollback timeline ingest transaction: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`
        );
      }
      throw error;
    } finally {
      client.release();
    }

    return {
      ok: true,
      insertedCount: timeline.length
    };
  }
}
