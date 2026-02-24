import { createHash } from "node:crypto";
import { Queue, QueueEvents, Worker } from "bullmq";
import { config } from "dotenv";
import nodemailer from "nodemailer";
import {
  calculateBackoffDelayMs,
  cosineSimilarity,
  createLogger,
  evaluateFirstHourAlert,
  encryptSecret as encryptSecretWithKey,
  decryptSecret as decryptSecretWithKey,
  nextSchedulerState,
  resolveFirstHourAlertThresholds,
  type FirstHourAlertLevel,
  type SchedulerState
} from "@growth-os/shared";
import { Pool, type PoolClient } from "pg";
import { envFloat, envInt } from "./env";
import { assertSupportedXClientMode, resolveXClientMode } from "./runtime-policy";
import { getXClient } from "./x-client";

config();

const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:55432/growth_os";
const publishQueueName = "publish-jobs";
const metricsQueueName = "metrics-jobs";
const maintenanceQueueName = "maintenance-jobs";
const maintenanceJobName = "retention.cleanup";
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

assertSupportedXClientMode({ nodeEnv: process.env.NODE_ENV, mode: process.env.X_CLIENT_MODE });

function redisConnectionOptions() {
  const rawUrl = getRedisUrl();
  const parsed = new URL(rawUrl);
  const useTls = parsed.protocol === "rediss:";

  // Use ioredis URL constructor for standard fields, then overlay BullMQ-required options.
  // TLS: ioredis doesn't auto-detect rediss: protocol, so we add tls option explicitly.
  const parsedDb = parsed.pathname.replace(/^\/+/, "").split("/")[0]?.trim();
  const db = parsedDb ? Number(parsedDb) : 0;

  return {
    host: parsed.hostname,
    port: Number(parsed.port) || 6379,
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    db: Number.isFinite(db) && db >= 0 ? db : 0,
    maxRetriesPerRequest: null as null,
    enableReadyCheck: true,
    ...(useTls ? { tls: {} } : {})
  };
}

const dbPool = new Pool({
  connectionString: databaseUrl,
  max: envInt("PG_POOL_MAX", 12),
  idleTimeoutMillis: envInt("PG_POOL_IDLE_TIMEOUT_MS", 30_000),
  connectionTimeoutMillis: envInt("PG_POOL_CONNECTION_TIMEOUT_MS", 10_000)
});
const publishQueue = new Queue(publishQueueName, { connection: redisConnectionOptions() });
const metricsQueue = new Queue(metricsQueueName, { connection: redisConnectionOptions() });
const maintenanceQueue = new Queue(maintenanceQueueName, { connection: redisConnectionOptions() });
let runtimeResourcesClosed = false;

export async function closeWorkerRuntimeResourcesForTests() {
  if (runtimeResourcesClosed) {
    return;
  }
  runtimeResourcesClosed = true;
  await Promise.allSettled([
    publishQueue.close(),
    metricsQueue.close(),
    maintenanceQueue.close(),
    dbPool.end()
  ]);
}

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

function encryptSecret(payload: string) {
  const rawKey = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  if (!rawKey) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be configured.");
  }
  return encryptSecretWithKey(payload, rawKey);
}

const ACCESS_TOKEN_REFRESH_WINDOW_MS = 5 * 60_000;
const retentionCleanupIntervalMs = 24 * 60 * 60 * 1000;

type RetentionConfig = {
  rawPostRetentionDays: number;
  analyticsRetentionDays: number;
  tokenRotationDays: number;
};

type RetentionCleanupSummary = {
  workspaceId: string;
  rawPostsPurged: number;
  analyticsSnapshotsPurged: number;
  expiredTokensRevoked: number;
  revokedTokensPurged: number;
};

type MaintenancePayload = {
  workspaceId?: string;
  trigger?: "scheduled" | "manual";
  requestedBy?: string;
};

function resolveRetentionConfig(): RetentionConfig {
  return {
    rawPostRetentionDays: envInt("RAW_POST_RETENTION_DAYS", 90),
    analyticsRetentionDays: envInt("ANALYTICS_RETENTION_DAYS", 365),
    tokenRotationDays: envInt("TOKEN_ROTATION_DAYS", 30)
  };
}

export function resolveRetentionConfigForTests() {
  return resolveRetentionConfig();
}

type RefreshedAccessToken = {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  scopes: string[];
};

type ActiveXTokenRow = {
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  expires_at: string | null;
};

function parseExpiryTimeMs(expiresAt: string | null) {
  if (!expiresAt) {
    return undefined;
  }

  const expiry = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiry)) {
    return undefined;
  }

  return expiry;
}

function shouldRefreshAccessToken(expiresAt: string | null) {
  const expiryTimeMs = parseExpiryTimeMs(expiresAt);
  if (!expiryTimeMs) {
    return false;
  }

  return expiryTimeMs <= Date.now() + ACCESS_TOKEN_REFRESH_WINDOW_MS;
}

function tokenRefreshRequiredError() {
  return Object.assign(new Error("X access token refresh required"), {
    code: "TOKEN_REFRESH_REQUIRED",
    transient: false
  });
}

function configuredXScopes() {
  return (process.env.X_SCOPES ?? "tweet.read tweet.write users.read offline.access")
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function createWorkerXError(
  message: string,
  code: "RATE_LIMIT" | "X_TEMPORARY_ERROR" | "AUTH_FAILED" | "X_REQUEST_FAILED",
  transient: boolean
) {
  return Object.assign(new Error(message), { code, transient });
}

function parseTokenRefreshResponseBody(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return {};
  }
  return payload as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number | string;
    scope?: string;
    detail?: string;
    error?: string;
  };
}

function normalizeXOAuthBaseUrl() {
  const raw = (process.env.X_OAUTH_BASE_URL ?? "https://api.x.com/2/oauth2").trim();
  return raw.replace(/\/+$/, "");
}

function isAuthFailedError(error: unknown) {
  const code = (error as { code?: string }).code;
  const status = (error as { status?: number }).status;
  return code === "AUTH_FAILED" || status === 401 || status === 403;
}

function shouldRefreshBeforePublishError(error: unknown) {
  const code = (error as { code?: string }).code;
  return code === "TOKEN_REFRESH_REQUIRED";
}

function mockRefreshedAccessToken(refreshToken: string): RefreshedAccessToken {
  const nonce = createHash("sha256")
    .update(`${refreshToken}:${Date.now()}:${Math.random()}`)
    .digest("hex")
    .slice(0, 12);

  return {
    accessToken: `x_access_refresh_${nonce}`,
    refreshToken: `x_refresh_refresh_${nonce}`,
    expiresInSeconds: 7200,
    scopes: configuredXScopes()
  };
}

function resolveRefreshClientId() {
  const clientId = process.env.X_CLIENT_ID?.trim();
  if (!clientId) {
    throw createWorkerXError("X_CLIENT_ID is required for token refresh", "AUTH_FAILED", false);
  }

  return clientId;
}

function buildRefreshTokenHeaders(clientId: string) {
  const headers = new Headers({ "content-type": "application/x-www-form-urlencoded" });
  const clientSecret = process.env.X_CLIENT_SECRET?.trim();
  if (!clientSecret) {
    return headers;
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");
  headers.set("authorization", `Basic ${basic}`);
  return headers;
}

function parseRefreshScopes(scope: string | undefined) {
  if (!scope) {
    return configuredXScopes();
  }

  return scope
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function throwTokenRefreshHttpError(
  status: number,
  payload: ReturnType<typeof parseTokenRefreshResponseBody>
): never {
  const detail = payload.detail ?? payload.error ?? "X token refresh failed";
  if (status === 401 || status === 403) {
    throw Object.assign(createWorkerXError(detail, "AUTH_FAILED", false), { status });
  }
  if (status === 429) {
    throw Object.assign(createWorkerXError(detail, "RATE_LIMIT", true), { status });
  }
  if (status >= 500) {
    throw Object.assign(createWorkerXError(detail, "X_TEMPORARY_ERROR", true), { status });
  }

  throw Object.assign(createWorkerXError(detail, "X_REQUEST_FAILED", false), { status });
}

function toRefreshedAccessToken(
  payload: ReturnType<typeof parseTokenRefreshResponseBody>,
  previousRefreshToken: string
): RefreshedAccessToken {
  const expiresInSeconds = Number(payload.expires_in);
  if (!payload.access_token || !Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
    throw createWorkerXError(
      "X token refresh response is missing required fields",
      "X_REQUEST_FAILED",
      false
    );
  }

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token?.trim() || previousRefreshToken,
    expiresInSeconds,
    scopes: parseRefreshScopes(payload.scope)
  };
}

async function requestRefreshedAccessTokenFromX(
  refreshToken: string
): Promise<RefreshedAccessToken> {
  if (resolveXClientMode(process.env.X_CLIENT_MODE) === "mock") {
    return mockRefreshedAccessToken(refreshToken);
  }

  const clientId = resolveRefreshClientId();
  const form = new URLSearchParams();
  form.set("grant_type", "refresh_token");
  form.set("refresh_token", refreshToken);
  form.set("client_id", clientId);

  const response = await fetch(`${normalizeXOAuthBaseUrl()}/token`, {
    method: "POST",
    headers: buildRefreshTokenHeaders(clientId),
    body: form.toString()
  });
  const payload = parseTokenRefreshResponseBody(await response.json().catch(() => ({})));
  if (!response.ok) {
    throwTokenRefreshHttpError(response.status, payload);
  }

  return toRefreshedAccessToken(payload, refreshToken);
}

const xClient = getXClient();

function classifyPublishError(error: unknown) {
  const e = error as { code?: string; message?: string; transient?: boolean };
  return {
    code: e.code ?? "UNKNOWN_ERROR",
    message: e.message ?? "Unknown publish error",
    transient: e.transient ?? false
  };
}

const manualActionFailureCodes = new Set(["POLICY_REJECTED", "RATE_LIMIT", "AUTH_FAILED"]);

export function requiresManualActionForErrorCode(code?: string | null) {
  return Boolean(code && manualActionFailureCodes.has(code));
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

type StoredMetricSnapshot = {
  capturedAt: string;
  impressions: number;
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
};

type NotificationChannel = "email" | "webhook";

type NotificationContext = {
  workspaceId: string;
  publishedPostId: string;
  level: Exclude<FirstHourAlertLevel, "ok">;
};

type FirstHourAlertDeliveryContext = {
  workspaceId: string;
  publishedPostId: string;
  contentId: string;
  externalPostId: string;
  capturedAt: string;
  impressions: number;
  engagement: number;
  engagementRate: number;
  level: Exclude<FirstHourAlertLevel, "ok">;
  reasons: string[];
  thresholds: ReturnType<typeof resolveFirstHourAlertThresholds>;
  contentTitle: string;
};

function resolveAlertAppUrl() {
  return (process.env.APP_URL ?? "http://localhost:3010").replace(/\/+$/, "");
}

function resolveAlertFromEmail() {
  return (
    process.env.ALERT_FROM_EMAIL ?? process.env.MAGIC_LINK_FROM_EMAIL ?? "no-reply@example.com"
  );
}

function hasAlertEmailTransport() {
  return Boolean(process.env.SMTP_HOST?.trim());
}

function resolveAlertSmtpTransport() {
  const smtpHost = process.env.SMTP_HOST?.trim();
  if (!smtpHost) {
    return null;
  }

  const smtpPortRaw = Number(process.env.SMTP_PORT ?? 587);
  const smtpPort = Number.isFinite(smtpPortRaw) && smtpPortRaw > 0 ? smtpPortRaw : 587;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  return nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: false,
    auth: smtpUser && smtpPass ? { user: smtpUser, pass: smtpPass } : undefined
  });
}

async function reserveNotificationDelivery(
  params: NotificationContext & { channel: NotificationChannel }
) {
  const result = await dbPool.query<{ id: string }>(
    `
      INSERT INTO notification_log (
        workspace_id,
        notification_type,
        reference_id,
        channel,
        level,
        metadata
      )
      VALUES ($1, 'first_hour_alert', $2, $3, $4, '{}'::jsonb)
      ON CONFLICT (reference_id, channel, notification_type)
      DO NOTHING
      RETURNING id;
    `,
    [params.workspaceId, params.publishedPostId, params.channel, params.level]
  );

  return Boolean(result.rows[0]);
}

async function releaseNotificationReservation(
  params: NotificationContext & { channel: NotificationChannel }
) {
  await dbPool.query(
    `
      DELETE FROM notification_log
      WHERE workspace_id = $1
        AND reference_id = $2
        AND channel = $3
        AND notification_type = 'first_hour_alert';
    `,
    [params.workspaceId, params.publishedPostId, params.channel]
  );
}

async function updateNotificationMetadata(params: {
  context: NotificationContext;
  channel: NotificationChannel;
  metadata: Record<string, unknown>;
}) {
  await dbPool.query(
    `
      UPDATE notification_log
      SET metadata = $4::jsonb,
          delivered_at = now()
      WHERE workspace_id = $1
        AND reference_id = $2
        AND channel = $3
        AND notification_type = 'first_hour_alert';
    `,
    [
      params.context.workspaceId,
      params.context.publishedPostId,
      params.channel,
      JSON.stringify(params.metadata)
    ]
  );
}

function firstHourAlertSubject(context: FirstHourAlertDeliveryContext) {
  return `⚠️ First-Hour Alert: ${context.contentTitle} — ${context.level.toUpperCase()}`;
}

function firstHourAlertText(context: FirstHourAlertDeliveryContext) {
  const analyticsUrl = `${resolveAlertAppUrl()}/?view=analytics&contentId=${encodeURIComponent(context.contentId)}`;
  return [
    `Post: ${context.contentTitle}`,
    `Level: ${context.level.toUpperCase()}`,
    `Impressions: ${context.impressions}`,
    `Engagement: ${context.engagement}`,
    `Engagement rate: ${(context.engagementRate * 100).toFixed(2)}%`,
    `Thresholds: min impressions ${context.thresholds.minImpressions}, critical impressions ${context.thresholds.criticalImpressions}, min engagement ${(context.thresholds.minEngagementRate * 100).toFixed(2)}%, critical engagement ${(context.thresholds.criticalEngagementRate * 100).toFixed(2)}%`,
    `Reasons: ${context.reasons.join(", ") || "-"}`,
    `Analytics: ${analyticsUrl}`
  ].join("\n");
}

function firstHourAlertHtml(context: FirstHourAlertDeliveryContext) {
  const analyticsUrl = `${resolveAlertAppUrl()}/?view=analytics&contentId=${encodeURIComponent(context.contentId)}`;
  return [
    `<h2>First-Hour Alert (${context.level.toUpperCase()})</h2>`,
    `<p><strong>Post:</strong> ${context.contentTitle}</p>`,
    `<p><strong>Impressions:</strong> ${context.impressions}</p>`,
    `<p><strong>Engagement:</strong> ${context.engagement}</p>`,
    `<p><strong>Engagement rate:</strong> ${(context.engagementRate * 100).toFixed(2)}%</p>`,
    `<p><strong>Thresholds:</strong> min impressions ${context.thresholds.minImpressions}, critical impressions ${context.thresholds.criticalImpressions}, min engagement ${(context.thresholds.minEngagementRate * 100).toFixed(2)}%, critical engagement ${(context.thresholds.criticalEngagementRate * 100).toFixed(2)}%</p>`,
    `<p><strong>Reasons:</strong> ${context.reasons.join(", ") || "-"}</p>`,
    `<p><a href="${analyticsUrl}">Open analytics</a></p>`
  ].join("");
}

async function loadFirstHourAlertMeta(params: { workspaceId: string; publishedPostId: string }) {
  const result = await dbPool.query<{
    content_id: string;
    external_post_id: string;
    content_title: string | null;
  }>(
    `
      SELECT
        pp.content_id,
        pp.external_post_id,
        c.topic AS content_title
      FROM published_posts pp
      JOIN contents c ON c.id = pp.content_id
      WHERE pp.id = $1
        AND pp.workspace_id = $2
      LIMIT 1;
    `,
    [params.publishedPostId, params.workspaceId]
  );

  return result.rows[0];
}

async function resolveWorkspaceOwnerEmail(workspaceId: string) {
  const result = await dbPool.query<{ email: string }>(
    `
      SELECT u.email
      FROM workspace_members wm
      JOIN users u ON u.id = wm.user_id
      WHERE wm.workspace_id = $1
        AND wm.role = 'owner'
      ORDER BY wm.created_at ASC
      LIMIT 1;
    `,
    [workspaceId]
  );

  return result.rows[0]?.email;
}

async function resolveWorkspaceWebhookUrl(workspaceId: string) {
  const result = await dbPool.query<{ first_hour_alert_webhook_url: string | null }>(
    `
      SELECT first_hour_alert_webhook_url
      FROM workspace_notification_settings
      WHERE workspace_id = $1
      LIMIT 1;
    `,
    [workspaceId]
  );

  const configured = result.rows[0]?.first_hour_alert_webhook_url?.trim();
  if (configured) {
    return configured;
  }

  return process.env.FIRST_HOUR_ALERT_WEBHOOK_URL?.trim() || null;
}

async function sendFirstHourAlertEmail(params: {
  context: FirstHourAlertDeliveryContext;
  to: string;
}) {
  const transport = resolveAlertSmtpTransport();
  if (!transport) {
    throw new Error("SMTP_HOST is not configured");
  }

  await transport.sendMail({
    from: resolveAlertFromEmail(),
    to: params.to,
    subject: firstHourAlertSubject(params.context),
    text: firstHourAlertText(params.context),
    html: firstHourAlertHtml(params.context)
  });
}

async function deliverFirstHourWebhook(params: {
  context: FirstHourAlertDeliveryContext;
  webhookUrl: string;
}) {
  const response = await fetch(params.webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "first_hour_alert",
      workspaceId: params.context.workspaceId,
      publishedPostId: params.context.publishedPostId,
      externalPostId: params.context.externalPostId,
      contentId: params.context.contentId,
      contentTitle: params.context.contentTitle,
      capturedAt: params.context.capturedAt,
      level: params.context.level,
      impressions: params.context.impressions,
      engagement: params.context.engagement,
      engagementRate: params.context.engagementRate,
      reasons: params.context.reasons,
      thresholds: params.context.thresholds
    })
  });

  if (!response.ok) {
    const detail = (await response.text()).trim();
    throw new Error(`Webhook delivery failed (${response.status}): ${detail.slice(0, 200)}`);
  }
}

async function deliverFirstHourAlertChannel(params: {
  context: FirstHourAlertDeliveryContext;
  channel: NotificationChannel;
  execute: () => Promise<void>;
  metadata: Record<string, unknown>;
}) {
  const notificationContext: NotificationContext = {
    workspaceId: params.context.workspaceId,
    publishedPostId: params.context.publishedPostId,
    level: params.context.level
  };
  const reserved = await reserveNotificationDelivery({
    ...notificationContext,
    channel: params.channel
  });
  if (!reserved) {
    return;
  }

  try {
    await params.execute();
    await updateNotificationMetadata({
      context: notificationContext,
      channel: params.channel,
      metadata: params.metadata
    });
  } catch (error) {
    await releaseNotificationReservation({
      ...notificationContext,
      channel: params.channel
    });
    throw error;
  }
}

async function evaluateAndDeliverFirstHourAlert(params: {
  workspaceId: string;
  publishedPostId: string;
  snapshot: StoredMetricSnapshot;
}) {
  const thresholds = resolveFirstHourAlertThresholds();
  const evaluation = evaluateFirstHourAlert(
    {
      impressions: params.snapshot.impressions,
      likes: params.snapshot.likes,
      replies: params.snapshot.replies,
      reposts: params.snapshot.reposts,
      quotes: params.snapshot.quotes
    },
    thresholds
  );

  if (evaluation.level === "ok") {
    return;
  }

  const meta = await loadFirstHourAlertMeta({
    workspaceId: params.workspaceId,
    publishedPostId: params.publishedPostId
  });
  if (!meta) {
    return;
  }

  const alertContext: FirstHourAlertDeliveryContext = {
    workspaceId: params.workspaceId,
    publishedPostId: params.publishedPostId,
    contentId: meta.content_id,
    externalPostId: meta.external_post_id,
    contentTitle: meta.content_title?.trim() || "Untitled post",
    capturedAt: params.snapshot.capturedAt,
    impressions: params.snapshot.impressions,
    engagement: evaluation.engagement,
    engagementRate: evaluation.engagementRate,
    level: evaluation.level,
    reasons: evaluation.reasons,
    thresholds
  };

  const ownerEmail = await resolveWorkspaceOwnerEmail(params.workspaceId);
  if (ownerEmail) {
    if (!hasAlertEmailTransport()) {
      logger.warn("first-hour alert email skipped: SMTP_HOST not configured", {
        workspaceId: params.workspaceId,
        publishedPostId: params.publishedPostId
      });
    } else {
      await deliverFirstHourAlertChannel({
        context: alertContext,
        channel: "email",
        execute: () => sendFirstHourAlertEmail({ context: alertContext, to: ownerEmail }),
        metadata: { to: ownerEmail, reasons: alertContext.reasons }
      });
    }
  }

  const webhookUrl = await resolveWorkspaceWebhookUrl(params.workspaceId);
  if (webhookUrl) {
    await deliverFirstHourAlertChannel({
      context: alertContext,
      channel: "webhook",
      execute: () => deliverFirstHourWebhook({ context: alertContext, webhookUrl }),
      metadata: { webhookUrl, reasons: alertContext.reasons }
    });
  }
}

async function storeMetricsSnapshot(params: {
  workspaceId: string;
  publishedPostId: string;
  xPostId: string;
  windowKey: "t15" | "t60" | "t24";
  accessToken: string;
}): Promise<StoredMetricSnapshot> {
  const metrics = await xClient.fetchPostMetrics(params.accessToken, params.xPostId);

  const result = await dbPool.query<{
    captured_at: string;
    impressions: number;
    likes: number;
    replies: number;
    reposts: number;
    quotes: number;
  }>(
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
        captured_at = EXCLUDED.captured_at
      RETURNING captured_at, impressions, likes, replies, reposts, quotes;
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

  const row = result.rows[0];
  if (!row) {
    throw new Error("Metrics snapshot persistence failed");
  }

  return {
    capturedAt: row.captured_at,
    impressions: row.impressions,
    likes: row.likes,
    replies: row.replies,
    reposts: row.reposts,
    quotes: row.quotes
  };
}

export type PostCommitMetricsPayload = {
  workspaceId: string;
  accountId: string;
  contentId: string;
  publishedPostId: string;
  xPostId: string;
};

type PublishJobRow = {
  id: string;
  workspace_id: string;
  account_id: string;
  content_id: string;
  state: string;
  attempt_count: number;
  next_run_at: string;
};

type PublishRuntimeContext = {
  activeWorkspaceId: string;
  activeAccountId: string;
  activeContentId: string;
  completionBaseState: SchedulerState;
  publishedPostId?: string;
  externalPostId?: string;
};

type PreparedDraft = {
  contentText: string;
  runtime: PublishRuntimeContext;
};

type RetryEnqueueFailureStateParams = {
  enqueueRecoveryClient: PoolClient;
  publishJobId: string;
  enqueueErrorMessage: string;
  originalCode: string;
};

function isTerminalPublishState(state: string) {
  return ["completed", "failed_permanent", "cancelled"].includes(state);
}

async function rollbackWithWarning(client: PoolClient, publishJobId: string, message: string) {
  try {
    await client.query("ROLLBACK");
  } catch (rollbackError) {
    logger.warn(message, { publishJobId }, rollbackError);
  }
}

async function loadContentText(
  client: PoolClient,
  contentId: string,
  workspaceId: string
): Promise<string> {
  const contentResult = await client.query<{ current_text: string }>(
    `
      SELECT current_text
      FROM contents
      WHERE id = $1
        AND workspace_id = $2
      LIMIT 1;
    `,
    [contentId, workspaceId]
  );

  if (!contentResult.rows[0]) {
    throw Object.assign(new Error("Content not found"), {
      code: "CONTENT_NOT_FOUND",
      transient: false
    });
  }

  return contentResult.rows[0].current_text;
}

async function enforceSimilarityGuard(client: PoolClient, accountId: string, contentText: string) {
  if (!similarityGuardEnabled()) {
    return;
  }

  const similarityThreshold = envFloat("SAFE_MODE_MAX_SIMILARITY", 0.85, 0, 1);
  const recentPublished = await client.query<{ current_text: string }>(
    `
      SELECT c.current_text
      FROM published_posts pp
      JOIN contents c ON c.id = pp.content_id
      WHERE pp.account_id = $1
      ORDER BY pp.published_at DESC
      LIMIT 20;
    `,
    [accountId]
  );

  const highestSimilarity = recentPublished.rows.reduce((max, row) => {
    const score = cosineSimilarity(contentText, row.current_text);
    return score > max ? score : max;
  }, 0);
  if (highestSimilarity < similarityThreshold) {
    return;
  }

  throw Object.assign(new Error("Content too similar to recent published posts"), {
    code: "DUPLICATE_SIMILARITY",
    transient: false
  });
}

async function prepareDraft(
  client: PoolClient,
  publishJobId: string
): Promise<PreparedDraft | undefined> {
  await client.query("BEGIN");
  const jobResult = await client.query<PublishJobRow>(
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
  if (isTerminalPublishState(jobRow.state)) {
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
    [publishJobId, inProgressState, Number(jobRow.attempt_count) + 1, "worker"]
  );

  const contentText = await loadContentText(client, jobRow.content_id, jobRow.workspace_id);
  await enforceSimilarityGuard(client, jobRow.account_id, contentText);
  const existingPublished = await client.query<{ id: string; external_post_id: string }>(
    `
      SELECT id, external_post_id
      FROM published_posts
      WHERE publish_job_id = $1
      LIMIT 1;
    `,
    [publishJobId]
  );

  return {
    contentText,
    runtime: {
      activeWorkspaceId: jobRow.workspace_id,
      activeAccountId: jobRow.account_id,
      activeContentId: jobRow.content_id,
      completionBaseState: inProgressState,
      publishedPostId: existingPublished.rows[0]?.id,
      externalPostId: existingPublished.rows[0]?.external_post_id
    }
  };
}

async function fetchAccessTokenForPublish(
  client: PoolClient,
  accountId: string,
  workspaceId: string
) {
  const tokenResult = await client.query<{
    access_token_encrypted: string;
    expires_at: string | null;
  }>(
    `
      SELECT xt.access_token_encrypted, xt.expires_at
      FROM x_tokens xt
      JOIN x_accounts xa ON xa.id = xt.account_id
      WHERE xt.account_id = $1
        AND xa.workspace_id = $2
        AND xt.revoked_at IS NULL
        AND (xt.expires_at IS NULL OR xt.expires_at > now() - interval '5 minutes')
      ORDER BY xt.created_at DESC
      LIMIT 1;
    `,
    [accountId, workspaceId]
  );
  const tokenRow = tokenResult.rows[0];
  if (!tokenRow) {
    const fallbackTokenResult = await client.query<{ id: string }>(
      `
        SELECT xt.id
        FROM x_tokens xt
        JOIN x_accounts xa ON xa.id = xt.account_id
        WHERE xt.account_id = $1
          AND xa.workspace_id = $2
          AND xt.revoked_at IS NULL
        ORDER BY xt.created_at DESC
        LIMIT 1;
      `,
      [accountId, workspaceId]
    );
    if (fallbackTokenResult.rows[0]) {
      throw tokenRefreshRequiredError();
    }

    throw Object.assign(new Error("X access token not found"), {
      code: "TOKEN_NOT_FOUND",
      transient: false
    });
  }

  if (shouldRefreshAccessToken(tokenRow.expires_at)) {
    throw tokenRefreshRequiredError();
  }

  return decryptSecret(tokenRow.access_token_encrypted);
}

async function fetchLatestAccessTokenForPublish(
  client: PoolClient,
  accountId: string,
  workspaceId: string
) {
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
    [accountId, workspaceId]
  );

  const tokenRow = tokenResult.rows[0];
  if (!tokenRow) {
    throw Object.assign(new Error("X access token not found"), {
      code: "TOKEN_NOT_FOUND",
      transient: false
    });
  }

  return decryptSecret(tokenRow.access_token_encrypted);
}

async function publishWithLatestAccessTokenAfterRefresh(params: {
  client: PoolClient;
  runtime: PublishRuntimeContext;
  contentText: string;
  refreshedAccessToken: string;
}) {
  const latestAccessToken = await fetchLatestAccessTokenForPublish(
    params.client,
    params.runtime.activeAccountId,
    params.runtime.activeWorkspaceId
  );
  if (latestAccessToken === params.refreshedAccessToken) {
    return null;
  }

  try {
    return await xClient.publishPost(latestAccessToken, params.contentText);
  } catch (error) {
    if (!isAuthFailedError(error)) {
      throw error;
    }
    return null;
  }
}

async function lockActiveTokenForRefresh(
  client: PoolClient,
  accountId: string,
  workspaceId: string
) {
  const tokenResult = await client.query<ActiveXTokenRow>(
    `
      SELECT xt.access_token_encrypted, xt.refresh_token_encrypted, xt.expires_at
      FROM x_tokens xt
      JOIN x_accounts xa ON xa.id = xt.account_id
      WHERE xt.account_id = $1
        AND xa.workspace_id = $2
        AND xt.revoked_at IS NULL
      ORDER BY xt.created_at DESC
      LIMIT 1
      FOR UPDATE;
    `,
    [accountId, workspaceId]
  );

  return tokenResult.rows[0];
}

async function persistRefreshedToken(
  client: PoolClient,
  accountId: string,
  refreshedToken: RefreshedAccessToken
) {
  await client.query(
    "UPDATE x_tokens SET revoked_at = now() WHERE account_id = $1 AND revoked_at IS NULL",
    [accountId]
  );
  await client.query(
    `
      INSERT INTO x_tokens (
        account_id,
        access_token_encrypted,
        refresh_token_encrypted,
        scopes,
        expires_at
      )
      VALUES ($1, $2, $3, $4, $5);
    `,
    [
      accountId,
      encryptSecret(refreshedToken.accessToken),
      encryptSecret(refreshedToken.refreshToken),
      refreshedToken.scopes,
      new Date(Date.now() + refreshedToken.expiresInSeconds * 1000)
    ]
  );
}

type RefreshAccessTokenParams = {
  client: PoolClient;
  accountId: string;
  workspaceId: string;
  force?: boolean;
};

async function refreshAccessTokenInTransaction(params: RefreshAccessTokenParams) {
  const tokenRow = await lockActiveTokenForRefresh(
    params.client,
    params.accountId,
    params.workspaceId
  );
  if (!tokenRow) {
    throw Object.assign(new Error("X refresh token not found"), {
      code: "TOKEN_NOT_FOUND",
      transient: false
    });
  }

  if (!params.force && !shouldRefreshAccessToken(tokenRow.expires_at)) {
    return decryptSecret(tokenRow.access_token_encrypted);
  }

  const refreshToken = decryptSecret(tokenRow.refresh_token_encrypted);
  const refreshedToken = await requestRefreshedAccessTokenFromX(refreshToken);
  await persistRefreshedToken(params.client, params.accountId, refreshedToken);

  return refreshedToken.accessToken;
}

async function refreshAccessToken(params: RefreshAccessTokenParams) {
  await params.client.query("BEGIN");
  try {
    const accessToken = await refreshAccessTokenInTransaction(params);
    await params.client.query("COMMIT");
    return accessToken;
  } catch (error) {
    try {
      await params.client.query("ROLLBACK");
    } catch (rollbackError) {
      logger.warn("failed to rollback x token refresh transaction", {
        accountId: params.accountId,
        workspaceId: params.workspaceId
      });
      logger.error("x token refresh rollback failed", rollbackError);
    }
    throw error;
  }
}

async function resolveAccessTokenForPublish(client: PoolClient, runtime: PublishRuntimeContext) {
  try {
    return await fetchAccessTokenForPublish(
      client,
      runtime.activeAccountId,
      runtime.activeWorkspaceId
    );
  } catch (error) {
    if (!shouldRefreshBeforePublishError(error)) {
      throw error;
    }

    return refreshAccessTokenInTransaction({
      client,
      accountId: runtime.activeAccountId,
      workspaceId: runtime.activeWorkspaceId,
      force: true
    });
  }
}

async function publishPostWithRefreshRetry(params: {
  client: PoolClient;
  runtime: PublishRuntimeContext;
  contentText: string;
  accessToken: string;
}) {
  try {
    return await xClient.publishPost(params.accessToken, params.contentText);
  } catch (error) {
    if (!isAuthFailedError(error)) {
      throw error;
    }

    const refreshedAccessToken = await refreshAccessToken({
      client: params.client,
      accountId: params.runtime.activeAccountId,
      workspaceId: params.runtime.activeWorkspaceId,
      force: true
    });
    try {
      return await xClient.publishPost(refreshedAccessToken, params.contentText);
    } catch (retryError) {
      if (!isAuthFailedError(retryError)) {
        throw retryError;
      }

      const raceRecoveryPublish = await publishWithLatestAccessTokenAfterRefresh({
        client: params.client,
        runtime: params.runtime,
        contentText: params.contentText,
        refreshedAccessToken
      });
      if (raceRecoveryPublish) {
        return raceRecoveryPublish;
      }

      throw createWorkerXError("X authentication failed after token refresh", "AUTH_FAILED", false);
    }
  }
}

async function lockPublishJobForFinalize(client: PoolClient, publishJobId: string) {
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
  if (isTerminalPublishState(currentJob.state)) {
    await client.query("COMMIT");
    return;
  }

  return currentJob;
}

async function persistPublishedPost(
  client: PoolClient,
  publishJobId: string,
  runtime: PublishRuntimeContext,
  publishResult: { externalPostId: string; publishedAt: Date | string }
) {
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
      runtime.activeWorkspaceId,
      runtime.activeAccountId,
      runtime.activeContentId,
      publishJobId,
      publishResult.externalPostId,
      publishResult.publishedAt
    ]
  );
  const insertedRow = insertedPublished.rows[0];
  if (!insertedRow) {
    throw Object.assign(new Error("Published post persistence failed"), {
      code: "PUBLISHED_POST_PERSIST_FAILED",
      transient: false
    });
  }

  runtime.publishedPostId = insertedRow.id;
  runtime.externalPostId = insertedRow.external_post_id;

  await client.query(
    `
      UPDATE contents
      SET status = 'published',
          updated_at = now()
      WHERE id = $1;
    `,
    [runtime.activeContentId]
  );
}

async function publishToX(
  client: PoolClient,
  publishJobId: string,
  preparedDraft: PreparedDraft
): Promise<PublishRuntimeContext | undefined> {
  const runtime: PublishRuntimeContext = { ...preparedDraft.runtime };
  if (runtime.publishedPostId && runtime.externalPostId) {
    return runtime;
  }

  const accessToken = await resolveAccessTokenForPublish(client, runtime);
  // Release row lock before external call to avoid long-lived DB transactions on slow X API.
  // Tradeoff: if X publish succeeds but finalize transaction fails, the post can exist on X
  // before we persist published_posts. See docs/runbooks/publish-duplication-incident.md.
  await client.query("COMMIT");
  const publishResult = await publishPostWithRefreshRetry({
    client,
    runtime,
    contentText: preparedDraft.contentText,
    accessToken
  });
  const currentJob = await lockPublishJobForFinalize(client, publishJobId);
  if (!currentJob) {
    return;
  }

  runtime.activeWorkspaceId = currentJob.workspace_id;
  runtime.activeAccountId = currentJob.account_id;
  runtime.activeContentId = currentJob.content_id;
  runtime.completionBaseState = currentJob.state;
  if (runtime.completionBaseState !== "in_progress") {
    throw Object.assign(
      new Error(`Unexpected publish job state during finalize: ${runtime.completionBaseState}`),
      { code: "INVALID_STATE_TRANSITION", transient: false }
    );
  }

  await persistPublishedPost(client, publishJobId, runtime, publishResult);
  return runtime;
}

async function updateStatus(
  client: PoolClient,
  publishJobId: string,
  runtime: PublishRuntimeContext
): Promise<PostCommitMetricsPayload | undefined> {
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
    [
      runtime.activeWorkspaceId,
      runtime.activeAccountId,
      JSON.stringify({ publishJobId }),
      publishJobId
    ]
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
    [runtime.activeWorkspaceId, publishJobId]
  );

  const completedState = nextSchedulerState(runtime.completionBaseState, "complete");
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

  if (!runtime.publishedPostId || !runtime.externalPostId) {
    return;
  }

  return {
    workspaceId: runtime.activeWorkspaceId,
    accountId: runtime.activeAccountId,
    contentId: runtime.activeContentId,
    publishedPostId: runtime.publishedPostId,
    xPostId: runtime.externalPostId
  };
}

async function handleRetryEnqueueFailure(
  publishJobId: string,
  enqueueError: unknown,
  originalCode: string
) {
  const enqueueErrorMessage =
    enqueueError instanceof Error ? enqueueError.message : "Retry enqueue failed";
  const enqueueRecoveryClient = await dbPool.connect();

  try {
    await applyRetryEnqueueFailureState({
      enqueueRecoveryClient,
      publishJobId,
      enqueueErrorMessage,
      originalCode
    });
  } catch (enqueueRecoveryError) {
    await rollbackWithWarning(
      enqueueRecoveryClient,
      publishJobId,
      "failed to rollback retry enqueue recovery transaction"
    );
    logger.error("retry enqueue recovery handling failed", enqueueRecoveryError, { publishJobId });
  } finally {
    enqueueRecoveryClient.release();
  }
}

async function applyRetryEnqueueFailureState(params: RetryEnqueueFailureStateParams) {
  await params.enqueueRecoveryClient.query("BEGIN");
  const enqueueStateResult = await params.enqueueRecoveryClient.query<{
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
    [params.publishJobId]
  );
  const enqueueStateRow = enqueueStateResult.rows[0];

  if (!enqueueStateRow) {
    await params.enqueueRecoveryClient.query("COMMIT");
    return;
  }

  const enqueueFailureBaseState = assertSchedulerState(
    enqueueStateRow.state,
    "retry enqueue recovery"
  );
  if (isTerminalPublishState(enqueueFailureBaseState)) {
    await params.enqueueRecoveryClient.query("COMMIT");
    return;
  }

  const enqueueFailureState = nextSchedulerState(enqueueFailureBaseState, "fail_permanent");
  await params.enqueueRecoveryClient.query(
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
    [params.publishJobId, enqueueFailureState, "RETRY_ENQUEUE_FAILED", params.enqueueErrorMessage]
  );
  await params.enqueueRecoveryClient.query(
    `
      UPDATE contents
      SET status = 'draft',
          updated_at = now()
      WHERE id = $1
        AND status = 'scheduled';
    `,
    [enqueueStateRow.content_id]
  );
  await params.enqueueRecoveryClient.query(
    `
      INSERT INTO audit_logs (workspace_id, action, entity_type, entity_id, result, metadata)
      VALUES ($1, 'publish.failed_permanent', 'publish_job', $2, 'failure', $3::jsonb);
    `,
    [
      enqueueStateRow.workspace_id,
      params.publishJobId,
      JSON.stringify({
        code: "RETRY_ENQUEUE_FAILED",
        message: params.enqueueErrorMessage,
        originalCode: params.originalCode
      })
    ]
  );
  await params.enqueueRecoveryClient.query("COMMIT");
}

async function scheduleRetry(params: {
  recoveryClient: PoolClient;
  publishJobId: string;
  attempt: number;
  processingState: SchedulerState;
  classified: ReturnType<typeof classifyPublishError>;
}) {
  const delayMs = calculateBackoffDelayMs({ attempt: params.attempt });
  const nextRunAt = new Date(Date.now() + delayMs);
  const retryState = nextSchedulerState(params.processingState, "retry");

  await params.recoveryClient.query(
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
    [params.publishJobId, retryState, nextRunAt, params.classified.code, params.classified.message]
  );
  await params.recoveryClient.query(
    `
      INSERT INTO audit_logs (workspace_id, action, entity_type, entity_id, result, metadata)
      SELECT workspace_id, 'publish.retry_scheduled', 'publish_job', id, 'failure', $2::jsonb
      FROM publish_jobs
      WHERE id = $1;
    `,
    [
      params.publishJobId,
      JSON.stringify({ code: params.classified.code, message: params.classified.message })
    ]
  );
  await params.recoveryClient.query("COMMIT");

  try {
    await publishQueue.add(
      "publish",
      { publishJobId: params.publishJobId },
      {
        jobId: `publish:${params.publishJobId}:retry:${params.attempt}`,
        delay: delayMs,
        removeOnComplete: true,
        removeOnFail: 100
      }
    );
  } catch (enqueueError) {
    await handleRetryEnqueueFailure(params.publishJobId, enqueueError, params.classified.code);
    throw enqueueError;
  }
}

async function markPermanentFailure(params: {
  recoveryClient: PoolClient;
  publishJobId: string;
  processingState: SchedulerState;
  classified: ReturnType<typeof classifyPublishError>;
  contentId: string;
}) {
  const permanentFailureState = nextSchedulerState(params.processingState, "fail_permanent");
  const requiresManualAction = requiresManualActionForErrorCode(params.classified.code);
  await params.recoveryClient.query(
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
    [params.publishJobId, permanentFailureState, params.classified.code, params.classified.message]
  );
  await params.recoveryClient.query(
    `
      UPDATE contents
      SET status = 'draft',
          updated_at = now()
      WHERE id = $1
        AND status = 'scheduled';
    `,
    [params.contentId]
  );
  await params.recoveryClient.query(
    `
      INSERT INTO audit_logs (workspace_id, action, entity_type, entity_id, result, metadata)
      SELECT workspace_id, 'publish.failed_permanent', 'publish_job', id, 'failure', $2::jsonb
      FROM publish_jobs
      WHERE id = $1;
    `,
    [
      params.publishJobId,
      JSON.stringify({ code: params.classified.code, message: params.classified.message })
    ]
  );
  await params.recoveryClient.query(
    `
      INSERT INTO audit_logs (workspace_id, action, entity_type, entity_id, result, metadata)
      SELECT workspace_id, 'publish.manual_fallback_marked', 'publish_job', id, 'success', $2::jsonb
      FROM publish_jobs
      WHERE id = $1
        AND $3::boolean = true;
    `,
    [
      params.publishJobId,
      JSON.stringify({
        requires_manual_action: true,
        reason_code: params.classified.code
      }),
      requiresManualAction
    ]
  );
}

async function handleRetry(publishJobId: string, error: unknown, maxAttempts: number) {
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
    const stateRow = stateResult.rows[0];

    if (!stateRow) {
      await recoveryClient.query("ROLLBACK");
      return;
    }

    const attempt = Number(stateRow.attempt_count);
    const currentState = assertSchedulerState(stateRow.state, "publish error recovery");
    if (isTerminalPublishState(currentState)) {
      await recoveryClient.query("COMMIT");
      return;
    }

    let processingState: SchedulerState;
    try {
      processingState =
        currentState === "in_progress" ? currentState : nextSchedulerState(currentState, "start");
    } catch (stateError) {
      logger.error(
        `State machine error during recovery for job ${publishJobId}: unexpected state '${currentState}'`,
        stateError
      );
      await recoveryClient.query("ROLLBACK");
      throw error;
    }

    if (classified.transient && attempt < maxAttempts) {
      await scheduleRetry({
        recoveryClient,
        publishJobId,
        attempt,
        processingState,
        classified
      });
      return;
    }

    await markPermanentFailure({
      recoveryClient,
      publishJobId,
      processingState,
      classified,
      contentId: stateRow.content_id
    });
    await recoveryClient.query("COMMIT");
  } catch (innerError) {
    logger.error("publish error handling failed", innerError);
    await rollbackWithWarning(
      recoveryClient,
      publishJobId,
      "failed to rollback publish error recovery transaction"
    );
    // Preserve the original publish error as BullMQ failure reason.
    throw error;
  } finally {
    recoveryClient.release();
  }
}

async function handleMetrics(
  postCommitMetricsPayload: PostCommitMetricsPayload | undefined,
  publishJobId: string
) {
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

const evergreenCadenceDelayMs: Record<string, number> = {
  hourly: 60 * 60_000,
  daily: 24 * 60 * 60_000,
  weekly: 7 * 24 * 60 * 60_000,
  biweekly: 14 * 24 * 60 * 60_000,
  monthly: 30 * 24 * 60 * 60_000
};
const defaultEvergreenDelayMs = 24 * 60 * 60_000;

export function resolveEvergreenRunAt(cadence: string) {
  const delayMs = evergreenCadenceDelayMs[cadence] ?? defaultEvergreenDelayMs;
  return new Date(Date.now() + delayMs);
}

export function evergreenSeriesDedupeKey(seriesId: string, seriesItemId: string, runAt: Date) {
  const minuteBucket = Math.floor(runAt.getTime() / 60_000);
  return createHash("sha256")
    .update(`series:${seriesId}:item:${seriesItemId}:slot:${minuteBucket}`)
    .digest("hex");
}

type SeriesContextRow = {
  series_id: string;
  series_workspace_id: string;
  series_account_id: string;
  cadence: string;
  is_active: boolean;
  enqueue_next_on_publish: boolean;
  current_item_id: string;
  current_position: number;
};

type SeriesItemRow = {
  id: string;
  content_id: string;
  position: number;
};

async function loadSeriesContextForPublishedContent(
  client: PoolClient,
  payload: PostCommitMetricsPayload
) {
  const result = await client.query<SeriesContextRow>(
    `
      SELECT
        cs.id AS series_id,
        cs.workspace_id AS series_workspace_id,
        cs.account_id AS series_account_id,
        cs.cadence,
        cs.is_active,
        cs.enqueue_next_on_publish,
        csi.id AS current_item_id,
        csi.position AS current_position
      FROM content_series cs
      JOIN content_series_items csi ON csi.series_id = cs.id
      WHERE cs.workspace_id = $1
        AND csi.content_id = $2
      ORDER BY cs.updated_at DESC
      LIMIT 1
      FOR UPDATE OF cs, csi;
    `,
    [payload.workspaceId, payload.contentId]
  );

  return result.rows[0] ?? null;
}

async function resolveNextSeriesItem(
  client: PoolClient,
  seriesId: string,
  currentPosition: number
) {
  const nextByPosition = await client.query<SeriesItemRow>(
    `
      SELECT id, content_id, position
      FROM content_series_items
      WHERE series_id = $1
        AND state IN ('pending', 'published')
        AND position > $2
      ORDER BY position ASC
      LIMIT 1
      FOR UPDATE;
    `,
    [seriesId, currentPosition]
  );

  const direct = nextByPosition.rows[0];
  if (direct) {
    return direct;
  }

  const wrapped = await client.query<SeriesItemRow>(
    `
      SELECT id, content_id, position
      FROM content_series_items
      WHERE series_id = $1
        AND state IN ('pending', 'published')
      ORDER BY position ASC
      LIMIT 1
      FOR UPDATE;
    `,
    [seriesId]
  );

  return wrapped.rows[0] ?? null;
}

async function markSeriesItemPublished(client: PoolClient, itemId: string) {
  await client.query(
    `
      UPDATE content_series_items
      SET state = 'published',
          last_published_at = now(),
          updated_at = now()
      WHERE id = $1;
    `,
    [itemId]
  );
}

async function insertSeriesPublishJob(params: {
  client: PoolClient;
  context: SeriesContextRow;
  nextItem: SeriesItemRow;
  runAt: Date;
}) {
  const dedupeKey = evergreenSeriesDedupeKey(
    params.context.series_id,
    params.nextItem.id,
    params.runAt
  );
  const insertResult = await params.client.query<{ id: string }>(
    `
      INSERT INTO publish_jobs (
        workspace_id,
        account_id,
        content_id,
        dedupe_key,
        state,
        run_at,
        next_run_at
      )
      VALUES ($1, $2, $3, $4, 'queued', $5, $6)
      ON CONFLICT (workspace_id, account_id, dedupe_key)
      DO NOTHING
      RETURNING id;
    `,
    [
      params.context.series_workspace_id,
      params.context.series_account_id,
      params.nextItem.content_id,
      dedupeKey,
      params.runAt,
      params.runAt
    ]
  );

  return insertResult.rows[0]?.id ?? null;
}

async function persistSeriesEnqueueSuccess(params: {
  client: PoolClient;
  context: SeriesContextRow;
  nextItem: SeriesItemRow;
  publishJobId: string;
  sourceContentId: string;
}) {
  await params.client.query(
    `
      UPDATE contents
      SET status = 'scheduled',
          updated_at = now()
      WHERE id = $1;
    `,
    [params.nextItem.content_id]
  );
  await params.client.query(
    `
      UPDATE content_series_items
      SET state = 'queued',
          last_enqueued_at = now(),
          updated_at = now()
      WHERE id = $1;
    `,
    [params.nextItem.id]
  );
  await params.client.query(
    `
      INSERT INTO audit_logs (workspace_id, action, entity_type, entity_id, result, metadata)
      VALUES ($1, 'scheduling.series_enqueue', 'publish_job', $2, 'success', $3::jsonb);
    `,
    [
      params.context.series_workspace_id,
      params.publishJobId,
      JSON.stringify({
        sourceContentId: params.sourceContentId,
        nextContentId: params.nextItem.content_id,
        seriesId: params.context.series_id
      })
    ]
  );
}

async function enqueueSeriesQueueJob(publishJobId: string, nextItemId: string, runAt: Date) {
  const queueDelayMs = Math.max(0, runAt.getTime() - Date.now());
  await publishQueue.add(
    "publish",
    { publishJobId },
    {
      jobId: `publish:${publishJobId}:series:${nextItemId}`,
      delay: queueDelayMs,
      removeOnComplete: true,
      removeOnFail: 100
    }
  );
}

async function persistSeriesQueueFailure(params: {
  publishJobId: string;
  contentId: string;
  workspaceId: string;
  reason: string;
}) {
  const client = await dbPool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `
        UPDATE publish_jobs
        SET state = 'failed_permanent',
            last_error_code = 'QUEUE_ENQUEUE_FAILED',
            last_error_message = $2,
            updated_at = now()
        WHERE id = $1;
      `,
      [params.publishJobId, params.reason]
    );
    await client.query(
      `
        UPDATE contents
        SET status = 'draft',
            updated_at = now()
        WHERE id = $1
          AND status = 'scheduled';
      `,
      [params.contentId]
    );
    await client.query(
      `
        INSERT INTO audit_logs (workspace_id, action, entity_type, entity_id, result, metadata)
        VALUES ($1, 'scheduling.series_enqueue', 'publish_job', $2, 'failure', $3::jsonb);
      `,
      [
        params.workspaceId,
        params.publishJobId,
        JSON.stringify({ reason: params.reason, code: "QUEUE_ENQUEUE_FAILED" })
      ]
    );
    await client.query("COMMIT");
  } catch (error) {
    await rollbackWithWarning(
      client,
      params.publishJobId,
      "failed to rollback series enqueue failure transaction"
    );
    logger.error("series enqueue failure persistence failed", error, {
      publishJobId: params.publishJobId
    });
  } finally {
    client.release();
  }
}

export type EvergreenEnqueueOverrides = {
  connectClient?: () => Promise<PoolClient>;
  loadSeriesContextForPublishedContent?: typeof loadSeriesContextForPublishedContent;
  markSeriesItemPublished?: typeof markSeriesItemPublished;
  resolveNextSeriesItem?: typeof resolveNextSeriesItem;
  insertSeriesPublishJob?: typeof insertSeriesPublishJob;
  persistSeriesEnqueueSuccess?: typeof persistSeriesEnqueueSuccess;
  persistSeriesQueueFailure?: typeof persistSeriesQueueFailure;
  enqueueSeriesQueueJob?: typeof enqueueSeriesQueueJob;
  resolveEvergreenRunAt?: typeof resolveEvergreenRunAt;
  logger?: {
    info?: typeof logger.info;
    warn?: typeof logger.warn;
    error?: typeof logger.error;
  };
};

type ResolvedEvergreenEnqueueDeps = {
  connectClient: () => Promise<PoolClient>;
  loadContext: typeof loadSeriesContextForPublishedContent;
  markPublished: typeof markSeriesItemPublished;
  resolveNext: typeof resolveNextSeriesItem;
  insertJob: typeof insertSeriesPublishJob;
  persistSuccess: typeof persistSeriesEnqueueSuccess;
  persistFailure: typeof persistSeriesQueueFailure;
  queueJob: typeof enqueueSeriesQueueJob;
  runAtResolver: typeof resolveEvergreenRunAt;
  logInfo: typeof logger.info;
};

type QueuedSeriesState = {
  contentId?: string;
  publishJobId?: string;
  workspaceId?: string;
};

function resolveEvergreenEnqueueDeps(
  overrides: EvergreenEnqueueOverrides
): ResolvedEvergreenEnqueueDeps {
  return {
    connectClient: overrides.connectClient ?? (() => dbPool.connect()),
    loadContext:
      overrides.loadSeriesContextForPublishedContent ?? loadSeriesContextForPublishedContent,
    markPublished: overrides.markSeriesItemPublished ?? markSeriesItemPublished,
    resolveNext: overrides.resolveNextSeriesItem ?? resolveNextSeriesItem,
    insertJob: overrides.insertSeriesPublishJob ?? insertSeriesPublishJob,
    persistSuccess: overrides.persistSeriesEnqueueSuccess ?? persistSeriesEnqueueSuccess,
    persistFailure: overrides.persistSeriesQueueFailure ?? persistSeriesQueueFailure,
    queueJob: overrides.enqueueSeriesQueueJob ?? enqueueSeriesQueueJob,
    runAtResolver: overrides.resolveEvergreenRunAt ?? resolveEvergreenRunAt,
    logInfo: overrides.logger?.info ?? logger.info
  };
}

function isSeriesContextEligible(context: SeriesContextRow | null): context is SeriesContextRow {
  return Boolean(context && context.is_active && context.enqueue_next_on_publish);
}

async function processSeriesEnqueueWithinTransaction(params: {
  client: PoolClient;
  payload: PostCommitMetricsPayload;
  context: SeriesContextRow;
  deps: ResolvedEvergreenEnqueueDeps;
  queuedState: QueuedSeriesState;
}) {
  await params.deps.markPublished(params.client, params.context.current_item_id);

  const nextItem = await params.deps.resolveNext(
    params.client,
    params.context.series_id,
    params.context.current_position
  );
  if (!nextItem) {
    await params.client.query("COMMIT");
    return;
  }

  const runAt = params.deps.runAtResolver(params.context.cadence);
  const publishJobId = await params.deps.insertJob({
    client: params.client,
    context: params.context,
    nextItem,
    runAt
  });
  if (!publishJobId) {
    await params.client.query("COMMIT");
    params.deps.logInfo("series enqueue skipped due to dedupe", {
      seriesId: params.context.series_id,
      seriesItemId: nextItem.id,
      contentId: nextItem.content_id
    });
    return;
  }

  params.queuedState.publishJobId = publishJobId;
  params.queuedState.contentId = nextItem.content_id;
  params.queuedState.workspaceId = params.context.series_workspace_id;

  await params.deps.persistSuccess({
    client: params.client,
    context: params.context,
    nextItem,
    publishJobId,
    sourceContentId: params.payload.contentId
  });
  await params.client.query("COMMIT");
  await params.deps.queueJob(publishJobId, nextItem.id, runAt);
}

async function persistSeriesFailureIfNeeded(params: {
  queuedState: QueuedSeriesState;
  persistFailure: typeof persistSeriesQueueFailure;
  error: unknown;
}) {
  if (!params.queuedState.publishJobId) {
    return;
  }
  if (!params.queuedState.contentId || !params.queuedState.workspaceId) {
    return;
  }

  await params.persistFailure({
    publishJobId: params.queuedState.publishJobId,
    contentId: params.queuedState.contentId,
    workspaceId: params.queuedState.workspaceId,
    reason: params.error instanceof Error ? params.error.message : "Series enqueue failed"
  });
}

export async function enqueueSeriesNextItemAfterPublish(payload: PostCommitMetricsPayload) {
  return enqueueSeriesNextItemAfterPublishWithOverrides(payload, {});
}

export async function enqueueSeriesNextItemAfterPublishWithOverrides(
  payload: PostCommitMetricsPayload,
  overrides: EvergreenEnqueueOverrides
) {
  const deps = resolveEvergreenEnqueueDeps(overrides);
  const client = await deps.connectClient();
  const queuedState: QueuedSeriesState = {};

  try {
    await client.query("BEGIN");
    const context = await deps.loadContext(client, payload);
    if (!isSeriesContextEligible(context)) {
      await client.query("COMMIT");
      return;
    }

    await processSeriesEnqueueWithinTransaction({
      client,
      payload,
      context,
      deps,
      queuedState
    });
  } catch (error) {
    await rollbackWithWarning(
      client,
      payload.publishedPostId,
      "failed to rollback evergreen enqueue transaction"
    );
    await persistSeriesFailureIfNeeded({
      queuedState,
      persistFailure: deps.persistFailure,
      error
    });
    throw error;
  } finally {
    client.release();
  }
}

async function handleEvergreenSeries(
  postCommitMetricsPayload: PostCommitMetricsPayload | undefined
) {
  if (!postCommitMetricsPayload) {
    return;
  }

  try {
    await enqueueSeriesNextItemAfterPublish(postCommitMetricsPayload);
  } catch (error) {
    logger.error("evergreen enqueue failed", error, {
      contentId: postCommitMetricsPayload.contentId,
      publishedPostId: postCommitMetricsPayload.publishedPostId
    });
  }
}

async function processPublishJob(params: { publishJobId: string; attemptsMade: number }) {
  const client = await dbPool.connect();
  const maxAttempts = envInt("PUBLISH_MAX_ATTEMPTS", 8);
  let postCommitMetricsPayload: PostCommitMetricsPayload | undefined;

  try {
    const preparedDraft = await prepareDraft(client, params.publishJobId);
    if (!preparedDraft) {
      return;
    }

    const publishRuntime = await publishToX(client, params.publishJobId, preparedDraft);
    if (!publishRuntime) {
      return;
    }

    postCommitMetricsPayload = await updateStatus(client, params.publishJobId, publishRuntime);
  } catch (error) {
    await rollbackWithWarning(
      client,
      params.publishJobId,
      "failed to rollback publish transaction"
    );

    if (params.attemptsMade > 0) {
      logger.warn("native BullMQ retry detected, skipping custom retry orchestration", {
        publishJobId: params.publishJobId,
        attemptsMade: params.attemptsMade
      });
      throw error;
    }

    await handleRetry(params.publishJobId, error, maxAttempts);
  } finally {
    client.release();
  }

  await handleMetrics(postCommitMetricsPayload, params.publishJobId);
  await handleEvergreenSeries(postCommitMetricsPayload);
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

  const publishedRow = publishedResult.rows[0];
  if (!publishedRow) {
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
    [publishedRow.account_id, publishedRow.workspace_id]
  );

  const tokenRow = tokenResult.rows[0];
  if (!tokenRow) {
    return;
  }

  const accessToken = decryptSecret(tokenRow.access_token_encrypted);
  const snapshot = await storeMetricsSnapshot({
    workspaceId: publishedRow.workspace_id,
    publishedPostId: payload.publishedPostId,
    xPostId: publishedRow.external_post_id,
    windowKey: payload.windowKey,
    accessToken
  });

  if (payload.windowKey !== "t60") {
    return;
  }

  void evaluateAndDeliverFirstHourAlert({
    workspaceId: publishedRow.workspace_id,
    publishedPostId: payload.publishedPostId,
    snapshot
  }).catch((error) => {
    logger.error("first-hour alert delivery failed", error, {
      workspaceId: publishedRow.workspace_id,
      publishedPostId: payload.publishedPostId
    });
  });
}

async function purgeWorkspaceRawPosts(
  client: PoolClient,
  workspaceId: string,
  retentionDays: number
) {
  const result = await client.query<{ id: string }>(
    `
      DELETE FROM x_timeline_posts
      WHERE workspace_id = $1
        AND posted_at < now() - make_interval(days => $2::int)
      RETURNING id;
    `,
    [workspaceId, retentionDays]
  );

  return result.rowCount ?? result.rows.length;
}

async function purgeWorkspaceAnalyticsSnapshots(
  client: PoolClient,
  workspaceId: string,
  retentionDays: number
) {
  const result = await client.query<{ id: string }>(
    `
      DELETE FROM post_metric_snapshots
      WHERE workspace_id = $1
        AND captured_at < now() - make_interval(days => $2::int)
      RETURNING id;
    `,
    [workspaceId, retentionDays]
  );

  return result.rowCount ?? result.rows.length;
}

async function revokeWorkspaceExpiredTokens(client: PoolClient, workspaceId: string) {
  const result = await client.query<{ id: string }>(
    `
      UPDATE x_tokens xt
      SET revoked_at = now(),
          updated_at = now()
      FROM x_accounts xa
      WHERE xt.account_id = xa.id
        AND xa.workspace_id = $1
        AND xt.revoked_at IS NULL
        AND xt.expires_at IS NOT NULL
        AND xt.expires_at <= now()
      RETURNING xt.id;
    `,
    [workspaceId]
  );

  return result.rowCount ?? result.rows.length;
}

async function purgeWorkspaceRevokedTokens(
  client: PoolClient,
  workspaceId: string,
  rotationDays: number
) {
  const result = await client.query<{ id: string }>(
    `
      DELETE FROM x_tokens xt
      USING x_accounts xa
      WHERE xt.account_id = xa.id
        AND xa.workspace_id = $1
        AND xt.revoked_at IS NOT NULL
        AND xt.revoked_at < now() - make_interval(days => $2::int)
      RETURNING xt.id;
    `,
    [workspaceId, rotationDays]
  );

  return result.rowCount ?? result.rows.length;
}

async function insertRetentionAuditLog(params: {
  client: PoolClient;
  workspaceId: string;
  requestedBy?: string;
  action: string;
  metadata: Record<string, unknown>;
}) {
  await params.client.query(
    `
      INSERT INTO audit_logs (
        workspace_id,
        actor_user_id,
        action,
        entity_type,
        entity_id,
        result,
        metadata
      )
      VALUES ($1, $2, $3, 'workspace', $1, 'success', $4::jsonb);
    `,
    [params.workspaceId, params.requestedBy ?? null, params.action, JSON.stringify(params.metadata)]
  );
}

async function rollbackMaintenanceTransaction(client: PoolClient, workspaceId: string) {
  try {
    await client.query("ROLLBACK");
  } catch (rollbackError) {
    logger.warn("maintenance rollback failed", { workspaceId });
    logger.error("maintenance rollback exception", rollbackError);
  }
}

async function runWorkspaceRetentionCleanup(
  client: PoolClient,
  workspaceId: string,
  payload: MaintenancePayload,
  config: RetentionConfig
): Promise<RetentionCleanupSummary> {
  await client.query("BEGIN");
  try {
    const rawPostsPurged = await purgeWorkspaceRawPosts(
      client,
      workspaceId,
      config.rawPostRetentionDays
    );
    const analyticsSnapshotsPurged = await purgeWorkspaceAnalyticsSnapshots(
      client,
      workspaceId,
      config.analyticsRetentionDays
    );
    const expiredTokensRevoked = await revokeWorkspaceExpiredTokens(client, workspaceId);
    const revokedTokensPurged = await purgeWorkspaceRevokedTokens(
      client,
      workspaceId,
      config.tokenRotationDays
    );

    await insertRetentionAuditLog({
      client,
      workspaceId,
      requestedBy: payload.requestedBy,
      action: "data_retention.raw_posts_purged",
      metadata: {
        count: rawPostsPurged,
        retentionDays: config.rawPostRetentionDays,
        trigger: payload.trigger
      }
    });
    await insertRetentionAuditLog({
      client,
      workspaceId,
      requestedBy: payload.requestedBy,
      action: "data_retention.analytics_snapshots_purged",
      metadata: {
        count: analyticsSnapshotsPurged,
        retentionDays: config.analyticsRetentionDays,
        trigger: payload.trigger
      }
    });
    await insertRetentionAuditLog({
      client,
      workspaceId,
      requestedBy: payload.requestedBy,
      action: "data_retention.expired_tokens_revoked",
      metadata: { count: expiredTokensRevoked, trigger: payload.trigger }
    });
    await insertRetentionAuditLog({
      client,
      workspaceId,
      requestedBy: payload.requestedBy,
      action: "data_retention.revoked_tokens_purged",
      metadata: {
        count: revokedTokensPurged,
        rotationDays: config.tokenRotationDays,
        trigger: payload.trigger
      }
    });
    await client.query("COMMIT");

    return {
      workspaceId,
      rawPostsPurged,
      analyticsSnapshotsPurged,
      expiredTokensRevoked,
      revokedTokensPurged
    };
  } catch (error) {
    await rollbackMaintenanceTransaction(client, workspaceId);
    throw error;
  }
}

async function resolveMaintenanceWorkspaceIds(client: PoolClient, workspaceId?: string) {
  if (workspaceId) {
    return [workspaceId];
  }

  const result = await client.query<{ id: string }>(
    `
      SELECT id
      FROM workspaces
      ORDER BY created_at ASC;
    `
  );

  return result.rows.map((row) => row.id);
}

async function processMaintenanceJob(payload: MaintenancePayload) {
  const config = resolveRetentionConfig();
  const client = await dbPool.connect();
  try {
    const workspaceIds = await resolveMaintenanceWorkspaceIds(client, payload.workspaceId);
    for (const workspaceId of workspaceIds) {
      const summary = await runWorkspaceRetentionCleanup(client, workspaceId, payload, config);
      logger.info("retention cleanup completed", summary);
    }
  } finally {
    client.release();
  }
}

async function ensureDailyMaintenanceJobScheduled() {
  await maintenanceQueue.add(
    maintenanceJobName,
    { trigger: "scheduled" } satisfies MaintenancePayload,
    {
      jobId: "retention.cleanup.daily",
      repeat: { every: retentionCleanupIntervalMs },
      removeOnComplete: true,
      removeOnFail: 50
    }
  );
}

if (require.main === module) {
  const publishWorker = new Worker(
    publishQueueName,
    async (job) => {
      await processPublishJob({
        publishJobId: String(job.data.publishJobId),
        attemptsMade: job.attemptsMade
      });
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

  const maintenanceWorker = new Worker(
    maintenanceQueueName,
    async (job) => {
      await processMaintenanceJob(job.data as MaintenancePayload);
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
  const maintenanceEvents = new QueueEvents(maintenanceQueueName, {
    connection: redisConnectionOptions()
  });

  void ensureDailyMaintenanceJobScheduled()
    .then(() => {
      logger.info("daily maintenance schedule ensured", {
        queue: maintenanceQueueName,
        everyMs: retentionCleanupIntervalMs
      });
    })
    .catch((error) => {
      logger.error("failed to ensure daily maintenance schedule", error);
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

  maintenanceEvents.on("completed", ({ jobId }) => {
    logger.info("maintenance job completed", { jobId });
  });

  maintenanceEvents.on("failed", ({ jobId, failedReason }) => {
    logger.error("maintenance job failed", undefined, { jobId, failedReason });
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

  maintenanceWorker.on("ready", () => {
    logger.info("maintenance worker ready", {
      queue: maintenanceQueueName,
      redis: sanitizeRedisUrl(getRedisUrl())
    });
  });

  publishWorker.on("error", (error) => {
    logger.error("publish worker error", error);
  });

  metricsWorker.on("error", (error) => {
    logger.error("metrics worker error", error);
  });

  maintenanceWorker.on("error", (error) => {
    logger.error("maintenance worker error", error);
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
      await maintenanceWorker.close();
      await publishEvents.close();
      await metricsEvents.close();
      await maintenanceEvents.close();
      await publishQueue.close();
      await metricsQueue.close();
      await maintenanceQueue.close();
      await dbPool.end();
      process.exit(0);
    } catch (error) {
      logger.error("shutdown failed", error);
      process.exit(1);
    }
  };

  process.on("unhandledRejection", (reason) => {
    logger.error("unhandled promise rejection", reason instanceof Error ? reason : undefined, {
      reason: reason instanceof Error ? reason.message : String(reason)
    });
    if (process.env.NODE_ENV === "production") {
      void shutdown("unhandledRejection");
    }
  });

  process.on("uncaughtException", (error) => {
    logger.error("uncaught exception — shutting down", error);
    void shutdown("uncaughtException");
  });

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}
