import assert from "node:assert/strict";
import test from "node:test";
import { NotFoundException } from "@nestjs/common";
import { closePool, getPool } from "../../../shared/db/pool";
import { StyleService } from "../style.service";

test("style.extractAndGetProfile.integration", async (t) => {
  const previousProvider = process.env.LLM_PROVIDER;
  process.env.LLM_PROVIDER = "stub";

  const pool = getPool();
  const service = new StyleService();
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;

  const workspaceResult = await pool.query<{ id: string }>(
    `
      INSERT INTO workspaces (name, plan_key)
      VALUES ($1, 'mvp0')
      RETURNING id;
    `,
    [`style-it-${suffix}`]
  );
  const workspaceRow = workspaceResult.rows[0];
  assert.ok(workspaceRow, "workspace insert should return id");
  const workspaceId = workspaceRow.id;

  const accountResult = await pool.query<{ id: string }>(
    `
      INSERT INTO x_accounts (workspace_id, x_user_id, username, is_active)
      VALUES ($1, $2, $3, true)
      RETURNING id;
    `,
    [workspaceId, `style-user-${suffix}`, `style_${suffix}`]
  );
  const accountRow = accountResult.rows[0];
  assert.ok(accountRow, "account insert should return id");
  const accountId = accountRow.id;

  await pool.query(
    `
      INSERT INTO x_timeline_posts (workspace_id, account_id, x_post_id, text_body, posted_at)
      VALUES
        ($1, $2, $3, 'Kısa ve net bir mesaj #build', now() - interval '3 minutes'),
        ($1, $2, $4, 'Sade ilerle 🚀 ve paylaş.', now() - interval '2 minutes'),
        ($1, $2, $5, 'Daha fazlası için read docs.', now() - interval '1 minutes');
    `,
    [workspaceId, accountId, `post-a-${suffix}`, `post-b-${suffix}`, `post-c-${suffix}`]
  );

  t.after(async () => {
    if (previousProvider === undefined) {
      delete process.env.LLM_PROVIDER;
    } else {
      process.env.LLM_PROVIDER = previousProvider;
    }
    await pool.query("DELETE FROM workspaces WHERE id = $1", [workspaceId]);
    await closePool();
  });

  const extracted = await service.extractAndPersist(workspaceId, accountId, 3);
  assert.equal(extracted.ok, true);
  assert.equal(extracted.sourcePostCount, 3);
  assert.ok(extracted.profile.avgLength > 0);
  assert.equal(typeof extracted.profile.writingPersonality, "string");
  assert.ok((extracted.profile.writingPersonality?.length ?? 0) > 10);

  const stored = await service.getProfile(workspaceId, accountId);
  assert.ok(stored.updated_at);
  assert.equal(typeof stored.style_profile.avgLength, "number");
  assert.equal(typeof stored.style_profile.preferredTone, "string");
  assert.equal(typeof stored.style_profile.preferredFormat, "string");
  assert.equal(typeof stored.style_profile.languageRegister, "string");
  assert.ok(stored.style_profile.vocabulary.length > 0);
  assert.equal(stored.style_profile.hookPatterns.length, 10);
  assert.equal(stored.style_profile.doList.length, 8);
  assert.equal(stored.style_profile.dontList.length, 8);
  assert.ok(stored.style_profile.ctaPatterns.length > 0);
  assert.ok(stored.style_profile.sentenceRhythm.avgSentenceLength >= 0);
  assert.ok(stored.style_profile.brandSafetyNotes.length >= 2);
  assert.equal(typeof stored.style_profile.writingPersonality, "string");

  await assert.rejects(
    () => service.getProfile(workspaceId, "00000000-0000-4000-8000-000000000000"),
    (error) => error instanceof NotFoundException
  );
});
