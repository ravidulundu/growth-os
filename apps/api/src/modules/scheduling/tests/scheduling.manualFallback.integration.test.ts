import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { BadRequestException } from "@nestjs/common";
import { closePool, getPool } from "../../../shared/db/pool";
import { closeSchedulingQueues } from "../queue";
import { SchedulingService } from "../scheduling.service";

type ManualFallbackFixture = {
  previousNodeEnv: string | undefined;
  pool: ReturnType<typeof getPool>;
  service: SchedulingService;
  workspaceId: string;
  accountId: string;
  contentId: string;
};

async function setupFixture(): Promise<ManualFallbackFixture> {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "test";
  const pool = getPool();
  const service = new SchedulingService();
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;

  const workspaceResult = await pool.query<{ id: string }>(
    `
      INSERT INTO workspaces (name, plan_key)
      VALUES ($1, 'mvp0')
      RETURNING id;
    `,
    [`manual-fallback-it-${suffix}`]
  );
  const workspaceRow = workspaceResult.rows[0];
  assert.ok(workspaceRow, "workspace insert should return id");

  const accountResult = await pool.query<{ id: string }>(
    `
      INSERT INTO x_accounts (workspace_id, x_user_id, username, is_active)
      VALUES ($1, $2, $3, true)
      RETURNING id;
    `,
    [workspaceRow.id, `manual-x-${suffix}`, `manual_${suffix}`]
  );
  const accountRow = accountResult.rows[0];
  assert.ok(accountRow, "account insert should return id");

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
    [workspaceRow.id, accountRow.id, "manual topic", "manual prompt", "manual fallback text"]
  );
  const contentRow = contentResult.rows[0];
  assert.ok(contentRow, "content insert should return id");

  return {
    previousNodeEnv,
    pool,
    service,
    workspaceId: workspaceRow.id,
    accountId: accountRow.id,
    contentId: contentRow.id
  };
}

async function createFailedPublishJob(params: {
  pool: ReturnType<typeof getPool>;
  workspaceId: string;
  accountId: string;
  contentId: string;
  reasonCode: "POLICY_REJECTED" | "RATE_LIMIT" | "AUTH_FAILED";
}) {
  const result = await params.pool.query<{ id: string }>(
    `
      INSERT INTO publish_jobs (
        workspace_id,
        account_id,
        content_id,
        dedupe_key,
        state,
        run_at,
        next_run_at,
        last_error_code,
        last_error_message
      )
      VALUES ($1, $2, $3, $4, 'failed_permanent', now(), now(), $5, 'failed')
      RETURNING id;
    `,
    [
      params.workspaceId,
      params.accountId,
      params.contentId,
      `manual-fallback-${Date.now()}-${Math.floor(Math.random() * 10_000)}`,
      params.reasonCode
    ]
  );

  const row = result.rows[0];
  assert.ok(row, "publish job insert should return id");
  return row.id;
}

function registerCleanup(t: TestContext, fixture: ManualFallbackFixture) {
  t.after(async () => {
    await closeSchedulingQueues();
    await fixture.pool.query("DELETE FROM workspaces WHERE id = $1", [fixture.workspaceId]);
    if (fixture.previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = fixture.previousNodeEnv;
    }
    await closePool();
  });
}

async function assertManualFallbackPayload(fixture: ManualFallbackFixture, publishJobId: string) {
  const result = await fixture.service.createManualPublishFallback({
    workspaceId: fixture.workspaceId,
    contentId: fixture.contentId,
    publishJobId,
    reasonCode: "POLICY_REJECTED"
  });

  assert.equal(result.reason, "POLICY_REJECTED");
  assert.equal(result.plainText, "manual fallback text");
  assert.equal(result.reminderSent, false);
  assert.equal(result.reminderSkipped, false);
  assert.ok(
    result.composeUrl?.startsWith("https://twitter.com/intent/tweet?text=manual%20fallback%20text")
  );
}

async function assertReminderIdempotency(fixture: ManualFallbackFixture, publishJobId: string) {
  const first = await fixture.service.createManualPublishFallback({
    workspaceId: fixture.workspaceId,
    contentId: fixture.contentId,
    publishJobId,
    reasonCode: "POLICY_REJECTED",
    reminderEmail: "owner@example.com"
  });
  const second = await fixture.service.createManualPublishFallback({
    workspaceId: fixture.workspaceId,
    contentId: fixture.contentId,
    publishJobId,
    reasonCode: "POLICY_REJECTED",
    reminderEmail: "owner@example.com"
  });

  assert.equal(first.reminderSent, true);
  assert.equal(first.reminderSkipped, false);
  assert.equal(second.reminderSent, false);
  assert.equal(second.reminderSkipped, true);

  const notificationRows = await fixture.pool.query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM notification_log
      WHERE workspace_id = $1
        AND reference_id = $2
        AND notification_type = 'manual_publish_reminder'
        AND channel = 'email';
    `,
    [fixture.workspaceId, publishJobId]
  );
  assert.equal(Number(notificationRows.rows[0]?.count ?? 0), 1);
}

async function assertReasonValidation(fixture: ManualFallbackFixture) {
  await assert.rejects(
    () =>
      fixture.service.createManualPublishFallback({
        workspaceId: fixture.workspaceId,
        contentId: fixture.contentId,
        reasonCode: "UNKNOWN_REASON"
      }),
    (error) => error instanceof BadRequestException
  );
}

test("scheduling.manualFallback.integration", async (t) => {
  const fixture = await setupFixture();
  registerCleanup(t, fixture);
  const publishJobId = await createFailedPublishJob({
    pool: fixture.pool,
    workspaceId: fixture.workspaceId,
    accountId: fixture.accountId,
    contentId: fixture.contentId,
    reasonCode: "POLICY_REJECTED"
  });

  await assertManualFallbackPayload(fixture, publishJobId);
  await assertReminderIdempotency(fixture, publishJobId);
  await assertReasonValidation(fixture);
});
