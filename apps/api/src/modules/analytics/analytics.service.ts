import { Injectable, NotFoundException } from "@nestjs/common";
import { getPool } from "../../shared/db/pool";

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
}
