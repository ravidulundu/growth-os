import { Pool } from "pg";

let pool: Pool | undefined;

export function getPool() {
  if (!pool) {
    const connectionString =
      process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:55432/growth_os";
    pool = new Pool({
      connectionString,
      max: parseInt(process.env.PG_POOL_MAX ?? "20", 10),
      idleTimeoutMillis: parseInt(process.env.PG_POOL_IDLE_TIMEOUT_MS ?? "30000", 10),
      connectionTimeoutMillis: parseInt(process.env.PG_POOL_CONNECTION_TIMEOUT_MS ?? "10000", 10),
      statement_timeout: parseInt(process.env.PG_STATEMENT_TIMEOUT_MS ?? "30000", 10)
    });
  }

  return pool;
}

export async function closePool() {
  if (!pool) {
    return;
  }

  const currentPool = pool;
  pool = undefined;
  await currentPool.end();
}
