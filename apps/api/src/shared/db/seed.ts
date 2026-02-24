import { createHash } from "node:crypto";
import { Logger } from "@nestjs/common";
import type { Pool } from "pg";
import { closePool, getPool } from "./pool";
import { loadEnv } from "./env";

loadEnv();

const DB_SEED_SCOPE = "DBSeed";
const FOUNDER_EMAIL = "founder@example.com";
const FOUNDER_DISPLAY_NAME = "Founder";
const WORKSPACE_NAME = "Personal Workspace";
const WORKSPACE_PLAN_KEY = "mvp0";

const UPSERT_USER_SQL = `
  INSERT INTO users (email, email_hash, display_name)
  VALUES ($1, $2, $3)
  ON CONFLICT (email) DO UPDATE SET updated_at = now()
  RETURNING id;
`;

const UPSERT_WORKSPACE_SQL = `
  INSERT INTO workspaces (name, plan_key)
  VALUES ($1, $2)
  ON CONFLICT (name) DO UPDATE SET updated_at = now()
  RETURNING id;
`;

const UPSERT_MEMBERSHIP_SQL = `
  INSERT INTO workspace_members (workspace_id, user_id, role)
  VALUES ($1, $2, 'owner')
  ON CONFLICT (workspace_id, user_id) DO NOTHING;
`;

const UPSERT_PROMPT_TEMPLATES_SQL = `
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
`;

function computeEmailHash(email: string) {
  return createHash("sha256").update(email.toLowerCase()).digest("hex");
}

async function seedUsers(pool: Pool) {
  const userResult = await pool.query<{ id: string }>(UPSERT_USER_SQL, [
    FOUNDER_EMAIL,
    computeEmailHash(FOUNDER_EMAIL),
    FOUNDER_DISPLAY_NAME
  ]);
  const userRow = userResult.rows[0];
  if (!userRow) {
    throw new Error("Failed to seed user");
  }

  return userRow.id;
}

async function seedWorkspaces(pool: Pool) {
  const workspaceResult = await pool.query<{ id: string }>(UPSERT_WORKSPACE_SQL, [
    WORKSPACE_NAME,
    WORKSPACE_PLAN_KEY
  ]);
  const workspaceRow = workspaceResult.rows[0];
  if (!workspaceRow) {
    throw new Error("Failed to seed workspace");
  }

  return workspaceRow.id;
}

async function seedMembership(pool: Pool, workspaceId: string, userId: string) {
  await pool.query(UPSERT_MEMBERSHIP_SQL, [workspaceId, userId]);
}

async function seedPromptTemplates(pool: Pool, workspaceId: string) {
  await pool.query(UPSERT_PROMPT_TEMPLATES_SQL, [workspaceId]);
}

function logSeedComplete() {
  Logger.log(`Seed complete: ${FOUNDER_EMAIL} / ${WORKSPACE_NAME}`, DB_SEED_SCOPE);
}

async function main() {
  const pool = getPool();
  const userId = await seedUsers(pool);
  const workspaceId = await seedWorkspaces(pool);
  await seedMembership(pool, workspaceId, userId);
  await seedPromptTemplates(pool, workspaceId);
  logSeedComplete();
  await closePool();
}

main().catch(async (error) => {
  Logger.error("Seed failed", error, DB_SEED_SCOPE);
  await closePool();
  process.exit(1);
});
