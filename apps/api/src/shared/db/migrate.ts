import fs from "node:fs";
import path from "node:path";
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
}

async function appliedFiles(): Promise<Set<string>> {
  const pool = getPool();
  const result = await pool.query<{ file_name: string }>("SELECT file_name FROM schema_migrations");
  return new Set(result.rows.map((row: { file_name: string }) => row.file_name));
}

async function applyMigration(fileName: string, sql: string) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations(file_name) VALUES ($1)", [fileName]);
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
    if (alreadyApplied.has(file)) {
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    await applyMigration(file, sql);
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
