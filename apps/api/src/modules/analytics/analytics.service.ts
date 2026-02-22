import { Injectable, NotFoundException } from "@nestjs/common";
import { getPool } from "../../shared/db/pool";

type AlertLevel = "ok" | "watch" | "critical";

type FirstHourAlert = {
  publishedPostId: string;
  externalPostId: string;
  windowKey: string;
  capturedAt: string;
  impressions: number;
  engagement: number;
  engagementRate: number;
  level: AlertLevel;
  reasons: string[];
  thresholds: {
    minImpressions: number;
    minEngagementRate: number;
    criticalImpressions: number;
    criticalEngagementRate: number;
  };
};

function envNumber(key: string, fallback: number) {
  const raw = process.env[key];
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

@Injectable()
export class AnalyticsService {
  protected dbPool() {
    return getPool();
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

    const minImpressions = envNumber("FIRST_HOUR_ALERT_MIN_IMPRESSIONS", 250);
    const minEngagementRate = envNumber("FIRST_HOUR_ALERT_MIN_ENGAGEMENT_RATE", 0.03);
    const criticalImpressions = envNumber("FIRST_HOUR_ALERT_CRITICAL_IMPRESSIONS", 100);
    const criticalEngagementRate = envNumber("FIRST_HOUR_ALERT_CRITICAL_ENGAGEMENT_RATE", 0.015);

    const engagement =
      firstHourSnapshot.likes +
      firstHourSnapshot.replies +
      firstHourSnapshot.reposts +
      firstHourSnapshot.quotes;
    const engagementRate =
      firstHourSnapshot.impressions > 0 ? engagement / firstHourSnapshot.impressions : 0;

    const reasons: string[] = [];
    let level: AlertLevel = "ok";

    if (firstHourSnapshot.impressions < criticalImpressions) {
      level = "critical";
      reasons.push("critical_impressions");
    } else if (firstHourSnapshot.impressions < minImpressions) {
      level = "watch";
      reasons.push("low_impressions");
    }

    if (engagementRate < criticalEngagementRate) {
      level = "critical";
      reasons.push("critical_engagement_rate");
    } else if (engagementRate < minEngagementRate) {
      if (level !== "critical") {
        level = "watch";
      }
      reasons.push("low_engagement_rate");
    }

    return {
      publishedPostId: snapshotResult.publishedPostId,
      externalPostId: snapshotResult.externalPostId,
      windowKey: firstHourSnapshot.window_key,
      capturedAt: firstHourSnapshot.captured_at,
      impressions: firstHourSnapshot.impressions,
      engagement,
      engagementRate: Number(engagementRate.toFixed(4)),
      level,
      reasons,
      thresholds: {
        minImpressions,
        minEngagementRate,
        criticalImpressions,
        criticalEngagementRate
      }
    };
  }
}
