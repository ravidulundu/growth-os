import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { getPool } from "../../shared/db/pool";
import { decryptSecret, encryptSecret } from "../../shared/security/token-vault";
import { getXClient } from "./x-client";
import type { XPostMetrics, XProfile, XTokenExchangeResult, XTimelinePost } from "./x-client";

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

type CompleteConnectParams = {
  workspaceId: string;
  state: string;
  code: string;
};

type CompetitorTimelinePost = XTimelinePost & {
  metrics: XPostMetrics;
};

type CompetitorTimelineResult = {
  handle: string;
  xUserId: string;
  username: string;
  requestedLimit: number;
  metricsCapturedCount: number;
  posts: CompetitorTimelinePost[];
};

const competitorTimelineMinLimit = 5;
const competitorTimelineMaxLimit = 20;
const competitorMetricsFetchLimit = 8;
const defaultCompetitorIngestMaxPerHour = 12;

function envPositiveInt(name: string, fallback: number) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}

function normalizeCompetitorHandle(handle: string) {
  return handle.trim().replace(/^@+/, "").toLowerCase();
}

function boundedCompetitorTimelineLimit(limit: number) {
  return Math.max(competitorTimelineMinLimit, Math.min(limit, competitorTimelineMaxLimit));
}

function emptyMetrics(): XPostMetrics {
  return {
    impressions: 0,
    likes: 0,
    replies: 0,
    reposts: 0,
    quotes: 0
  };
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

  private competitorIngestMaxPerHour() {
    return envPositiveInt("COMPETITOR_INGEST_MAX_PER_HOUR", defaultCompetitorIngestMaxPerHour);
  }

  private async assertCompetitorIngestBudget(workspaceId: string) {
    const limit = this.competitorIngestMaxPerHour();
    const result = await this.dbPool().query<{ ingest_count: number }>(
      `
        SELECT COUNT(*)::int AS ingest_count
        FROM audit_logs
        WHERE workspace_id = $1
          AND action = 'analytics.competitor_ingest'
          AND created_at >= now() - interval '1 hour';
      `,
      [workspaceId]
    );

    if ((result.rows[0]?.ingest_count ?? 0) >= limit) {
      throw new HttpException(
        "Competitor ingest budget exceeded for this workspace",
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
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

  protected async rollbackTransaction(client: PoolClient, context: string) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      this.logger.warn(
        `Failed to rollback ${context} transaction: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`
      );
    }
  }

  protected async validateCallback(params: {
    workspaceId: string;
    state: string;
  }): Promise<{ codeVerifier: string }> {
    const stateHash = base64UrlSha256(params.state);
    const stateClient = await this.dbPool().connect();

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

      const stateRow = stateResult.rows[0];
      if (!stateRow) {
        throw new UnauthorizedException("Invalid or expired OAuth state");
      }

      if (!stateRow.code_verifier_encrypted) {
        throw new UnauthorizedException("OAuth verifier missing or invalid");
      }

      const codeVerifier = decryptSecret(stateRow.code_verifier_encrypted);
      if (base64UrlSha256(codeVerifier) !== stateRow.code_verifier_hash) {
        throw new UnauthorizedException("OAuth verifier mismatch");
      }

      await stateClient.query("UPDATE x_oauth_states SET consumed_at = now() WHERE id = $1", [
        stateRow.id
      ]);
      await stateClient.query("COMMIT");
      return { codeVerifier };
    } catch (error) {
      await this.rollbackTransaction(stateClient, "OAuth state");
      throw error;
    } finally {
      stateClient.release();
    }
  }

  protected async exchangeToken(params: {
    code: string;
    codeVerifier: string;
  }): Promise<{ token: XTokenExchangeResult; profile: XProfile }> {
    // External API calls run outside DB transaction/row lock scope.
    const token = await this.xClient().exchangeCodeForToken(params.code, {
      codeVerifier: params.codeVerifier
    });
    const profile = await this.xClient().getProfile(token.accessToken);
    return { token, profile };
  }

  protected async persistConnection(params: {
    workspaceId: string;
    profile: XProfile;
    token: XTokenExchangeResult;
  }): Promise<{ accountId: string; username: string }> {
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
        [params.workspaceId, params.profile.xUserId, params.profile.username]
      );
      const accountRow = accountResult.rows[0];
      if (!accountRow) {
        throw new NotFoundException("Failed to create X account");
      }
      const accountId = accountRow.id;

      await client.query(
        "UPDATE x_tokens SET revoked_at = now() WHERE account_id = $1 AND revoked_at IS NULL",
        [accountId]
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
          accountId,
          encryptSecret(params.token.accessToken),
          encryptSecret(params.token.refreshToken),
          params.token.scopes,
          new Date(Date.now() + params.token.expiresInSeconds * 1000)
        ]
      );

      await client.query(
        `
          INSERT INTO audit_logs (workspace_id, action, entity_type, entity_id, result, metadata)
          VALUES ($1, 'x.connect', 'x_account', $2, 'success', $3::jsonb);
        `,
        [
          params.workspaceId,
          accountId,
          JSON.stringify({ username: params.profile.username, scopes: params.token.scopes })
        ]
      );

      await client.query("COMMIT");
      return {
        accountId,
        username: params.profile.username
      };
    } catch (error) {
      await this.rollbackTransaction(client, "X connect persistence");
      throw error;
    } finally {
      client.release();
    }
  }

  protected async lockActiveTokenForRefresh(
    client: PoolClient,
    accountId: string,
    workspaceId: string
  ) {
    const tokenResult = await client.query<{
      id: string;
      refresh_token_encrypted: string;
    }>(
      `
        SELECT xt.id, xt.refresh_token_encrypted
        FROM x_tokens xt
        JOIN x_accounts xa ON xa.id = xt.account_id
        WHERE xt.account_id = $1
          AND xa.workspace_id = $2
          AND xt.revoked_at IS NULL
        ORDER BY xt.created_at DESC
        LIMIT 1
        FOR UPDATE;
      `,
      [accountId, workspaceId]
    );

    return tokenResult.rows[0];
  }

  protected async persistRefreshedToken(params: {
    client: PoolClient;
    accountId: string;
    token: XTokenExchangeResult;
  }) {
    await params.client.query(
      "UPDATE x_tokens SET revoked_at = now() WHERE account_id = $1 AND revoked_at IS NULL",
      [params.accountId]
    );
    await params.client.query(
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
        params.accountId,
        encryptSecret(params.token.accessToken),
        encryptSecret(params.token.refreshToken),
        params.token.scopes,
        new Date(Date.now() + params.token.expiresInSeconds * 1000)
      ]
    );
  }

  async refreshAccessToken(
    accountId: string,
    workspaceId: string
  ): Promise<{ accessToken: string }> {
    const client = await this.dbPool().connect();
    try {
      await client.query("BEGIN");
      const tokenRow = await this.lockActiveTokenForRefresh(client, accountId, workspaceId);
      if (!tokenRow) {
        throw new NotFoundException("No active X token found for account");
      }

      const refreshToken = decryptSecret(tokenRow.refresh_token_encrypted);
      const refreshedToken = await this.xClient().refreshToken(refreshToken);
      await this.persistRefreshedToken({
        client,
        accountId,
        token: refreshedToken
      });
      await client.query(
        `
          INSERT INTO audit_logs (workspace_id, action, entity_type, entity_id, result, metadata)
          VALUES ($1, 'x.token_refresh', 'x_account', $2, 'success', $3::jsonb);
        `,
        [workspaceId, accountId, JSON.stringify({ scopes: refreshedToken.scopes })]
      );
      await client.query("COMMIT");
      return { accessToken: refreshedToken.accessToken };
    } catch (error) {
      await this.rollbackTransaction(client, "X token refresh");
      throw error;
    } finally {
      client.release();
    }
  }

  private async lockWorkspaceAccountForRevoke(
    client: PoolClient,
    workspaceId: string,
    accountId: string
  ) {
    const accountResult = await client.query<{ id: string }>(
      `
        SELECT id
        FROM x_accounts
        WHERE id = $1
          AND workspace_id = $2
        LIMIT 1
        FOR UPDATE;
      `,
      [accountId, workspaceId]
    );

    return accountResult.rows[0];
  }

  private async revokeAccountTokens(client: PoolClient, accountId: string) {
    const revokedTokens = await client.query<{ id: string }>(
      `
        UPDATE x_tokens
        SET revoked_at = now(),
            updated_at = now()
        WHERE account_id = $1
          AND revoked_at IS NULL
        RETURNING id;
      `,
      [accountId]
    );

    return revokedTokens.rowCount ?? revokedTokens.rows.length;
  }

  private async deactivateWorkspaceAccount(
    client: PoolClient,
    workspaceId: string,
    accountId: string
  ) {
    const deactivatedAccount = await client.query<{ id: string }>(
      `
        UPDATE x_accounts
        SET is_active = false,
            updated_at = now()
        WHERE id = $1
          AND workspace_id = $2
          AND is_active = true
        RETURNING id;
      `,
      [accountId, workspaceId]
    );

    return Boolean(deactivatedAccount.rows[0]);
  }

  async revokeAccount(workspaceId: string, accountId: string) {
    const client = await this.dbPool().connect();
    try {
      await client.query("BEGIN");
      const account = await this.lockWorkspaceAccountForRevoke(client, workspaceId, accountId);
      if (!account) {
        throw new NotFoundException("X account not found for workspace");
      }

      const revokedTokenCount = await this.revokeAccountTokens(client, accountId);
      const accountDeactivated = await this.deactivateWorkspaceAccount(
        client,
        workspaceId,
        accountId
      );
      await client.query(
        `
          INSERT INTO audit_logs (workspace_id, action, entity_type, entity_id, result, metadata)
          VALUES ($1, 'x.account_revoke', 'x_account', $2, 'success', $3::jsonb);
        `,
        [workspaceId, accountId, JSON.stringify({ revokedTokenCount, accountDeactivated })]
      );
      await client.query("COMMIT");

      return {
        ok: true,
        accountId,
        revokedTokenCount,
        accountDeactivated
      };
    } catch (error) {
      await this.rollbackTransaction(client, "X account revoke");
      throw error;
    } finally {
      client.release();
    }
  }

  async completeConnect(params: CompleteConnectParams) {
    const { codeVerifier } = await this.validateCallback({
      workspaceId: params.workspaceId,
      state: params.state
    });
    const { token, profile } = await this.exchangeToken({
      code: params.code,
      codeVerifier
    });
    const connection = await this.persistConnection({
      workspaceId: params.workspaceId,
      profile,
      token
    });

    return {
      ok: true,
      accountId: connection.accountId,
      username: connection.username
    };
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

  private async resolveWorkspaceAccessToken(workspaceId: string) {
    const tokenResult = await this.dbPool().query<{ access_token_encrypted: string }>(
      `
        SELECT xt.access_token_encrypted
        FROM x_tokens xt
        JOIN x_accounts xa ON xa.id = xt.account_id
        WHERE xa.workspace_id = $1
          AND xa.is_active = true
          AND xt.revoked_at IS NULL
        ORDER BY xt.created_at DESC
        LIMIT 1;
      `,
      [workspaceId]
    );

    const tokenRow = tokenResult.rows[0];
    if (!tokenRow) {
      throw new NotFoundException("No active X token found for workspace");
    }
    return decryptSecret(tokenRow.access_token_encrypted);
  }

  private async attachCompetitorMetrics(accessToken: string, timeline: XTimelinePost[]) {
    const metricFetchBudget = Math.min(timeline.length, competitorMetricsFetchLimit);
    let metricsCapturedCount = 0;
    const posts: CompetitorTimelinePost[] = [];

    for (const [index, post] of timeline.entries()) {
      if (index >= metricFetchBudget) {
        posts.push({ ...post, metrics: emptyMetrics() });
        continue;
      }

      try {
        const metrics = await this.xClient().fetchPostMetrics(accessToken, post.xPostId);
        posts.push({ ...post, metrics });
        metricsCapturedCount += 1;
      } catch (error) {
        this.logger.warn(
          `competitor metrics fetch failed for ${post.xPostId}: ${error instanceof Error ? error.message : String(error)}`
        );
        posts.push({ ...post, metrics: emptyMetrics() });
      }
    }

    return {
      posts,
      metricsCapturedCount
    };
  }

  async ingestCompetitorTimeline(
    workspaceId: string,
    handle: string,
    limit = 12
  ): Promise<CompetitorTimelineResult> {
    const normalizedHandle = normalizeCompetitorHandle(handle);
    if (!normalizedHandle) {
      throw new BadRequestException("Competitor handle is required");
    }

    const boundedLimit = boundedCompetitorTimelineLimit(limit);
    await this.assertCompetitorIngestBudget(workspaceId);
    const accessToken = await this.resolveWorkspaceAccessToken(workspaceId);
    const timeline = await this.xClient().fetchTimelineByHandle(
      accessToken,
      normalizedHandle,
      boundedLimit
    );
    const metrics = await this.attachCompetitorMetrics(accessToken, timeline.posts);

    return {
      handle: normalizedHandle,
      xUserId: timeline.profile.xUserId,
      username: timeline.profile.username,
      requestedLimit: boundedLimit,
      metricsCapturedCount: metrics.metricsCapturedCount,
      posts: metrics.posts
    };
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

    const tokenRow = tokenResult.rows[0];
    if (!tokenRow) {
      throw new NotFoundException("No active X token found for account");
    }

    const accessToken = decryptSecret(tokenRow.access_token_encrypted);
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
