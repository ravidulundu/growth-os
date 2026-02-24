import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { closePool, getPool } from "../../../shared/db/pool";
import { closeSchedulingQueues } from "../queue";
import { SchedulingService } from "../scheduling.service";

type SchedulingFixture = {
  previousSafeMode: string | undefined;
  pool: ReturnType<typeof getPool>;
  service: SchedulingService;
  workspaceId: string;
  accountId: string;
  contentId: string;
};

type ContentSeedInput = {
  pool: ReturnType<typeof getPool>;
  workspaceId: string;
  accountId: string;
  topic: string;
  promptInput: string;
  currentText: string;
};

type PublishContext = {
  service: SchedulingService;
  pool: ReturnType<typeof getPool>;
  workspaceId: string;
  accountId: string;
  contentId: string;
};

async function createDraftContent(input: ContentSeedInput): Promise<string> {
  const { pool, workspaceId, accountId, topic, promptInput, currentText } = input;
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
      VALUES ($1, $2, 'tweet', 'draft', $3, $4, $5)
      RETURNING id;
    `,
    [workspaceId, accountId, topic, promptInput, currentText]
  );
  const contentRow = contentResult.rows[0];
  assert.ok(contentRow, "content insert should return id");
  return contentRow.id;
}

async function setupSchedulingFixture(): Promise<SchedulingFixture> {
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
  const workspaceRow = workspaceResult.rows[0];
  assert.ok(workspaceRow, "workspace insert should return id");
  const workspaceId = workspaceRow.id;

  const accountResult = await pool.query<{ id: string }>(
    `
      INSERT INTO x_accounts (workspace_id, x_user_id, username, is_active)
      VALUES ($1, $2, $3, true)
      RETURNING id;
    `,
    [workspaceId, `x-user-${suffix}`, `mock_${suffix}`]
  );
  const accountRow = accountResult.rows[0];
  assert.ok(accountRow, "account insert should return id");
  const accountId = accountRow.id;

  const contentId = await createDraftContent({
    pool,
    workspaceId,
    accountId,
    topic: "topic",
    promptInput: "topic",
    currentText: "publish me"
  });

  return {
    previousSafeMode,
    pool,
    service,
    workspaceId,
    accountId,
    contentId
  };
}

function registerSchedulingCleanup(t: TestContext, fixture: SchedulingFixture): void {
  const { previousSafeMode, pool, workspaceId } = fixture;

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
}

async function assertSafeModeRequiresReview(
  service: SchedulingService,
  workspaceId: string,
  accountId: string,
  contentId: string
): Promise<void> {
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
}

async function assertExplicitDedupeFlow(context: PublishContext): Promise<void> {
  const { service, pool, workspaceId, accountId, contentId } = context;
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
  const statusRow = contentStatus.rows[0];
  assert.ok(statusRow, "content status row should exist");
  assert.equal(statusRow.status, "scheduled");

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
}

async function assertImplicitDedupeFlow(
  service: SchedulingService,
  pool: ReturnType<typeof getPool>,
  workspaceId: string,
  accountId: string
): Promise<void> {
  const implicitContentId = await createDraftContent({
    pool,
    workspaceId,
    accountId,
    topic: "topic-implicit",
    promptInput: "topic-implicit",
    currentText: "publish me implicitly"
  });

  const implicitFirst = await service.publishNow({
    workspaceId,
    accountId,
    contentId: implicitContentId,
    confirmHumanReview: true
  });
  assert.equal(implicitFirst.ok, true);

  await assert.rejects(
    () =>
      service.publishNow({
        workspaceId,
        accountId,
        contentId: implicitContentId,
        confirmHumanReview: true
      }),
    (error) => error instanceof ConflictException
  );
}

test("scheduling.publishNow.safeModeAndDedupe.integration", async (t) => {
  const fixture = await setupSchedulingFixture();
  registerSchedulingCleanup(t, fixture);

  await assertSafeModeRequiresReview(
    fixture.service,
    fixture.workspaceId,
    fixture.accountId,
    fixture.contentId
  );
  await assertExplicitDedupeFlow({
    service: fixture.service,
    pool: fixture.pool,
    workspaceId: fixture.workspaceId,
    accountId: fixture.accountId,
    contentId: fixture.contentId
  });
  await assertImplicitDedupeFlow(
    fixture.service,
    fixture.pool,
    fixture.workspaceId,
    fixture.accountId
  );
});
