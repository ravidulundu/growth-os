import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { closePool, getPool } from "../../../shared/db/pool";
import { closeSchedulingQueues } from "../queue";
import { SchedulingService } from "../scheduling.service";

type SchedulingSeriesFixture = {
  previousSafeMode: string | undefined;
  pool: ReturnType<typeof getPool>;
  service: SchedulingService;
  workspaceId: string;
  accountId: string;
};

async function createDraftContent(params: {
  pool: ReturnType<typeof getPool>;
  workspaceId: string;
  accountId: string;
  suffix: string;
}) {
  const result = await params.pool.query<{ id: string }>(
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
    [
      params.workspaceId,
      params.accountId,
      `series-content-${params.suffix}`,
      `prompt-${params.suffix}`,
      `draft-${params.suffix}`
    ]
  );
  const row = result.rows[0];
  assert.ok(row, "content insert should return id");
  return row.id;
}

async function createSeriesWithItem(params: {
  pool: ReturnType<typeof getPool>;
  workspaceId: string;
  accountId: string;
  contentId: string;
  suffix: string;
  isActive: boolean;
  enqueueNextOnPublish: boolean;
}) {
  const seriesResult = await params.pool.query<{ id: string }>(
    `
      INSERT INTO content_series (
        workspace_id,
        account_id,
        name,
        cadence,
        is_active,
        enqueue_next_on_publish
      )
      VALUES ($1, $2, $3, 'daily', $4, $5)
      RETURNING id;
    `,
    [
      params.workspaceId,
      params.accountId,
      `series-${params.suffix}`,
      params.isActive,
      params.enqueueNextOnPublish
    ]
  );
  const seriesRow = seriesResult.rows[0];
  assert.ok(seriesRow, "series insert should return id");

  const itemResult = await params.pool.query<{ id: string }>(
    `
      INSERT INTO content_series_items (series_id, content_id, position, state)
      VALUES ($1, $2, 1, 'pending')
      RETURNING id;
    `,
    [seriesRow.id, params.contentId]
  );
  const itemRow = itemResult.rows[0];
  assert.ok(itemRow, "series item insert should return id");

  return { seriesId: seriesRow.id, seriesItemId: itemRow.id };
}

async function setupSchedulingSeriesFixture(): Promise<SchedulingSeriesFixture> {
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
    [`scheduling-series-it-${suffix}`]
  );
  const workspaceRow = workspaceResult.rows[0];
  assert.ok(workspaceRow, "workspace insert should return id");

  const accountResult = await pool.query<{ id: string }>(
    `
      INSERT INTO x_accounts (workspace_id, x_user_id, username, is_active)
      VALUES ($1, $2, $3, true)
      RETURNING id;
    `,
    [workspaceRow.id, `series-account-${suffix}`, `series_acc_${suffix}`]
  );
  const accountRow = accountResult.rows[0];
  assert.ok(accountRow, "account insert should return id");

  return {
    previousSafeMode,
    pool,
    service,
    workspaceId: workspaceRow.id,
    accountId: accountRow.id
  };
}

function registerSchedulingSeriesCleanup(t: TestContext, fixture: SchedulingSeriesFixture) {
  t.after(async () => {
    await closeSchedulingQueues();
    await fixture.pool.query("DELETE FROM workspaces WHERE id = $1", [fixture.workspaceId]);
    if (fixture.previousSafeMode === undefined) {
      delete process.env.SAFE_MODE_ENABLED;
    } else {
      process.env.SAFE_MODE_ENABLED = fixture.previousSafeMode;
    }
    await closePool();
  });
}

async function assertManualSeriesEnqueueSuccess(fixture: SchedulingSeriesFixture) {
  const suffix = `${Date.now()}-manual`;
  const contentId = await createDraftContent({
    pool: fixture.pool,
    workspaceId: fixture.workspaceId,
    accountId: fixture.accountId,
    suffix
  });
  const { seriesId, seriesItemId } = await createSeriesWithItem({
    pool: fixture.pool,
    workspaceId: fixture.workspaceId,
    accountId: fixture.accountId,
    contentId,
    suffix,
    isActive: true,
    enqueueNextOnPublish: true
  });

  const runAt = new Date("2030-01-01T10:00:00.000Z");
  const first = await fixture.service.enqueueSeriesNextItem({ seriesId, runAt });
  assert.equal(first.ok, true);
  assert.equal(first.deduped, false);
  if (!first.ok || first.deduped) {
    assert.fail("expected successful non-deduped enqueue");
  }
  assert.equal(first.scheduledFor, runAt.toISOString());

  const stateResult = await fixture.pool.query<{ state: string }>(
    "SELECT state FROM content_series_items WHERE id = $1 LIMIT 1;",
    [seriesItemId]
  );
  assert.equal(stateResult.rows[0]?.state, "queued");

  await fixture.pool.query("UPDATE content_series_items SET state = 'published' WHERE id = $1;", [
    seriesItemId
  ]);
  const second = await fixture.service.enqueueSeriesNextItem({ seriesId, runAt });
  assert.equal(second.ok, true);
  assert.equal(second.deduped, true);
  if (!second.ok || !second.deduped) {
    assert.fail("expected deduped enqueue response");
  }
  assert.equal(second.dedupeKey, first.dedupeKey);
}

async function assertPublishSuccessGuard(fixture: SchedulingSeriesFixture) {
  const suffix = `${Date.now()}-guard`;
  const contentId = await createDraftContent({
    pool: fixture.pool,
    workspaceId: fixture.workspaceId,
    accountId: fixture.accountId,
    suffix
  });
  const { seriesId } = await createSeriesWithItem({
    pool: fixture.pool,
    workspaceId: fixture.workspaceId,
    accountId: fixture.accountId,
    contentId,
    suffix,
    isActive: true,
    enqueueNextOnPublish: false
  });

  const guarded = await fixture.service.enqueueSeriesNextItem({
    seriesId,
    trigger: "publish_success"
  });
  assert.equal(guarded.ok, false);
  if (guarded.ok) {
    assert.fail("expected enqueue_next_disabled branch");
  }
  assert.equal(guarded.reason, "enqueue_next_disabled");
}

test("scheduling.series.integration", async (t) => {
  const fixture = await setupSchedulingSeriesFixture();
  registerSchedulingSeriesCleanup(t, fixture);

  await assertManualSeriesEnqueueSuccess(fixture);
  await assertPublishSuccessGuard(fixture);
});
