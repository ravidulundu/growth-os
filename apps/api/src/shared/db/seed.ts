import { createHash } from "node:crypto";
import { Logger } from "@nestjs/common";
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

  await pool.query(
    `
      INSERT INTO prompt_templates (
        workspace_id,
        name,
        content_type,
        system_prompt,
        user_prompt_template,
        prompt_config,
        is_active
      )
      VALUES
        (
          $1,
          'default-tweet',
          'tweet',
          'Write concise, practical Turkish posts with clear value.',
          'Türkçe tweet yaz. Konu: {{topic}}. Stil: {{style}}. Ek talimat: {{prompt_input}}.',
          '{"maxChars": 280}'::jsonb,
          true
        ),
        (
          $1,
          'default-thread',
          'thread',
          'Write structured 4-part Turkish threads with clear progression.',
          '4 parçalı thread yaz. Konu: {{topic}}. Stil: {{style}}. Ek talimat: {{prompt_input}}.',
          '{"parts": 4}'::jsonb,
          true
        ),
        (
          $1,
          'default-reply',
          'reply',
          'Write helpful and non-confrontational Turkish replies.',
          'Yapıcı bir reply yaz. Konu/bağlam: {{topic}}. Stil: {{style}}. Ek talimat: {{prompt_input}}.',
          '{"tone":"helpful"}'::jsonb,
          true
        ),
        (
          $1,
          'default-quote',
          'quote',
          'Write sharp Turkish quote-post commentary without misinformation.',
          'Quote tweet yorumu yaz. Konu/bağlam: {{topic}}. Stil: {{style}}. Ek talimat: {{prompt_input}}.',
          '{"tone":"insightful"}'::jsonb,
          true
        )
      ON CONFLICT (workspace_id, name)
      DO UPDATE SET
        content_type = EXCLUDED.content_type,
        system_prompt = EXCLUDED.system_prompt,
        user_prompt_template = EXCLUDED.user_prompt_template,
        prompt_config = EXCLUDED.prompt_config,
        is_active = EXCLUDED.is_active,
        updated_at = now();
    `,
    [workspaceResult.rows[0].id]
  );

  Logger.log("Seed complete: founder@example.com / Personal Workspace", "DBSeed");
  await closePool();
}

main().catch(async (error) => {
  Logger.error("Seed failed", error, "DBSeed");
  await closePool();
  process.exit(1);
});
