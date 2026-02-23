import assert from "node:assert/strict";
import test from "node:test";
import { NotFoundException } from "@nestjs/common";
import { closePool, getPool } from "../../../shared/db/pool";
import { AnalyticsService } from "../analytics.service";

test("analytics.getSnapshots.integration", async (t) => {
  const pool = getPool();
  const service = new AnalyticsService();
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;

  const workspaceResult = await pool.query<{ id: string }>(
    `
      INSERT INTO workspaces (name, plan_key)
      VALUES ($1, 'mvp0')
      RETURNING id;
    `,
    [`analytics-it-${suffix}`]
  );
  const workspaceId = workspaceResult.rows[0].id;

  const accountResult = await pool.query<{ id: string }>(
    `
      INSERT INTO x_accounts (workspace_id, x_user_id, username, is_active)
      VALUES ($1, $2, $3, true)
      RETURNING id;
    `,
    [workspaceId, `analytics-user-${suffix}`, `ana_${suffix}`]
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
      VALUES ($1, $2, 'tweet', 'published', 'topic', 'prompt', 'text')
      RETURNING id;
    `,
    [workspaceId, accountId]
  );
  const contentId = contentResult.rows[0].id;

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
    [workspaceId, accountId, contentId, `analytics-dedupe-${suffix}`]
  );
  const publishJobId = jobResult.rows[0].id;

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
    [workspaceId, accountId, contentId, publishJobId, `x-post-${suffix}`]
  );
  const publishedPostId = publishedResult.rows[0].id;

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
    [workspaceId, publishedPostId, `x-post-${suffix}`]
  );

  t.after(async () => {
    await pool.query("DELETE FROM workspaces WHERE id = $1", [workspaceId]);
    await closePool();
  });

  const byPublished = await service.getSnapshotsForPublishedPost(workspaceId, publishedPostId);
  assert.equal(byPublished.publishedPostId, publishedPostId);
  assert.equal(byPublished.snapshots.length, 2);
  assert.equal(byPublished.snapshots[0].window_key, "t15");
  assert.equal(byPublished.snapshots[1].window_key, "t60");

  const byContent = await service.getSnapshotsForContent(workspaceId, contentId);
  assert.equal(byContent.publishedPostId, publishedPostId);
  assert.equal(byContent.externalPostId, `x-post-${suffix}`);

  const firstHour = await service.getFirstHourAlertForContent(workspaceId, contentId);
  assert.equal(firstHour.level, "ok");
  assert.equal(firstHour.windowKey, "t60");
  assert.ok(firstHour.engagementRate > 0);

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
    [workspaceId, publishedPostId]
  );

  const degraded = await service.getFirstHourAlertForContent(workspaceId, contentId);
  assert.equal(degraded.level, "critical");
  assert.ok(degraded.reasons.includes("critical_impressions"));
  assert.ok(degraded.reasons.includes("low_engagement_rate"));

  await assert.rejects(
    () => service.getSnapshotsForPublishedPost(workspaceId, "00000000-0000-4000-8000-000000000000"),
    (error) => error instanceof NotFoundException
  );
});
