import { Injectable, NotFoundException } from "@nestjs/common";
import { getPool } from "../../shared/db/pool";

export type StyleProfile = {
  avgLength: number;
  hashtagRatio: number;
  emojiRatio: number;
  ctaRatio: number;
  preferredTone: "concise" | "balanced" | "long";
};

const emojiPattern = /\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu;
const ctaPattern = /\b(join|try|read|check|follow|share|start|learn)\b/gi;

export function extractStyleProfile(texts: string[]): StyleProfile {
  const total = texts.length || 1;
  const lengths = texts.map((text) => text.trim().length);
  const avgLength = lengths.reduce((sum, value) => sum + value, 0) / total;
  const hashtagCount = texts.reduce((sum, text) => sum + (text.match(/#/g)?.length ?? 0), 0);
  const emojiCount = texts.reduce((sum, text) => sum + (text.match(emojiPattern)?.length ?? 0), 0);
  const ctaCount = texts.reduce((sum, text) => sum + (text.match(ctaPattern)?.length ?? 0), 0);

  return {
    avgLength: Number(avgLength.toFixed(2)),
    hashtagRatio: Number((hashtagCount / total).toFixed(2)),
    emojiRatio: Number((emojiCount / total).toFixed(2)),
    ctaRatio: Number((ctaCount / total).toFixed(2)),
    preferredTone: avgLength < 90 ? "concise" : avgLength < 180 ? "balanced" : "long"
  };
}

@Injectable()
export class StyleService {
  protected dbPool() {
    return getPool();
  }

  async extractAndPersist(workspaceId: string, accountId: string, sourceLimit = 30) {
    const source = await this.dbPool().query<{ text_body: string }>(
      `
        SELECT text_body
        FROM x_timeline_posts
        WHERE workspace_id = $1
          AND account_id = $2
        ORDER BY posted_at DESC
        LIMIT $3;
      `,
      [workspaceId, accountId, sourceLimit]
    );

    if (!source.rows.length) {
      throw new NotFoundException("No timeline posts found. Run timeline ingest first.");
    }

    const profile = extractStyleProfile(source.rows.map((row) => row.text_body));
    await this.dbPool().query(
      `
        INSERT INTO style_profiles (workspace_id, account_id, source_post_count, style_profile)
        VALUES ($1, $2, $3, $4::jsonb)
        ON CONFLICT (workspace_id, account_id)
        DO UPDATE SET
          source_post_count = EXCLUDED.source_post_count,
          style_profile = EXCLUDED.style_profile,
          updated_at = now();
      `,
      [workspaceId, accountId, source.rows.length, JSON.stringify(profile)]
    );

    await this.dbPool().query(
      `
        INSERT INTO audit_logs (workspace_id, action, entity_type, entity_id, result, metadata)
        VALUES ($1, 'style.extract', 'x_account', $2, 'success', $3::jsonb);
      `,
      [workspaceId, accountId, JSON.stringify({ sourcePostCount: source.rows.length })]
    );

    return {
      ok: true,
      sourcePostCount: source.rows.length,
      profile
    };
  }

  async getProfile(workspaceId: string, accountId: string) {
    const result = await this.dbPool().query<{ style_profile: StyleProfile; updated_at: string }>(
      `
        SELECT style_profile, updated_at
        FROM style_profiles
        WHERE workspace_id = $1
          AND account_id = $2;
      `,
      [workspaceId, accountId]
    );

    if (!result.rows[0]) {
      throw new NotFoundException("Style profile not found");
    }

    return result.rows[0];
  }
}
