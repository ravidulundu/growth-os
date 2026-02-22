import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { closePool, getPool } from "../../../shared/db/pool";
import { closeSchedulingQueues } from "../queue";
import { SchedulingService } from "../scheduling.service";

test("scheduling.publishNow.safeModeAndDedupe.integration", async (t) => {
  const previousSafeMode = process.env.SAFE_MODE_ENABLED;
  process.env.SAFE_MODE_ENABLED = "true";

  const pool = getPool();
  const service = new SchedulingService();
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;

  const workspaceResult = await pool.query<{ id: string }>(
    `
      INSERT INTO workspaces (name, plan_key)
      VALUES ($1, 'mvp0')
      RETURNING id;
    `,
    [`scheduling-integration-${suffix}`]
  );
  const workspaceId = workspaceResult.rows[0].id;

  const accountResult = await pool.query<{ id: string }>(
    `
      INSERT INTO x_accounts (workspace_id, x_user_id, username, is_active)
      VALUES ($1, $2, $3, true)
      RETURNING id;
    `,
    [workspaceId, `x-user-${suffix}`, `mock_${suffix}`]
  );
  const accountId = accountResult.rows[0].id;

  const contentResult = await pool.query<{ id: string }>(
    `
      INSERT INTO contents (
        workspace_id,
        account_id,
        type,
        status,
        topic,
        prompt_input,
        current_text
      )
      VALUES ($1, $2, 'tweet', 'draft', 'topic', 'topic', 'publish me')
      RETURNING id;
    `,
    [workspaceId, accountId]
  );
  const contentId = contentResult.rows[0].id;

  t.after(async () => {
    await closeSchedulingQueues();
    await pool.query("DELETE FROM workspaces WHERE id = $1", [workspaceId]);
    if (previousSafeMode === undefined) {
      delete process.env.SAFE_MODE_ENABLED;
    } else {
      process.env.SAFE_MODE_ENABLED = previousSafeMode;
    }
    await closePool();
  });

  await assert.rejects(
    () =>
      service.publishNow({
        workspaceId,
        accountId,
        contentId
      }),
    (error) =>
      error instanceof BadRequestException && error.message.includes("confirmHumanReview=true")
  );

  const first = await service.publishNow({
    workspaceId,
    accountId,
    contentId,
    dedupeKey: "dedupe-key-001",
    confirmHumanReview: true
  });

  assert.equal(first.ok, true);
  assert.match(first.publishJobId, /^[a-f0-9-]{36}$/i);

  const jobs = await service.listJobs(workspaceId);
  const scheduled = jobs.find((job) => job.id === first.publishJobId);
  assert.ok(scheduled);
  assert.equal(scheduled?.state, "queued");

  const contentStatus = await pool.query<{ status: string }>(
    `
      SELECT status
      FROM contents
      WHERE id = $1
      LIMIT 1;
    `,
    [contentId]
  );
  assert.equal(contentStatus.rows[0]?.status, "scheduled");

  await assert.rejects(
    () =>
      service.publishNow({
        workspaceId,
        accountId,
        contentId,
        dedupeKey: "dedupe-key-001",
        confirmHumanReview: true
      }),
    (error) => error instanceof ConflictException
  );
});
