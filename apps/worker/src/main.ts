import { createHash } from "node:crypto";
import { Queue, QueueEvents, Worker } from "bullmq";
import { config } from "dotenv";
import {
  calculateBackoffDelayMs,
  cosineSimilarity,
  createLogger,
  decryptSecret as decryptSecretWithKey,
  nextSchedulerState,
  type SchedulerState
} from "@growth-os/shared";
import { Pool } from "pg";

config();

const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:55432/growth_os";
const publishQueueName = "publish-jobs";
const metricsQueueName = "metrics-jobs";
const logger = createLogger("worker");

function getRedisUrl() {
  return process.env.REDIS_URL ?? "redis://localhost:56379";
}

function sanitizeRedisUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    parsed.username = parsed.username ? "***" : "";
    parsed.password = parsed.password ? "***" : "";
    return parsed.toString();
  } catch {
    return "<invalid-redis-url>";
  }
}

function xClientMode() {
  return (process.env.X_CLIENT_MODE ?? "mock").trim().toLowerCase();
}

function assertSupportedXClientMode() {
  const mode = xClientMode();
  const nodeEnv = process.env.NODE_ENV?.trim().toLowerCase();
  if (nodeEnv === "production" && mode === "mock") {
    throw new Error("X_CLIENT_MODE=mock is not allowed in production worker.");
  }
  if (mode !== "mock") {
    throw new Error(`Unsupported worker X client mode: ${mode}`);
  }
}

assertSupportedXClientMode();

function redisConnectionOptions() {
  const rawUrl = getRedisUrl();
  const parsed = new URL(rawUrl);
  const parsedDb = parsed.pathname.replace(/^\/+/, "").split("/")[0]?.trim();
  const explicitPort = Number(parsed.port);
  const port = Number.isFinite(explicitPort) && explicitPort > 0 ? explicitPort : 6379;
  const db = parsedDb ? Number(parsedDb) : 0;

  const options = {
    host: parsed.hostname,
    port,
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    db: Number.isFinite(db) && db >= 0 ? db : 0,
    maxRetriesPerRequest: null as null,
    enableReadyCheck: true
  };

  if (parsed.protocol === "rediss:") {
    return {
      ...options,
      tls: {}
    };
  }

  return options;
}

const dbPool = new Pool({ connectionString: databaseUrl });
const publishQueue = new Queue(publishQueueName, { connection: redisConnectionOptions() });
const metricsQueue = new Queue(metricsQueueName, { connection: redisConnectionOptions() });

type XPublishResult = {
  externalPostId: string;
  publishedAt: Date;
};

type XPostMetrics = {
  impressions: number;
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
};

const schedulerStates: SchedulerState[] = [
  "queued",
  "in_progress",
  "retry_wait",
  "completed",
  "failed_permanent",
  "cancelled"
];

function isSchedulerState(value: string): value is SchedulerState {
  return schedulerStates.includes(value as SchedulerState);
}

function assertSchedulerState(value: string, context: string): SchedulerState {
  if (isSchedulerState(value)) {
    return value;
  }

  throw Object.assign(new Error(`Invalid scheduler state value '${value}' in ${context}`), {
    code: "INVALID_SCHEDULER_STATE",
    transient: false
  });
}

function decryptSecret(payload: string) {
  const rawKey = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  if (!rawKey) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be configured.");
  }
  return decryptSecretWithKey(payload, rawKey);
}

function tokenSuffix(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 10);
}

async function publishPost(accessToken: string, text: string): Promise<XPublishResult> {
  if (text.includes("[429]")) {
    const error = new Error("X rate limit exceeded");
    (error as Error & { code?: string; transient?: boolean }).code = "RATE_LIMIT";
    (error as Error & { code?: string; transient?: boolean }).transient = true;
    throw error;
  }

  if (text.includes("[500]")) {
    const error = new Error("Temporary X API failure");
    (error as Error & { code?: string; transient?: boolean }).code = "X_TEMPORARY_ERROR";
    (error as Error & { code?: string; transient?: boolean }).transient = true;
    throw error;
  }

  if (text.includes("[PERM]")) {
    const error = new Error("X policy reject");
    (error as Error & { code?: string; transient?: boolean }).code = "POLICY_REJECTED";
    (error as Error & { code?: string; transient?: boolean }).transient = false;
    throw error;
  }

  return {
    externalPostId: `mock_post_${tokenSuffix(`${accessToken}:${Date.now()}`)}`,
    publishedAt: new Date()
  };
}

async function fetchPostMetrics(
  accessToken: string,
  externalPostId: string
): Promise<XPostMetrics> {
  const seed = Number.parseInt(tokenSuffix(`${accessToken}:${externalPostId}`).slice(0, 6), 16);
  const base = (seed % 400) + 100;
  return {
    impressions: base * 12,
    likes: Math.floor(base * 0.2),
    replies: Math.floor(base * 0.04),
    reposts: Math.floor(base * 0.06),
    quotes: Math.floor(base * 0.02)
  };
}

function classifyPublishError(error: unknown) {
  const e = error as { code?: string; message?: string; transient?: boolean };
  return {
    code: e.code ?? "UNKNOWN_ERROR",
    message: e.message ?? "Unknown publish error",
    transient: e.transient ?? false
  };
}

function safeModeEnabled() {
  return (process.env.SAFE_MODE_ENABLED ?? "true").toLowerCase() !== "false";
}

function similarityGuardEnabled() {
  const explicit = process.env.SAFE_MODE_SIMILARITY_GUARD_ENABLED?.trim();
  if (explicit) {
    return explicit.toLowerCase() !== "false";
  }
  return safeModeEnabled();
}

async function storeMetricsSnapshot(params: {
  workspaceId: string;
  publishedPostId: string;
  xPostId: string;
  windowKey: "t15" | "t60" | "t24";
  accessToken: string;
}) {
  const metrics = await fetchPostMetrics(params.accessToken, params.xPostId);

  await dbPool.query(
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
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, now())
      ON CONFLICT (published_post_id, window_key)
      DO UPDATE SET
        impressions = EXCLUDED.impressions,
        likes = EXCLUDED.likes,
        replies = EXCLUDED.replies,
        reposts = EXCLUDED.reposts,
        quotes = EXCLUDED.quotes,
        metrics_snapshot = EXCLUDED.metrics_snapshot,
        captured_at = EXCLUDED.captured_at;
    `,
    [
      params.workspaceId,
      params.publishedPostId,
      params.xPostId,
      params.windowKey,
      metrics.impressions,
      metrics.likes,
      metrics.replies,
      metrics.reposts,
      metrics.quotes,
      JSON.stringify(metrics)
    ]
  );
}

async function processPublishJob(publishJobId: string) {
  const client = await dbPool.connect();
  const maxAttempts = Number(process.env.PUBLISH_MAX_ATTEMPTS ?? 8);
  let postCommitMetricsPayload:
    | {
        workspaceId: string;
        accountId: string;
        publishedPostId: string;
        xPostId: string;
      }
    | undefined;

  try {
    await client.query("BEGIN");
    const jobResult = await client.query<{
      id: string;
      workspace_id: string;
      account_id: string;
      content_id: string;
      state: string;
      attempt_count: number;
      next_run_at: string;
    }>(
      `
        SELECT id, workspace_id, account_id, content_id, state, attempt_count, next_run_at
        FROM publish_jobs
        WHERE id = $1
        FOR UPDATE;
      `,
      [publishJobId]
    );

    const jobRow = jobResult.rows[0];
    if (!jobRow) {
      await client.query("ROLLBACK");
      return;
    }

    if (["completed", "failed_permanent", "cancelled"].includes(jobRow.state)) {
      await client.query("COMMIT");
      return;
    }

    if (new Date(jobRow.next_run_at).getTime() > Date.now()) {
      await client.query("COMMIT");
      return;
    }

    const currentState = assertSchedulerState(jobRow.state, "publish job processing");
    const inProgressState =
      currentState === "in_progress" ? currentState : nextSchedulerState(currentState, "start");
    const attempt = Number(jobRow.attempt_count) + 1;
    await client.query(
      `
        UPDATE publish_jobs
        SET state = $2,
            attempt_count = $3,
            locked_at = now(),
            locked_by = $4,
            updated_at = now()
        WHERE id = $1;
      `,
      [publishJobId, inProgressState, attempt, "worker"]
    );

    const contentResult = await client.query<{ current_text: string }>(
      `
        SELECT current_text
        FROM contents
        WHERE id = $1
          AND workspace_id = $2
        LIMIT 1;
      `,
      [jobRow.content_id, jobRow.workspace_id]
    );

    if (!contentResult.rows[0]) {
      throw Object.assign(new Error("Content not found"), {
        code: "CONTENT_NOT_FOUND",
        transient: false
      });
    }

    if (similarityGuardEnabled()) {
      const similarityThreshold = Number(process.env.SAFE_MODE_MAX_SIMILARITY ?? 0.85);
      const recentPublished = await client.query<{ current_text: string }>(
        `
          SELECT c.current_text
          FROM published_posts pp
          JOIN contents c ON c.id = pp.content_id
          WHERE pp.account_id = $1
          ORDER BY pp.published_at DESC
          LIMIT 20;
        `,
        [jobRow.account_id]
      );

      const highestSimilarity = recentPublished.rows.reduce((max, row) => {
        const score = cosineSimilarity(contentResult.rows[0].current_text, row.current_text);
        return score > max ? score : max;
      }, 0);

      if (highestSimilarity >= similarityThreshold) {
        throw Object.assign(new Error("Content too similar to recent published posts"), {
          code: "DUPLICATE_SIMILARITY",
          transient: false
        });
      }
    }

    const existingPublished = await client.query<{ id: string; external_post_id: string }>(
      `
        SELECT id, external_post_id
        FROM published_posts
        WHERE publish_job_id = $1
        LIMIT 1;
      `,
      [publishJobId]
    );

    let activeWorkspaceId = jobRow.workspace_id;
    let activeAccountId = jobRow.account_id;
    let activeContentId = jobRow.content_id;
    let completionBaseState: SchedulerState = inProgressState;
    let publishedPostId = existingPublished.rows[0]?.id;
    let externalPostId = existingPublished.rows[0]?.external_post_id;

    if (!publishedPostId || !externalPostId) {
      const tokenResult = await client.query<{ access_token_encrypted: string }>(
        `
          SELECT xt.access_token_encrypted
          FROM x_tokens xt
          JOIN x_accounts xa ON xa.id = xt.account_id
          WHERE xt.account_id = $1
            AND xa.workspace_id = $2
            AND xt.revoked_at IS NULL
          ORDER BY xt.created_at DESC
          LIMIT 1;
        `,
        [jobRow.account_id, jobRow.workspace_id]
      );

      if (!tokenResult.rows[0]) {
        throw Object.assign(new Error("X access token not found"), {
          code: "TOKEN_NOT_FOUND",
          transient: false
        });
      }

      const accessToken = decryptSecret(tokenResult.rows[0].access_token_encrypted);
      // Release row lock before external call to avoid long-lived DB transactions on slow X API.
      // Tradeoff: if X publish succeeds but finalize transaction fails, the post can exist on X
      // before we persist published_posts. See docs/runbooks/publish-duplication-incident.md.
      await client.query("COMMIT");

      const publishResult = await publishPost(accessToken, contentResult.rows[0].current_text);
      await client.query("BEGIN");
      const currentJobResult = await client.query<{
        workspace_id: string;
        account_id: string;
        content_id: string;
        state: SchedulerState;
      }>(
        `
          SELECT workspace_id, account_id, content_id, state
          FROM publish_jobs
          WHERE id = $1
          FOR UPDATE;
        `,
        [publishJobId]
      );

      const currentJob = currentJobResult.rows[0];
      if (!currentJob) {
        throw Object.assign(new Error("Publish job not found during finalize"), {
          code: "PUBLISH_JOB_NOT_FOUND",
          transient: false
        });
      }

      if (["completed", "failed_permanent", "cancelled"].includes(currentJob.state)) {
        await client.query("COMMIT");
        return;
      }

      activeWorkspaceId = currentJob.workspace_id;
      activeAccountId = currentJob.account_id;
      activeContentId = currentJob.content_id;
      completionBaseState = currentJob.state;

      if (completionBaseState !== "in_progress") {
        throw Object.assign(
          new Error(`Unexpected publish job state during finalize: ${completionBaseState}`),
          {
            code: "INVALID_STATE_TRANSITION",
            transient: false
          }
        );
      }

      const insertedPublished = await client.query<{ id: string; external_post_id: string }>(
        `
          INSERT INTO published_posts (
            workspace_id,
            account_id,
            content_id,
            publish_job_id,
            external_post_id,
            published_at
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (publish_job_id)
          DO UPDATE SET external_post_id = EXCLUDED.external_post_id
          RETURNING id, external_post_id;
        `,
        [
          activeWorkspaceId,
          activeAccountId,
          activeContentId,
          publishJobId,
          publishResult.externalPostId,
          publishResult.publishedAt
        ]
      );

      publishedPostId = insertedPublished.rows[0].id;
      externalPostId = insertedPublished.rows[0].external_post_id;

      await client.query(
        `
          UPDATE contents
          SET status = 'published',
              updated_at = now()
          WHERE id = $1;
        `,
        [activeContentId]
      );
    }

    await client.query(
      `
        INSERT INTO usage_events (workspace_id, account_id, event_type, endpoint_key, units, metadata)
        SELECT $1, $2, 'x.publish', 'tweet.write', 1, $3::jsonb
        WHERE NOT EXISTS (
          SELECT 1
          FROM usage_events
          WHERE workspace_id = $1
            AND account_id = $2
            AND event_type = 'x.publish'
            AND endpoint_key = 'tweet.write'
            AND metadata->>'publishJobId' = $4
        );
      `,
      [activeWorkspaceId, activeAccountId, JSON.stringify({ publishJobId }), publishJobId]
    );

    await client.query(
      `
        INSERT INTO audit_logs (workspace_id, action, entity_type, entity_id, result)
        SELECT $1, 'publish.completed', 'publish_job', $2, 'success'
        WHERE NOT EXISTS (
          SELECT 1
          FROM audit_logs
          WHERE workspace_id = $1
            AND action = 'publish.completed'
            AND entity_type = 'publish_job'
            AND entity_id = $2
            AND result = 'success'
        );
      `,
      [activeWorkspaceId, publishJobId]
    );

    const completedState = nextSchedulerState(completionBaseState, "complete");
    await client.query(
      `
        UPDATE publish_jobs
        SET state = $2,
            completed_at = now(),
            locked_at = NULL,
            locked_by = NULL,
            updated_at = now()
        WHERE id = $1;
      `,
      [publishJobId, completedState]
    );

    await client.query("COMMIT");
    if (publishedPostId && externalPostId) {
      postCommitMetricsPayload = {
        workspaceId: activeWorkspaceId,
        accountId: activeAccountId,
        publishedPostId,
        xPostId: externalPostId
      };
    }
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // noop
    }

    const recoveryClient = await dbPool.connect();
    try {
      await recoveryClient.query("BEGIN");
      const classified = classifyPublishError(error);
      const stateResult = await recoveryClient.query<{
        attempt_count: number;
        state: string;
        content_id: string;
        workspace_id: string;
      }>(
        `SELECT attempt_count, state, content_id, workspace_id FROM publish_jobs WHERE id = $1 FOR UPDATE`,
        [publishJobId]
      );

      if (!stateResult.rows[0]) {
        await recoveryClient.query("ROLLBACK");
        return;
      }

      const attempt = Number(stateResult.rows[0].attempt_count);
      const currentState = assertSchedulerState(
        stateResult.rows[0].state,
        "publish error recovery"
      );
      if (["completed", "failed_permanent", "cancelled"].includes(currentState)) {
        await recoveryClient.query("COMMIT");
        return;
      }
      const processingState =
        currentState === "in_progress" ? currentState : nextSchedulerState(currentState, "start");
      if (classified.transient && attempt < maxAttempts) {
        const delayMs = calculateBackoffDelayMs({ attempt });
        const nextRunAt = new Date(Date.now() + delayMs);
        const retryState = nextSchedulerState(processingState, "retry");
        await recoveryClient.query(
          `
            UPDATE publish_jobs
            SET state = $2,
                next_run_at = $3,
                last_error_code = $4,
                last_error_message = $5,
                locked_at = NULL,
                locked_by = NULL,
                updated_at = now()
            WHERE id = $1;
          `,
          [publishJobId, retryState, nextRunAt, classified.code, classified.message]
        );
        await recoveryClient.query(
          `
            INSERT INTO audit_logs (workspace_id, action, entity_type, entity_id, result, metadata)
            SELECT workspace_id, 'publish.retry_scheduled', 'publish_job', id, 'failure', $2::jsonb
            FROM publish_jobs
            WHERE id = $1;
          `,
          [publishJobId, JSON.stringify({ code: classified.code, message: classified.message })]
        );
        await recoveryClient.query("COMMIT");

        try {
          await publishQueue.add(
            "publish",
            { publishJobId },
            {
              jobId: `publish:${publishJobId}:retry:${attempt}`,
              delay: delayMs,
              removeOnComplete: true,
              removeOnFail: 100
            }
          );
        } catch (enqueueError) {
          const enqueueRecoveryClient = await dbPool.connect();
          try {
            await enqueueRecoveryClient.query("BEGIN");
            const enqueueStateResult = await enqueueRecoveryClient.query<{
              state: string;
              content_id: string;
              workspace_id: string;
            }>(
              `
                SELECT state, content_id, workspace_id
                FROM publish_jobs
                WHERE id = $1
                FOR UPDATE;
              `,
              [publishJobId]
            );

            if (enqueueStateResult.rows[0]) {
              const enqueueFailureBaseState = assertSchedulerState(
                enqueueStateResult.rows[0].state,
                "retry enqueue recovery"
              );
              if (
                ["completed", "failed_permanent", "cancelled"].includes(enqueueFailureBaseState)
              ) {
                await enqueueRecoveryClient.query("COMMIT");
                throw enqueueError;
              }
              const enqueueFailureState = nextSchedulerState(
                enqueueFailureBaseState,
                "fail_permanent"
              );
              await enqueueRecoveryClient.query(
                `
                  UPDATE publish_jobs
                  SET state = $2,
                      last_error_code = $3,
                      last_error_message = $4,
                      locked_at = NULL,
                      locked_by = NULL,
                      updated_at = now()
                  WHERE id = $1;
                `,
                [
                  publishJobId,
                  enqueueFailureState,
                  "RETRY_ENQUEUE_FAILED",
                  enqueueError instanceof Error ? enqueueError.message : "Retry enqueue failed"
                ]
              );
              await enqueueRecoveryClient.query(
                `
                  UPDATE contents
                  SET status = 'draft',
                      updated_at = now()
                  WHERE id = $1
                    AND status = 'scheduled';
                `,
                [enqueueStateResult.rows[0].content_id]
              );
              await enqueueRecoveryClient.query(
                `
                  INSERT INTO audit_logs (workspace_id, action, entity_type, entity_id, result, metadata)
                  VALUES ($1, 'publish.failed_permanent', 'publish_job', $2, 'failure', $3::jsonb);
                `,
                [
                  enqueueStateResult.rows[0].workspace_id,
                  publishJobId,
                  JSON.stringify({
                    code: "RETRY_ENQUEUE_FAILED",
                    message:
                      enqueueError instanceof Error ? enqueueError.message : "Retry enqueue failed",
                    originalCode: classified.code
                  })
                ]
              );
            }
            await enqueueRecoveryClient.query("COMMIT");
          } catch {
            try {
              await enqueueRecoveryClient.query("ROLLBACK");
            } catch {
              // noop
            }
          } finally {
            enqueueRecoveryClient.release();
          }
          throw enqueueError;
        }
        return;
      }

      const permanentFailureState = nextSchedulerState(processingState, "fail_permanent");
      await recoveryClient.query(
        `
          UPDATE publish_jobs
          SET state = $2,
              last_error_code = $3,
              last_error_message = $4,
              locked_at = NULL,
              locked_by = NULL,
              updated_at = now()
          WHERE id = $1;
        `,
        [publishJobId, permanentFailureState, classified.code, classified.message]
      );
      await recoveryClient.query(
        `
          UPDATE contents
          SET status = 'draft',
              updated_at = now()
          WHERE id = $1
            AND status = 'scheduled';
        `,
        [stateResult.rows[0].content_id]
      );
      await recoveryClient.query(
        `
          INSERT INTO audit_logs (workspace_id, action, entity_type, entity_id, result, metadata)
          SELECT workspace_id, 'publish.failed_permanent', 'publish_job', id, 'failure', $2::jsonb
          FROM publish_jobs
          WHERE id = $1;
        `,
        [publishJobId, JSON.stringify({ code: classified.code, message: classified.message })]
      );
      await recoveryClient.query("COMMIT");
    } catch (innerError) {
      logger.error("publish error handling failed", innerError);
      try {
        await recoveryClient.query("ROLLBACK");
      } catch {
        // noop
      }
      // Preserve the original publish error as BullMQ failure reason.
      throw error;
    } finally {
      recoveryClient.release();
    }
  } finally {
    client.release();
  }

  if (!postCommitMetricsPayload) {
    return;
  }

  try {
    const tokenResult = await dbPool.query<{ access_token_encrypted: string }>(
      `
        SELECT xt.access_token_encrypted
        FROM x_tokens xt
        JOIN x_accounts xa ON xa.id = xt.account_id
        WHERE xt.account_id = $1
          AND xa.workspace_id = $2
          AND xt.revoked_at IS NULL
        ORDER BY xt.created_at DESC
        LIMIT 1;
      `,
      [postCommitMetricsPayload.accountId, postCommitMetricsPayload.workspaceId]
    );

    if (!tokenResult.rows[0]) {
      return;
    }

    const accessToken = decryptSecret(tokenResult.rows[0].access_token_encrypted);
    await storeMetricsSnapshot({
      workspaceId: postCommitMetricsPayload.workspaceId,
      publishedPostId: postCommitMetricsPayload.publishedPostId,
      xPostId: postCommitMetricsPayload.xPostId,
      windowKey: "t15",
      accessToken
    });

    await metricsQueue.add(
      "metrics",
      { publishedPostId: postCommitMetricsPayload.publishedPostId, windowKey: "t60" },
      {
        jobId: `metrics:${postCommitMetricsPayload.publishedPostId}:t60`,
        delay: 60 * 60_000,
        removeOnComplete: true
      }
    );
    await metricsQueue.add(
      "metrics",
      { publishedPostId: postCommitMetricsPayload.publishedPostId, windowKey: "t24" },
      {
        jobId: `metrics:${postCommitMetricsPayload.publishedPostId}:t24`,
        delay: 24 * 60 * 60_000,
        removeOnComplete: true
      }
    );
  } catch (metricsError) {
    logger.error("post-publish metrics collection failed", metricsError, { publishJobId });
  }
}

async function processMetricsJob(payload: { publishedPostId: string; windowKey: "t60" | "t24" }) {
  const publishedResult = await dbPool.query<{
    workspace_id: string;
    account_id: string;
    external_post_id: string;
  }>(
    `
      SELECT workspace_id, account_id, external_post_id
      FROM published_posts
      WHERE id = $1
      LIMIT 1;
    `,
    [payload.publishedPostId]
  );

  if (!publishedResult.rows[0]) {
    return;
  }

  const tokenResult = await dbPool.query<{ access_token_encrypted: string }>(
    `
      SELECT xt.access_token_encrypted
      FROM x_tokens xt
      JOIN x_accounts xa ON xa.id = xt.account_id
      WHERE xt.account_id = $1
        AND xa.workspace_id = $2
        AND xt.revoked_at IS NULL
      ORDER BY xt.created_at DESC
      LIMIT 1;
    `,
    [publishedResult.rows[0].account_id, publishedResult.rows[0].workspace_id]
  );

  if (!tokenResult.rows[0]) {
    return;
  }

  const accessToken = decryptSecret(tokenResult.rows[0].access_token_encrypted);
  await storeMetricsSnapshot({
    workspaceId: publishedResult.rows[0].workspace_id,
    publishedPostId: payload.publishedPostId,
    xPostId: publishedResult.rows[0].external_post_id,
    windowKey: payload.windowKey,
    accessToken
  });
}

const publishWorker = new Worker(
  publishQueueName,
  async (job) => {
    await processPublishJob(String(job.data.publishJobId));
    return { ok: true };
  },
  { connection: redisConnectionOptions() }
);

const metricsWorker = new Worker(
  metricsQueueName,
  async (job) => {
    await processMetricsJob(job.data as { publishedPostId: string; windowKey: "t60" | "t24" });
    return { ok: true };
  },
  { connection: redisConnectionOptions() }
);

const publishEvents = new QueueEvents(publishQueueName, {
  connection: redisConnectionOptions()
});
const metricsEvents = new QueueEvents(metricsQueueName, {
  connection: redisConnectionOptions()
});

publishEvents.on("completed", ({ jobId }) => {
  logger.info("publish job completed", { jobId });
});

publishEvents.on("failed", ({ jobId, failedReason }) => {
  logger.error("publish job failed", undefined, { jobId, failedReason });
});

metricsEvents.on("completed", ({ jobId }) => {
  logger.info("metrics job completed", { jobId });
});

publishWorker.on("ready", () => {
  logger.info("publish worker ready", {
    queue: publishQueueName,
    redis: sanitizeRedisUrl(getRedisUrl())
  });
});

metricsWorker.on("ready", () => {
  logger.info("metrics worker ready", {
    queue: metricsQueueName,
    redis: sanitizeRedisUrl(getRedisUrl())
  });
});

publishWorker.on("error", (error) => {
  logger.error("publish worker error", error);
});

metricsWorker.on("error", (error) => {
  logger.error("metrics worker error", error);
});

let shuttingDown = false;

const shutdown = async (signal: string) => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  try {
    logger.info("received shutdown signal", { signal });
    await publishWorker.close();
    await metricsWorker.close();
    await publishEvents.close();
    await metricsEvents.close();
    await publishQueue.close();
    await metricsQueue.close();
    await dbPool.end();
    process.exit(0);
  } catch (error) {
    logger.error("shutdown failed", error);
    process.exit(1);
  }
};

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
