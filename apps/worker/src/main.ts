import { createHash } from "node:crypto";
import { Queue, QueueEvents, Worker } from "bullmq";
import { config } from "dotenv";
import { calculateBackoffDelayMs, decryptSecret as decryptSecretWithKey } from "@growth-os/shared";
import IORedis from "ioredis";
import { Pool } from "pg";

config();

const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:55432/growth_os";
const publishQueueName = "publish-jobs";
const metricsQueueName = "metrics-jobs";

function getRedisUrl() {
  return process.env.REDIS_URL ?? "redis://localhost:56379";
}

const redisConnection = new IORedis(getRedisUrl(), {
  maxRetriesPerRequest: null,
  enableReadyCheck: true
});

const dbPool = new Pool({ connectionString: databaseUrl });
const publishQueue = new Queue(publishQueueName, { connection: redisConnection });
const metricsQueue = new Queue(metricsQueueName, { connection: redisConnection });

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

function decryptSecret(payload: string) {
  const rawKey = process.env.TOKEN_ENCRYPTION_KEY;
  return decryptSecretWithKey(payload, rawKey ?? "local-dev-insecure-key");
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

function normalizeTextForSimilarity(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function jaccardSimilarity(left: string, right: string) {
  const leftSet = new Set(normalizeTextForSimilarity(left));
  const rightSet = new Set(normalizeTextForSimilarity(right));
  if (leftSet.size === 0 && rightSet.size === 0) {
    return 1;
  }

  let intersection = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) {
      intersection += 1;
    }
  }

  const union = new Set([...leftSet, ...rightSet]).size;
  return union === 0 ? 0 : intersection / union;
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

    const attempt = Number(jobRow.attempt_count) + 1;
    await client.query(
      `
        UPDATE publish_jobs
        SET state = 'in_progress',
            attempt_count = $2,
            locked_at = now(),
            locked_by = $3,
            updated_at = now()
        WHERE id = $1;
      `,
      [publishJobId, attempt, "worker"]
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
      const score = jaccardSimilarity(contentResult.rows[0].current_text, row.current_text);
      return score > max ? score : max;
    }, 0);

    if (highestSimilarity >= similarityThreshold) {
      throw Object.assign(new Error("Content too similar to recent published posts"), {
        code: "DUPLICATE_SIMILARITY",
        transient: false
      });
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

    let publishedPostId = existingPublished.rows[0]?.id;
    let externalPostId = existingPublished.rows[0]?.external_post_id;

    if (!publishedPostId || !externalPostId) {
      const tokenResult = await client.query<{ access_token_encrypted: string }>(
        `
          SELECT access_token_encrypted
          FROM x_tokens
          WHERE account_id = $1
            AND revoked_at IS NULL
          ORDER BY created_at DESC
          LIMIT 1;
        `,
        [jobRow.account_id]
      );

      if (!tokenResult.rows[0]) {
        throw Object.assign(new Error("X access token not found"), {
          code: "TOKEN_NOT_FOUND",
          transient: false
        });
      }

      const accessToken = decryptSecret(tokenResult.rows[0].access_token_encrypted);
      const publishResult = await publishPost(accessToken, contentResult.rows[0].current_text);

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
          jobRow.workspace_id,
          jobRow.account_id,
          jobRow.content_id,
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
        [jobRow.content_id]
      );
    }

    await client.query(
      `
        INSERT INTO usage_events (workspace_id, account_id, event_type, endpoint_key, units, metadata)
        VALUES ($1, $2, 'x.publish', 'tweet.write', 1, $3::jsonb);
      `,
      [jobRow.workspace_id, jobRow.account_id, JSON.stringify({ publishJobId })]
    );

    await client.query(
      `
        INSERT INTO audit_logs (workspace_id, action, entity_type, entity_id, result)
        VALUES ($1, 'publish.completed', 'publish_job', $2, 'success');
      `,
      [jobRow.workspace_id, publishJobId]
    );

    await client.query(
      `
        UPDATE publish_jobs
        SET state = 'completed',
            completed_at = now(),
            locked_at = NULL,
            locked_by = NULL,
            updated_at = now()
        WHERE id = $1;
      `,
      [publishJobId]
    );

    await client.query("COMMIT");

    const tokenResult = await dbPool.query<{ access_token_encrypted: string }>(
      `
        SELECT access_token_encrypted
        FROM x_tokens
        WHERE account_id = $1
          AND revoked_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1;
      `,
      [jobRow.account_id]
    );

    if (tokenResult.rows[0] && publishedPostId && externalPostId) {
      const accessToken = decryptSecret(tokenResult.rows[0].access_token_encrypted);
      await storeMetricsSnapshot({
        workspaceId: jobRow.workspace_id,
        publishedPostId,
        xPostId: externalPostId,
        windowKey: "t15",
        accessToken
      });

      await metricsQueue.add(
        "metrics",
        { publishedPostId, windowKey: "t60" },
        { jobId: `metrics:${publishedPostId}:t60`, delay: 60 * 60_000, removeOnComplete: true }
      );
      await metricsQueue.add(
        "metrics",
        { publishedPostId, windowKey: "t24" },
        { jobId: `metrics:${publishedPostId}:t24`, delay: 24 * 60 * 60_000, removeOnComplete: true }
      );
    }
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // noop
    }

    try {
      await client.query("BEGIN");
      const classified = classifyPublishError(error);
      const stateResult = await client.query<{ attempt_count: number }>(
        `SELECT attempt_count FROM publish_jobs WHERE id = $1 FOR UPDATE`,
        [publishJobId]
      );

      if (!stateResult.rows[0]) {
        await client.query("ROLLBACK");
        return;
      }

      const attempt = Number(stateResult.rows[0].attempt_count);
      if (classified.transient && attempt < maxAttempts) {
        const delayMs = calculateBackoffDelayMs({ attempt });
        const nextRunAt = new Date(Date.now() + delayMs);
        await client.query(
          `
            UPDATE publish_jobs
            SET state = 'retry_wait',
                next_run_at = $2,
                last_error_code = $3,
                last_error_message = $4,
                locked_at = NULL,
                locked_by = NULL,
                updated_at = now()
            WHERE id = $1;
          `,
          [publishJobId, nextRunAt, classified.code, classified.message]
        );
        await client.query(
          `
            INSERT INTO audit_logs (workspace_id, action, entity_type, entity_id, result, metadata)
            SELECT workspace_id, 'publish.retry_scheduled', 'publish_job', id, 'failure', $2::jsonb
            FROM publish_jobs
            WHERE id = $1;
          `,
          [publishJobId, JSON.stringify({ code: classified.code, message: classified.message })]
        );
        await client.query("COMMIT");

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
        return;
      }

      await client.query(
        `
          UPDATE publish_jobs
          SET state = 'failed_permanent',
              last_error_code = $2,
              last_error_message = $3,
              locked_at = NULL,
              locked_by = NULL,
              updated_at = now()
          WHERE id = $1;
        `,
        [publishJobId, classified.code, classified.message]
      );
      await client.query(
        `
          INSERT INTO audit_logs (workspace_id, action, entity_type, entity_id, result, metadata)
          SELECT workspace_id, 'publish.failed_permanent', 'publish_job', id, 'failure', $2::jsonb
          FROM publish_jobs
          WHERE id = $1;
        `,
        [publishJobId, JSON.stringify({ code: classified.code, message: classified.message })]
      );
      await client.query("COMMIT");
    } catch (innerError) {
      console.error("[worker] publish error handling failed", innerError);
      try {
        await client.query("ROLLBACK");
      } catch {
        // noop
      }
      throw error;
    }
  } finally {
    client.release();
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
      SELECT access_token_encrypted
      FROM x_tokens
      WHERE account_id = $1
        AND revoked_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1;
    `,
    [publishedResult.rows[0].account_id]
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
  { connection: redisConnection }
);

const metricsWorker = new Worker(
  metricsQueueName,
  async (job) => {
    await processMetricsJob(job.data as { publishedPostId: string; windowKey: "t60" | "t24" });
    return { ok: true };
  },
  { connection: redisConnection }
);

const publishEvents = new QueueEvents(publishQueueName, { connection: redisConnection });
const metricsEvents = new QueueEvents(metricsQueueName, { connection: redisConnection });

publishEvents.on("completed", ({ jobId }) => {
  console.log(`[worker] publish job completed: ${jobId}`);
});

publishEvents.on("failed", ({ jobId, failedReason }) => {
  console.error(`[worker] publish job failed: ${jobId} - ${failedReason}`);
});

metricsEvents.on("completed", ({ jobId }) => {
  console.log(`[worker] metrics job completed: ${jobId}`);
});

publishWorker.on("ready", () => {
  console.log(`[worker] publish worker ready on '${publishQueueName}' using ${getRedisUrl()}`);
});

metricsWorker.on("ready", () => {
  console.log(`[worker] metrics worker ready on '${metricsQueueName}' using ${getRedisUrl()}`);
});

publishWorker.on("error", (error) => {
  console.error("[worker] publish worker error", error);
});

metricsWorker.on("error", (error) => {
  console.error("[worker] metrics worker error", error);
});

let shuttingDown = false;

const shutdown = async (signal: string) => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  try {
    console.log(`[worker] received ${signal}, shutting down gracefully`);
    await publishWorker.close();
    await metricsWorker.close();
    await publishEvents.close();
    await metricsEvents.close();
    await publishQueue.close();
    await metricsQueue.close();
    await redisConnection.quit();
    await dbPool.end();
    process.exit(0);
  } catch (error) {
    console.error("[worker] shutdown failed", error);
    process.exit(1);
  }
};

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
