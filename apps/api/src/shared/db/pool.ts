import { Pool } from "pg";

let pool: Pool | undefined;

function envInt(name: string, fallback: number, minValue = 0) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < minValue) {
    return fallback;
  }
  return parsed;
}

export function getPool() {
  if (!pool) {
    const connectionString =
      process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:55432/growth_os";
    pool = new Pool({
      connectionString,
      max: envInt("PG_POOL_MAX", 20, 1),
      idleTimeoutMillis: envInt("PG_POOL_IDLE_TIMEOUT_MS", 30_000),
      connectionTimeoutMillis: envInt("PG_POOL_CONNECTION_TIMEOUT_MS", 10_000),
      statement_timeout: envInt("PG_STATEMENT_TIMEOUT_MS", 30_000)
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
