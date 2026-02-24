import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { Logger } from "@nestjs/common";
import { closePool, getPool } from "./pool";
import { findRepoRoot } from "./repo-root";
import { loadEnv } from "./env";

loadEnv();

async function ensureMigrationsTable() {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      file_name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    ALTER TABLE schema_migrations
      ADD COLUMN IF NOT EXISTS checksum TEXT;
  `);
}

function fileChecksum(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

async function appliedFiles(): Promise<Map<string, string | null>> {
  const pool = getPool();
  const result = await pool.query<{ file_name: string; checksum: string | null }>(
    "SELECT file_name, checksum FROM schema_migrations"
  );
  return new Map(
    result.rows.map((row: { file_name: string; checksum: string | null }) => [
      row.file_name,
      row.checksum
    ])
  );
}

async function applyMigration(fileName: string, sql: string, checksum: string) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations(file_name, checksum) VALUES ($1, $2)", [
      fileName,
      checksum
    ]);
    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      Logger.error("Migration rollback failed", rollbackError, "DBMigrate");
    }
    throw error;
  } finally {
    client.release();
  }
}

async function backfillMigrationChecksum(fileName: string, checksum: string) {
  const pool = getPool();
  await pool.query(
    `
      UPDATE schema_migrations
      SET checksum = $2
      WHERE file_name = $1
        AND checksum IS NULL;
    `,
    [fileName, checksum]
  );
}

async function main() {
  const root = findRepoRoot();
  const migrationsDir = path.join(root, "packages", "db", "migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  await ensureMigrationsTable();
  const alreadyApplied = await appliedFiles();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    const computedChecksum = fileChecksum(sql);
    const storedChecksum = alreadyApplied.get(file);

    if (storedChecksum === null) {
      await backfillMigrationChecksum(file, computedChecksum);
      Logger.log(`Backfilled checksum for ${file}`, "DBMigrate");
      continue;
    }

    if (typeof storedChecksum === "string") {
      if (storedChecksum !== computedChecksum) {
        throw new Error(
          `Checksum mismatch for ${file}: expected ${storedChecksum}, got ${computedChecksum}. Migration file was modified after application.`
        );
      }
      continue;
    }

    await applyMigration(file, sql, computedChecksum);
    Logger.log(`Applied migration: ${file}`, "DBMigrate");
  }

  Logger.log("Migration complete", "DBMigrate");
  await closePool();
}

main().catch(async (error) => {
  Logger.error("Migration failed", error, "DBMigrate");
  await closePool();
  process.exit(1);
});
