import { Pool } from "pg";

let pool: Pool | undefined;

export function getPool() {
  if (!pool) {
    const connectionString =
      process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:55432/growth_os";
    pool = new Pool({ connectionString });
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
