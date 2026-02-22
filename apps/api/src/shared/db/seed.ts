import { createHash } from "node:crypto";
import { closePool, getPool } from "./pool";
import { loadEnv } from "./env";

loadEnv();

async function main() {
  const pool = getPool();
  const email = "founder@example.com";
  const emailHash = createHash("sha256").update(email.toLowerCase()).digest("hex");

  const userResult = await pool.query<{ id: string }>(
    `
      INSERT INTO users (email, email_hash, display_name)
      VALUES ($1, $2, 'Founder')
      ON CONFLICT (email) DO UPDATE SET updated_at = now()
      RETURNING id;
    `,
    [email, emailHash]
  );

  const workspaceResult = await pool.query<{ id: string }>(
    `
      INSERT INTO workspaces (name, plan_key)
      VALUES ('Personal Workspace', 'mvp0')
      ON CONFLICT (name) DO UPDATE SET updated_at = now()
      RETURNING id;
    `
  );

  await pool.query(
    `
      INSERT INTO workspace_members (workspace_id, user_id, role)
      VALUES ($1, $2, 'owner')
      ON CONFLICT (workspace_id, user_id) DO NOTHING;
    `,
    [workspaceResult.rows[0].id, userResult.rows[0].id]
  );

  console.log("Seed complete: founder@example.com / Personal Workspace");
  await closePool();
}

main().catch(async (error) => {
  console.error("Seed failed", error);
  await closePool();
  process.exit(1);
});
