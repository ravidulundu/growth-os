import {
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException
} from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import nodemailer from "nodemailer";
import { getPool } from "../../shared/db/pool";

export type MagicLinkRequestResponse = {
  ok: true;
  message: string;
};

export function buildMagicLinkRequestResponse(): MagicLinkRequestResponse {
  return {
    ok: true,
    message: "If the email is eligible, a magic link will be sent."
  };
}

export function buildSessionToken() {
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

function canLogMagicLinkToConsole() {
  return process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
}

function canLogFullMagicLinkToConsole() {
  return (process.env.AUTH_DEV_LOG_MAGIC_LINK_URL ?? "false").toLowerCase() === "true";
}

@Injectable()
export class AuthService {
  protected dbPool() {
    return getPool();
  }

  protected async sendMagicLink(email: string, token: string) {
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const magicLink = `${appUrl}/login?token=${encodeURIComponent(token)}`;
    const smtpHost = process.env.SMTP_HOST;

    if (!smtpHost) {
      if (!canLogMagicLinkToConsole()) {
        throw new InternalServerErrorException("Magic link delivery is not configured");
      }

      if (canLogFullMagicLinkToConsole()) {
        Logger.log(`[auth] dev magic link for ${email}: ${magicLink}`, "AuthService");
      } else {
        Logger.log(
          `[auth] dev magic link generated for ${email}. Set AUTH_DEV_LOG_MAGIC_LINK_URL=true to print full URL.`,
          "AuthService"
        );
      }
      return;
    }

    const smtpPort = Number(process.env.SMTP_PORT ?? 1025);
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const from = process.env.MAGIC_LINK_FROM_EMAIL ?? "no-reply@example.com";
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: false,
      auth: smtpUser && smtpPass ? { user: smtpUser, pass: smtpPass } : undefined
    });

    await transporter.sendMail({
      from,
      to: email,
      subject: "Your Growth OS magic link",
      text: `Use this link to sign in: ${magicLink}`
    });
  }

  protected async createMagicLinkToken(email: string, tokenHash: string) {
    const rawLimit = Number(process.env.AUTH_MAGIC_LINK_MAX_REQUESTS_PER_HOUR ?? 5);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : 5;
    const client = await this.dbPool().connect();

    try {
      await client.query("BEGIN");
      // Serialize requests per email to prevent TOCTOU bypass on count+insert checks.
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [email]);

      const countResult = await client.query<{ request_count: number }>(
        `
          SELECT COUNT(*)::int AS request_count
          FROM magic_link_tokens
          WHERE email = $1
            AND created_at > now() - interval '1 hour';
        `,
        [email]
      );

      const requestCount = Number(countResult.rows[0]?.request_count ?? 0);
      if (requestCount >= limit) {
        throw new HttpException(
          "Too many magic link requests. Please try again later.",
          HttpStatus.TOO_MANY_REQUESTS
        );
      }

      await client.query(
        `
          INSERT INTO magic_link_tokens (email, token_hash, expires_at)
          VALUES ($1, $2, now() + interval '15 minutes');
        `,
        [email, tokenHash]
      );

      await client.query("COMMIT");
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        Logger.error(
          "Failed to rollback createMagicLinkToken transaction",
          rollbackError,
          "AuthService"
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async requestMagicLink(emailInput: string) {
    const email = emailInput.toLowerCase().trim();
    const token = randomBytes(24).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    try {
      await this.createMagicLinkToken(email, tokenHash);
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === HttpStatus.TOO_MANY_REQUESTS) {
        return buildMagicLinkRequestResponse();
      }
      throw error;
    }

    try {
      await this.sendMagicLink(email, token);
    } catch (error) {
      try {
        await this.dbPool().query("DELETE FROM magic_link_tokens WHERE token_hash = $1", [
          tokenHash
        ]);
      } catch (deleteError) {
        Logger.error(
          "Failed to cleanup magic link token after send failure",
          deleteError,
          "AuthService"
        );
      }
      throw error;
    }

    return buildMagicLinkRequestResponse();
  }

  async verifyMagicLink(rawToken: string) {
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const client = await this.dbPool().connect();

    try {
      await client.query("BEGIN");
      const tokenResult = await client.query<{ id: string; email: string }>(
        `
          SELECT id, email
          FROM magic_link_tokens
          WHERE token_hash = $1
            AND consumed_at IS NULL
            AND expires_at > now()
          ORDER BY created_at DESC
          LIMIT 1
          FOR UPDATE;
        `,
        [tokenHash]
      );

      const tokenRow = tokenResult.rows[0];
      if (!tokenRow) {
        throw new UnauthorizedException("Invalid or expired magic link token");
      }

      await client.query("UPDATE magic_link_tokens SET consumed_at = now() WHERE id = $1", [
        tokenRow.id
      ]);

      const emailHash = createHash("sha256").update(tokenRow.email).digest("hex");
      const userResult = await client.query<{ id: string }>(
        `
          INSERT INTO users (email, email_hash)
          VALUES ($1, $2)
          ON CONFLICT (email)
          DO UPDATE SET email_hash = EXCLUDED.email_hash, updated_at = now()
          RETURNING id;
        `,
        [tokenRow.email, emailHash]
      );

      const { token: sessionToken, tokenHash: sessionTokenHash } = buildSessionToken();
      await client.query(
        `
          INSERT INTO auth_sessions (user_id, token_hash, expires_at)
          VALUES ($1, $2, now() + interval '30 days');
        `,
        [userResult.rows[0].id, sessionTokenHash]
      );

      await client.query("COMMIT");
      return {
        ok: true,
        userId: userResult.rows[0].id,
        sessionToken
      };
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        Logger.error(
          "Failed to rollback verifyMagicLink transaction",
          rollbackError,
          "AuthService"
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }
}
