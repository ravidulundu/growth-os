import { Logger } from "@nestjs/common";
import { loadEnv } from "./env";
import { getPool } from "./pool";

async function cleanupMagicLinkTokens() {
  loadEnv();
  const pool = getPool();

  try {
    const result = await pool.query<{ deleted_count: string }>(
      `
        WITH stale AS (
          SELECT id
          FROM magic_link_tokens
          WHERE expires_at < now() - interval '7 days'
             OR (consumed_at IS NOT NULL AND consumed_at < now() - interval '7 days')
          ORDER BY created_at ASC
          LIMIT 1000
        )
        DELETE FROM magic_link_tokens
        WHERE id IN (SELECT id FROM stale)
        RETURNING id;
      `
    );

    Logger.log(`Cleaned ${result.rowCount ?? 0} stale magic link token rows`, "DBCleanup");
  } finally {
    await pool.end();
  }
}

cleanupMagicLinkTokens().catch((error: unknown) => {
  Logger.error("Failed to cleanup stale magic link tokens", error, "DBCleanup");
  process.exitCode = 1;
});
