import assert from "node:assert/strict";
import test from "node:test";
import { NotFoundException } from "@nestjs/common";
import { closePool, getPool } from "../../../shared/db/pool";
import { XIntegrationService } from "../../x_integration/x-integration.service";
import { AnalyticsService } from "../analytics.service";

type DbPool = ReturnType<typeof getPool>;

type AnalyticsFixture = {
  workspaceId: string;
  accountId: string;
  contentId: string;
  publishedPostId: string;
  externalPostId: string;
};

type PublishJobInput = {
  workspaceId: string;
  accountId: string;
  contentId: string;
  suffix: string;
};

type PublishedPostInput = {
  workspaceId: string;
  accountId: string;
  contentId: string;
  publishJobId: string;
  externalPostId: string;
};

function buildSuffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
}

async function insertWorkspace(pool: DbPool, suffix: string): Promise<string> {
  const workspaceResult = await pool.query<{ id: string }>(
    `
      INSERT INTO workspaces (name, plan_key)
      VALUES ($1, 'mvp0')
      RETURNING id;
    `,
    [`analytics-it-${suffix}`]
  );
  const workspaceRow = workspaceResult.rows[0];
  assert.ok(workspaceRow, "workspace insert should return id");
  return workspaceRow.id;
}

async function insertAccount(pool: DbPool, workspaceId: string, suffix: string): Promise<string> {
  const accountResult = await pool.query<{ id: string }>(
    `
      INSERT INTO x_accounts (workspace_id, x_user_id, username, is_active)
      VALUES ($1, $2, $3, true)
      RETURNING id;
    `,
    [workspaceId, `analytics-user-${suffix}`, `ana_${suffix}`]
  );
  const accountRow = accountResult.rows[0];
  assert.ok(accountRow, "account insert should return id");
  return accountRow.id;
}

async function insertContent(
  pool: DbPool,
  workspaceId: string,
  accountId: string
): Promise<string> {
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
      VALUES ($1, $2, 'tweet', 'published', 'topic', 'prompt', 'text')
      RETURNING id;
    `,
    [workspaceId, accountId]
  );
  const contentRow = contentResult.rows[0];
  assert.ok(contentRow, "content insert should return id");
  return contentRow.id;
}

async function insertPublishJob(pool: DbPool, input: PublishJobInput): Promise<string> {
  const jobResult = await pool.query<{ id: string }>(
    `
      INSERT INTO publish_jobs (
        workspace_id,
        account_id,
        content_id,
        dedupe_key,
        state,
        run_at,
        next_run_at,
        completed_at
      )
      VALUES ($1, $2, $3, $4, 'completed', now(), now(), now())
      RETURNING id;
    `,
    [input.workspaceId, input.accountId, input.contentId, `analytics-dedupe-${input.suffix}`]
  );
  const jobRow = jobResult.rows[0];
  assert.ok(jobRow, "publish job insert should return id");
  return jobRow.id;
}

async function insertPublishedPost(pool: DbPool, input: PublishedPostInput): Promise<string> {
  const publishedResult = await pool.query<{ id: string }>(
    `
      INSERT INTO published_posts (
        workspace_id,
        account_id,
        content_id,
        publish_job_id,
        external_post_id,
        published_at
      )
      VALUES ($1, $2, $3, $4, $5, now())
      RETURNING id;
    `,
    [input.workspaceId, input.accountId, input.contentId, input.publishJobId, input.externalPostId]
  );
  const publishedRow = publishedResult.rows[0];
  assert.ok(publishedRow, "published post insert should return id");
  return publishedRow.id;
}

async function insertMetricSnapshots(
  pool: DbPool,
  workspaceId: string,
  publishedPostId: string,
  externalPostId: string
): Promise<void> {
  await pool.query(
    `
      INSERT INTO post_metric_snapshots (
        workspace_id,
        published_post_id,
        x_post_id,
        window_key,
        impressions,
        likes,
        replies,
        reposts,
        quotes,
        metrics_snapshot,
        captured_at
      )
      VALUES
        ($1, $2, $3, 't15', 100, 10, 1, 2, 0, '{}'::jsonb, now() - interval '2 minutes'),
        ($1, $2, $3, 't60', 250, 25, 3, 5, 1, '{}'::jsonb, now() - interval '1 minutes');
    `,
    [workspaceId, publishedPostId, externalPostId]
  );
}

async function createFixture(pool: DbPool): Promise<AnalyticsFixture> {
  const suffix = buildSuffix();
  const workspaceId = await insertWorkspace(pool, suffix);
  const accountId = await insertAccount(pool, workspaceId, suffix);
  const contentId = await insertContent(pool, workspaceId, accountId);
  const publishJobId = await insertPublishJob(pool, {
    workspaceId,
    accountId,
    contentId,
    suffix
  });
  const externalPostId = `x-post-${suffix}`;
  const publishedPostId = await insertPublishedPost(pool, {
    workspaceId,
    accountId,
    contentId,
    publishJobId,
    externalPostId
  });
  await insertMetricSnapshots(pool, workspaceId, publishedPostId, externalPostId);
  return { workspaceId, accountId, contentId, publishedPostId, externalPostId };
}

async function assertSnapshotsForPublishedPost(
  service: AnalyticsService,
  fixture: AnalyticsFixture
): Promise<void> {
  const byPublished = await service.getSnapshotsForPublishedPost(
    fixture.workspaceId,
    fixture.publishedPostId
  );
  assert.equal(byPublished.publishedPostId, fixture.publishedPostId);
  assert.equal(byPublished.snapshots.length, 2);
  const [firstSnapshot, secondSnapshot] = byPublished.snapshots;
  assert.ok(firstSnapshot, "first snapshot should exist");
  assert.ok(secondSnapshot, "second snapshot should exist");
  assert.equal(firstSnapshot.window_key, "t15");
  assert.equal(secondSnapshot.window_key, "t60");
}

async function assertSnapshotsForContent(
  service: AnalyticsService,
  fixture: AnalyticsFixture
): Promise<void> {
  const byContent = await service.getSnapshotsForContent(fixture.workspaceId, fixture.contentId);
  assert.equal(byContent.publishedPostId, fixture.publishedPostId);
  assert.equal(byContent.externalPostId, fixture.externalPostId);
}

async function assertFirstHourAlertOk(
  service: AnalyticsService,
  fixture: AnalyticsFixture
): Promise<void> {
  const firstHour = await service.getFirstHourAlertForContent(
    fixture.workspaceId,
    fixture.contentId
  );
  assert.equal(firstHour.level, "ok");
  assert.equal(firstHour.windowKey, "t60");
  assert.ok(firstHour.engagementRate > 0);
}

async function updateFirstHourMetricsToCritical(
  pool: DbPool,
  fixture: AnalyticsFixture
): Promise<void> {
  await pool.query(
    `
      UPDATE post_metric_snapshots
      SET impressions = 50,
          likes = 1,
          replies = 0,
          reposts = 0,
          quotes = 0
      WHERE workspace_id = $1
        AND published_post_id = $2
        AND window_key = 't60';
    `,
    [fixture.workspaceId, fixture.publishedPostId]
  );
}

async function assertFirstHourAlertCritical(
  service: AnalyticsService,
  fixture: AnalyticsFixture
): Promise<void> {
  const degraded = await service.getFirstHourAlertForContent(
    fixture.workspaceId,
    fixture.contentId
  );
  assert.equal(degraded.level, "critical");
  assert.ok(degraded.reasons.includes("critical_impressions"));
  assert.ok(degraded.reasons.includes("low_engagement_rate"));
}

async function assertMissingPublishedPostThrows(
  service: AnalyticsService,
  fixture: AnalyticsFixture
): Promise<void> {
  await assert.rejects(
    () =>
      service.getSnapshotsForPublishedPost(
        fixture.workspaceId,
        "00000000-0000-4000-8000-000000000000"
      ),
    (error) => error instanceof NotFoundException
  );
}

test("analytics.getSnapshots.integration", async (t) => {
  const pool = getPool();
  const service = new AnalyticsService(new XIntegrationService());
  const fixture = await createFixture(pool);

  t.after(async () => {
    await pool.query("DELETE FROM workspaces WHERE id = $1", [fixture.workspaceId]);
    await closePool();
  });

  await assertSnapshotsForPublishedPost(service, fixture);
  await assertSnapshotsForContent(service, fixture);
  await assertFirstHourAlertOk(service, fixture);
  await updateFirstHourMetricsToCritical(pool, fixture);
  await assertFirstHourAlertCritical(service, fixture);
  await assertMissingPublishedPostThrows(service, fixture);
});
