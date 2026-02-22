import { Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { getPool } from "../../shared/db/pool";

@Injectable()
export class AuthService {
  async requestMagicLink(emailInput: string) {
    const email = emailInput.toLowerCase().trim();
    const token = randomBytes(24).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");

    await getPool().query(
      `
        INSERT INTO magic_link_tokens (email, token_hash, expires_at)
        VALUES ($1, $2, now() + interval '15 minutes');
      `,
      [email, tokenHash]
    );

    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    return {
      ok: true,
      message: "Magic link generated (stub)",
      magicLink: `${appUrl}/login?token=${token}`
    };
  }

  async verifyMagicLink(rawToken: string) {
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const client = await getPool().connect();

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
          DO UPDATE SET updated_at = now()
          RETURNING id;
        `,
        [tokenRow.email, emailHash]
      );

      await client.query("COMMIT");
      return {
        ok: true,
        userId: userResult.rows[0].id,
        sessionToken: randomBytes(32).toString("hex")
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
