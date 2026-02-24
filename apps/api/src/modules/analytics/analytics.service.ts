import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  evaluateFirstHourAlert,
  resolveFirstHourAlertThresholds,
  type FirstHourAlertLevel
} from "@growth-os/shared";
import { getPool } from "../../shared/db/pool";
import { captureApiEvent } from "../../shared/telemetry/api-telemetry";
import { XIntegrationService } from "../x_integration/x-integration.service";

type FirstHourAlert = {
  publishedPostId: string;
  externalPostId: string;
  windowKey: string;
  capturedAt: string;
  impressions: number;
  engagement: number;
  engagementRate: number;
  level: FirstHourAlertLevel;
  reasons: string[];
  thresholds: {
    minImpressions: number;
    minEngagementRate: number;
    criticalImpressions: number;
    criticalEngagementRate: number;
  };
};

type KpiRange = "24h" | "7d" | "30d";

type WorkspaceKpiSnapshot = {
  workspace_id: string;
  range: KpiRange;
  range_start: string;
  range_end: string;
  draft_to_publish_rate: number;
  first_hour_success_rate: number;
  policy_risk_rate: number;
  time_to_first_value: number | null;
  totals: {
    draft_count: number;
    published_count: number;
    first_hour_sample_count: number;
    first_hour_success_count: number;
    policy_job_count: number;
    policy_risk_count: number;
  };
};

type AddCompetitorParams = {
  workspaceId: string;
  handle: string;
  platform?: string;
  limit?: number;
};

type AddCompetitorResult = {
  ok: true;
  competitorAccountId: string;
  handle: string;
  platform: "x";
  xUserId: string;
  ingestedCount: number;
  metricsCapturedCount: number;
};

type CompetitorAccountSummary = {
  id: string;
  platform: "x";
  handle: string;
  xUserId: string | null;
  isActive: boolean;
  snapshotCount: number;
  lastCapturedAt: string | null;
};

type CompetitorOverviewPost = {
  competitorHandle: string;
  xPostId: string;
  textBody: string;
  postedAt: string;
  capturedAt: string;
  impressions: number;
  engagement: number;
  engagementRate: number;
  hookType: string;
};

type CompetitorOverview = {
  workspaceId: string;
  generatedAt: string;
  summary: {
    competitorCount: number;
    totalPosts: number;
    metricsCoverage: number;
  };
  competitors: CompetitorAccountSummary[];
  topHookTypes: Array<{ type: string; count: number }>;
  postingWindows: Array<{ hour: number; count: number }>;
  bestPerformingPosts: CompetitorOverviewPost[];
};

type CompetitorRawPostRow = {
  handle: string;
  x_post_id: string;
  text_body: string;
  posted_at: string;
  captured_at: string;
  metrics_json: unknown;
};

const kpiRangeToMs: Record<KpiRange, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000
};

const policyRiskErrorCodes = ["DUPLICATE_SIMILARITY", "RATE_LIMIT", "POLICY_REJECTED"] as const;
const supportedCompetitorPlatform = "x";
const hookPatternMatchers: Array<{ type: string; pattern: RegExp }> = [
  { type: "question", pattern: /\?/ },
  { type: "list", pattern: /\b(\d+[.)]|first|second|third)\b/i },
  { type: "how_to", pattern: /\bhow to\b/i },
  { type: "contrarian", pattern: /\bunpopular opinion\b/i },
  { type: "data_point", pattern: /\b\d+%|\b\d+[kKmM]\b|\b\d{2,}\b/ },
  { type: "story", pattern: /\b(today|yesterday|i learned|my take)\b/i }
];

function safeRate(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return 0;
  }
  return Number((numerator / denominator).toFixed(4));
}

function rangeStartFor(range: KpiRange) {
  return new Date(Date.now() - kpiRangeToMs[range]);
}

function minutesBetween(startIso: string | null, endIso: string | null) {
  if (!startIso || !endIso) {
    return null;
  }

  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }

  return Math.max(0, Math.round((end - start) / 60_000));
}

function normalizeCompetitorHandle(handle: string) {
  return handle.trim().replace(/^@+/, "").toLowerCase();
}

function parseMetricNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseMetrics(raw: unknown) {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const impressions = parseMetricNumber(record.impressions);
  const likes = parseMetricNumber(record.likes);
  const replies = parseMetricNumber(record.replies);
  const reposts = parseMetricNumber(record.reposts);
  const quotes = parseMetricNumber(record.quotes);
  const engagement = likes + replies + reposts + quotes;
  const engagementRate = impressions > 0 ? Number((engagement / impressions).toFixed(4)) : 0;

  return {
    impressions,
    likes,
    replies,
    reposts,
    quotes,
    engagement,
    engagementRate
  };
}

function detectHookType(textBody: string) {
  const normalized = textBody.toLowerCase();
  const matcher = hookPatternMatchers.find((item) => item.pattern.test(normalized));
  return matcher?.type ?? "statement";
}

function postingHour(postedAt: string) {
  const date = new Date(postedAt);
  if (Number.isNaN(date.getTime())) {
    return 0;
  }
  return date.getUTCHours();
}

function excerpt(textBody: string) {
  const trimmed = textBody.replace(/\s+/g, " ").trim();
  if (trimmed.length <= 180) {
    return trimmed;
  }
  return `${trimmed.slice(0, 177)}...`;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly xIntegrationService: XIntegrationService) {}

  protected dbPool() {
    return getPool();
  }

  private ensureSupportedPlatform(platform: string | undefined) {
    const normalized = (platform ?? supportedCompetitorPlatform).trim().toLowerCase();
    if (normalized !== supportedCompetitorPlatform) {
      throw new BadRequestException("Only platform=x is supported for competitor insights");
    }
    return normalized as "x";
  }

  private async rollbackQuietly(client: import("pg").PoolClient, context: string) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // no-op: preserve original error path
      void context;
    }
  }

  private async upsertCompetitorAccount(params: {
    client: import("pg").PoolClient;
    workspaceId: string;
    platform: "x";
    handle: string;
    xUserId: string;
  }) {
    const result = await params.client.query<{ id: string }>(
      `
        INSERT INTO competitor_accounts (workspace_id, platform, handle, x_user_id, is_active)
        VALUES ($1, $2, $3, $4, true)
        ON CONFLICT (workspace_id, platform, handle)
        DO UPDATE SET
          x_user_id = EXCLUDED.x_user_id,
          is_active = true,
          updated_at = now()
        RETURNING id;
      `,
      [params.workspaceId, params.platform, params.handle, params.xUserId]
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("Failed to upsert competitor account");
    }
    return row.id;
  }

  private async persistCompetitorPosts(params: {
    client: import("pg").PoolClient;
    competitorAccountId: string;
    posts: Array<{
      xPostId: string;
      textBody: string;
      postedAt: Date;
      metrics: {
        impressions: number;
        likes: number;
        replies: number;
        reposts: number;
        quotes: number;
      };
    }>;
  }) {
    for (const post of params.posts) {
      await params.client.query(
        `
          INSERT INTO competitor_post_snapshots (
            competitor_account_id,
            x_post_id,
            text_body,
            metrics_json,
            posted_at,
            captured_at
          )
          VALUES ($1, $2, $3, $4::jsonb, $5, now())
          ON CONFLICT (competitor_account_id, x_post_id)
          DO UPDATE SET
            text_body = EXCLUDED.text_body,
            metrics_json = EXCLUDED.metrics_json,
            posted_at = EXCLUDED.posted_at,
            captured_at = now();
        `,
        [
          params.competitorAccountId,
          post.xPostId,
          post.textBody,
          JSON.stringify(post.metrics),
          post.postedAt
        ]
      );
    }
  }

  async getSnapshotsForPublishedPost(workspaceId: string, publishedPostId: string) {
    const postResult = await this.dbPool().query<{ id: string; external_post_id: string }>(
      `
        SELECT id, external_post_id
        FROM published_posts
        WHERE id = $1
          AND workspace_id = $2;
      `,
      [publishedPostId, workspaceId]
    );

    if (!postResult.rows[0]) {
      throw new NotFoundException("Published post not found");
    }

    const snapshots = await this.dbPool().query<{
      window_key: string;
      impressions: number;
      likes: number;
      replies: number;
      reposts: number;
      quotes: number;
      captured_at: string;
    }>(
      `
        SELECT
          window_key,
          impressions,
          likes,
          replies,
          reposts,
          quotes,
          captured_at
        FROM post_metric_snapshots
        WHERE workspace_id = $1
          AND published_post_id = $2
        ORDER BY captured_at ASC;
      `,
      [workspaceId, publishedPostId]
    );

    if (snapshots.rows.length > 0) {
      captureApiEvent(
        "published",
        {
          publishedPostId,
          snapshotCount: snapshots.rows.length
        },
        { workspaceId, sampleRate: 0.1 }
      );
    }

    return {
      publishedPostId,
      externalPostId: postResult.rows[0].external_post_id,
      snapshots: snapshots.rows
    };
  }

  async getSnapshotsForContent(workspaceId: string, contentId: string) {
    const published = await this.dbPool().query<{ id: string; external_post_id: string }>(
      `
        SELECT id, external_post_id
        FROM published_posts
        WHERE workspace_id = $1
          AND content_id = $2
        ORDER BY created_at DESC
        LIMIT 1;
      `,
      [workspaceId, contentId]
    );

    if (!published.rows[0]) {
      throw new NotFoundException("No published post found for content");
    }

    return this.getSnapshotsForPublishedPost(workspaceId, published.rows[0].id);
  }

  async getFirstHourAlertForContent(
    workspaceId: string,
    contentId: string
  ): Promise<FirstHourAlert> {
    const snapshotResult = await this.getSnapshotsForContent(workspaceId, contentId);
    const firstHourSnapshot =
      snapshotResult.snapshots.find((snapshot) => snapshot.window_key === "t60") ??
      snapshotResult.snapshots[snapshotResult.snapshots.length - 1];

    if (!firstHourSnapshot) {
      throw new NotFoundException("No metrics snapshots found for published post");
    }

    const thresholds = resolveFirstHourAlertThresholds();
    const evaluation = evaluateFirstHourAlert(
      {
        impressions: firstHourSnapshot.impressions,
        likes: firstHourSnapshot.likes,
        replies: firstHourSnapshot.replies,
        reposts: firstHourSnapshot.reposts,
        quotes: firstHourSnapshot.quotes
      },
      thresholds
    );

    if (evaluation.level !== "ok") {
      captureApiEvent(
        "first_hour_alert_triggered",
        {
          contentId,
          level: evaluation.level,
          reasonCount: evaluation.reasons.length
        },
        { workspaceId, critical: true }
      );
    }

    return {
      publishedPostId: snapshotResult.publishedPostId,
      externalPostId: snapshotResult.externalPostId,
      windowKey: firstHourSnapshot.window_key,
      capturedAt: firstHourSnapshot.captured_at,
      impressions: firstHourSnapshot.impressions,
      engagement: evaluation.engagement,
      engagementRate: evaluation.engagementRate,
      level: evaluation.level,
      reasons: evaluation.reasons,
      thresholds: {
        minImpressions: thresholds.minImpressions,
        minEngagementRate: thresholds.minEngagementRate,
        criticalImpressions: thresholds.criticalImpressions,
        criticalEngagementRate: thresholds.criticalEngagementRate
      }
    };
  }

  async addCompetitorAccount(params: AddCompetitorParams): Promise<AddCompetitorResult> {
    const handle = normalizeCompetitorHandle(params.handle);
    if (!handle) {
      throw new BadRequestException("Competitor handle is required");
    }

    const platform = this.ensureSupportedPlatform(params.platform);
    const ingested = await this.xIntegrationService.ingestCompetitorTimeline(
      params.workspaceId,
      handle,
      params.limit ?? 12
    );

    const client = await this.dbPool().connect();
    try {
      await client.query("BEGIN");
      const competitorAccountId = await this.upsertCompetitorAccount({
        client,
        workspaceId: params.workspaceId,
        platform,
        handle: ingested.username,
        xUserId: ingested.xUserId
      });
      await this.persistCompetitorPosts({
        client,
        competitorAccountId,
        posts: ingested.posts
      });
      await client.query(
        `
          INSERT INTO audit_logs (workspace_id, action, entity_type, entity_id, result, metadata)
          VALUES ($1, 'analytics.competitor_ingest', 'competitor_account', $2, 'success', $3::jsonb);
        `,
        [
          params.workspaceId,
          competitorAccountId,
          JSON.stringify({
            handle: ingested.username,
            ingestedCount: ingested.posts.length,
            metricsCapturedCount: ingested.metricsCapturedCount,
            requestedLimit: ingested.requestedLimit
          })
        ]
      );
      await client.query("COMMIT");

      return {
        ok: true,
        competitorAccountId,
        handle: ingested.username,
        platform,
        xUserId: ingested.xUserId,
        ingestedCount: ingested.posts.length,
        metricsCapturedCount: ingested.metricsCapturedCount
      };
    } catch (error) {
      await this.rollbackQuietly(client, "competitor ingest");
      throw error;
    } finally {
      client.release();
    }
  }

  private async loadCompetitorAccountSummaries(
    workspaceId: string
  ): Promise<CompetitorAccountSummary[]> {
    const result = await this.dbPool().query<{
      id: string;
      platform: "x";
      handle: string;
      x_user_id: string | null;
      is_active: boolean;
      snapshot_count: number;
      last_captured_at: string | null;
    }>(
      `
        SELECT
          ca.id,
          ca.platform,
          ca.handle,
          ca.x_user_id,
          ca.is_active,
          COUNT(cps.id)::int AS snapshot_count,
          MAX(cps.captured_at)::text AS last_captured_at
        FROM competitor_accounts ca
        LEFT JOIN competitor_post_snapshots cps
          ON cps.competitor_account_id = ca.id
        WHERE ca.workspace_id = $1
          AND ca.is_active = true
        GROUP BY ca.id, ca.platform, ca.handle, ca.x_user_id, ca.is_active
        ORDER BY ca.updated_at DESC;
      `,
      [workspaceId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      platform: row.platform,
      handle: row.handle,
      xUserId: row.x_user_id,
      isActive: row.is_active,
      snapshotCount: row.snapshot_count,
      lastCapturedAt: row.last_captured_at
    }));
  }

  private async loadCompetitorPosts(workspaceId: string): Promise<CompetitorRawPostRow[]> {
    const result = await this.dbPool().query<CompetitorRawPostRow>(
      `
        SELECT
          ca.handle,
          cps.x_post_id,
          cps.text_body,
          cps.posted_at::text AS posted_at,
          cps.captured_at::text AS captured_at,
          cps.metrics_json
        FROM competitor_post_snapshots cps
        JOIN competitor_accounts ca
          ON ca.id = cps.competitor_account_id
        WHERE ca.workspace_id = $1
          AND ca.is_active = true
        ORDER BY cps.captured_at DESC
        LIMIT 500;
      `,
      [workspaceId]
    );

    return result.rows;
  }

  private buildCompetitorOverview(
    workspaceId: string,
    competitors: CompetitorAccountSummary[],
    posts: CompetitorRawPostRow[]
  ): CompetitorOverview {
    const hookCounts = new Map<string, number>();
    const hourCounts = new Map<number, number>();
    const normalizedPosts = posts.map((row) => {
      const metrics = parseMetrics(row.metrics_json);
      const hookType = detectHookType(row.text_body);
      hookCounts.set(hookType, (hookCounts.get(hookType) ?? 0) + 1);

      const hour = postingHour(row.posted_at);
      hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);

      return {
        competitorHandle: row.handle,
        xPostId: row.x_post_id,
        textBody: excerpt(row.text_body),
        postedAt: row.posted_at,
        capturedAt: row.captured_at,
        impressions: metrics.impressions,
        engagement: metrics.engagement,
        engagementRate: metrics.engagementRate,
        hookType
      };
    });

    const metricsCoveredCount = normalizedPosts.filter((row) => row.impressions > 0).length;
    const topHookTypes = [...hookCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 6)
      .map(([type, count]) => ({ type, count }));
    const postingWindows = [...hourCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([hour, count]) => ({ hour, count }));
    const bestPerformingPosts = [...normalizedPosts]
      .sort(
        (left, right) =>
          right.engagementRate - left.engagementRate || right.engagement - left.engagement
      )
      .slice(0, 5);

    return {
      workspaceId,
      generatedAt: new Date().toISOString(),
      summary: {
        competitorCount: competitors.length,
        totalPosts: normalizedPosts.length,
        metricsCoverage: safeRate(metricsCoveredCount, Math.max(normalizedPosts.length, 1))
      },
      competitors,
      topHookTypes,
      postingWindows,
      bestPerformingPosts
    };
  }

  async getCompetitorOverview(workspaceId: string): Promise<CompetitorOverview> {
    const [competitors, posts] = await Promise.all([
      this.loadCompetitorAccountSummaries(workspaceId),
      this.loadCompetitorPosts(workspaceId)
    ]);

    return this.buildCompetitorOverview(workspaceId, competitors, posts);
  }

  private async loadDraftPublishStats(workspaceId: string, rangeStart: Date) {
    const result = await this.dbPool().query<{
      draft_count: number;
      published_count: number;
    }>(
      `
        SELECT
          COUNT(*)::int AS draft_count,
          COUNT(*) FILTER (WHERE status = 'published')::int AS published_count
        FROM contents
        WHERE workspace_id = $1
          AND created_at >= $2;
      `,
      [workspaceId, rangeStart]
    );

    return {
      draftCount: result.rows[0]?.draft_count ?? 0,
      publishedCount: result.rows[0]?.published_count ?? 0
    };
  }

  private async loadFirstHourStats(workspaceId: string, rangeStart: Date) {
    const rows = await this.dbPool().query<{
      impressions: number;
      likes: number;
      replies: number;
      reposts: number;
      quotes: number;
    }>(
      `
        SELECT impressions, likes, replies, reposts, quotes
        FROM post_metric_snapshots
        WHERE workspace_id = $1
          AND window_key = 't60'
          AND captured_at >= $2;
      `,
      [workspaceId, rangeStart]
    );

    const thresholds = resolveFirstHourAlertThresholds();
    let successCount = 0;
    for (const snapshot of rows.rows) {
      const evaluation = evaluateFirstHourAlert(snapshot, thresholds);
      if (evaluation.level === "ok") {
        successCount += 1;
      }
    }

    return { sampleCount: rows.rows.length, successCount };
  }

  private async loadPolicyRiskStats(workspaceId: string, rangeStart: Date) {
    const result = await this.dbPool().query<{
      job_count: number;
      risk_count: number;
    }>(
      `
        SELECT
          COUNT(*)::int AS job_count,
          COUNT(*) FILTER (WHERE last_error_code = ANY($3::text[]))::int AS risk_count
        FROM publish_jobs
        WHERE workspace_id = $1
          AND created_at >= $2;
      `,
      [workspaceId, rangeStart, policyRiskErrorCodes]
    );

    return {
      jobCount: result.rows[0]?.job_count ?? 0,
      riskCount: result.rows[0]?.risk_count ?? 0
    };
  }

  private async loadTimeToFirstValueMinutes(workspaceId: string, rangeStart: Date) {
    const result = await this.dbPool().query<{
      first_draft_at: string | null;
      first_published_at: string | null;
    }>(
      `
        SELECT
          (
            SELECT MIN(created_at)::text
            FROM contents
            WHERE workspace_id = $1
              AND created_at >= $2
          ) AS first_draft_at,
          (
            SELECT MIN(published_at)::text
            FROM published_posts
            WHERE workspace_id = $1
              AND published_at >= $2
          ) AS first_published_at;
      `,
      [workspaceId, rangeStart]
    );

    const firstDraftAt = result.rows[0]?.first_draft_at ?? null;
    const firstPublishedAt = result.rows[0]?.first_published_at ?? null;
    return minutesBetween(firstDraftAt, firstPublishedAt);
  }

  async getWorkspaceKpi(
    workspaceId: string,
    range: KpiRange = "7d"
  ): Promise<WorkspaceKpiSnapshot> {
    const rangeStart = rangeStartFor(range);
    const rangeEnd = new Date();

    const [draftStats, firstHourStats, policyStats, timeToFirstValue] = await Promise.all([
      this.loadDraftPublishStats(workspaceId, rangeStart),
      this.loadFirstHourStats(workspaceId, rangeStart),
      this.loadPolicyRiskStats(workspaceId, rangeStart),
      this.loadTimeToFirstValueMinutes(workspaceId, rangeStart)
    ]);

    return {
      workspace_id: workspaceId,
      range,
      range_start: rangeStart.toISOString(),
      range_end: rangeEnd.toISOString(),
      draft_to_publish_rate: safeRate(draftStats.publishedCount, draftStats.draftCount),
      first_hour_success_rate: safeRate(firstHourStats.successCount, firstHourStats.sampleCount),
      policy_risk_rate: safeRate(policyStats.riskCount, policyStats.jobCount),
      time_to_first_value: timeToFirstValue,
      totals: {
        draft_count: draftStats.draftCount,
        published_count: draftStats.publishedCount,
        first_hour_sample_count: firstHourStats.sampleCount,
        first_hour_success_count: firstHourStats.successCount,
        policy_job_count: policyStats.jobCount,
        policy_risk_count: policyStats.riskCount
      }
    };
  }
}
