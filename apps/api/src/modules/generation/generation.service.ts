import { Injectable, NotFoundException } from "@nestjs/common";
import { getPool } from "../../shared/db/pool";
import type { StyleProfile } from "../style/style.service";

export type ContentType = "tweet" | "thread";

function contentPrefix(type: ContentType) {
  return type === "thread" ? "Thread taslağı" : "Tweet taslağı";
}

export function buildGeneratedText(input: {
  topic: string;
  type: ContentType;
  style?: StyleProfile;
}) {
  const toneHint = input.style
    ? `Ton: ${input.style.preferredTone}, ortalama uzunluk: ${input.style.avgLength}.`
    : "Ton: dengeli ve net.";

  if (input.type === "thread") {
    return [
      `1/ ${contentPrefix(input.type)} - ${input.topic}`,
      `2/ Ana fikir: problemi net isimlendir, çözümü küçük adımlarla uygula.`,
      `3/ ${toneHint}`,
      `4/ Sonuç: bugün tek bir adım seç ve yayınla.`
    ].join("\n");
  }

  return `${input.topic}: problemi sadeleştir, küçük adımlarla yayınla. ${toneHint}`;
}

@Injectable()
export class GenerationService {
  protected dbPool() {
    return getPool();
  }

  async createDraft(params: {
    workspaceId: string;
    accountId: string;
    topic: string;
    type: ContentType;
    promptInput?: string;
  }) {
    const styleResult = await this.dbPool().query<{ style_profile: StyleProfile }>(
      `
        SELECT style_profile
        FROM style_profiles
        WHERE workspace_id = $1
          AND account_id = $2;
      `,
      [params.workspaceId, params.accountId]
    );

    const generatedText = buildGeneratedText({
      topic: params.topic,
      type: params.type,
      style: styleResult.rows[0]?.style_profile
    });

    const client = await this.dbPool().connect();
    try {
      await client.query("BEGIN");
      const contentResult = await client.query<{ id: string }>(
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
          VALUES ($1, $2, $3, 'draft', $4, $5, $6)
          RETURNING id;
        `,
        [
          params.workspaceId,
          params.accountId,
          params.type,
          params.topic,
          params.promptInput ?? params.topic,
          generatedText
        ]
      );

      await client.query(
        `
          INSERT INTO content_versions (content_id, version_no, text_body, prompt_config)
          VALUES ($1, 1, $2, $3::jsonb);
        `,
        [contentResult.rows[0].id, generatedText, JSON.stringify({ topic: params.topic })]
      );

      await client.query(
        `
          INSERT INTO usage_events (workspace_id, account_id, event_type, endpoint_key, units, metadata)
          VALUES ($1, $2, 'content.generate', 'generation.draft', 1, $3::jsonb);
        `,
        [params.workspaceId, params.accountId, JSON.stringify({ type: params.type })]
      );

      await client.query(
        `
          INSERT INTO audit_logs (workspace_id, action, entity_type, entity_id, result, metadata)
          VALUES ($1, 'generation.create_draft', 'content', $2, 'success', $3::jsonb);
        `,
        [params.workspaceId, contentResult.rows[0].id, JSON.stringify({ topic: params.topic })]
      );

      await client.query("COMMIT");
      return {
        ok: true,
        contentId: contentResult.rows[0].id,
        text: generatedText
      };
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // noop
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async createVersion(params: { workspaceId: string; contentId: string; textBody: string }) {
    const client = await this.dbPool().connect();
    try {
      await client.query("BEGIN");
      const contentResult = await client.query<{ id: string }>(
        `
          SELECT id
          FROM contents
          WHERE id = $1
            AND workspace_id = $2
          FOR UPDATE;
        `,
        [params.contentId, params.workspaceId]
      );

      if (!contentResult.rows[0]) {
        throw new NotFoundException("Content not found");
      }

      const versionResult = await client.query<{ next_version: number }>(
        `
          SELECT COALESCE(MAX(version_no), 0) + 1 AS next_version
          FROM content_versions
          WHERE content_id = $1;
        `,
        [params.contentId]
      );

      const nextVersion = Number(versionResult.rows[0].next_version);
      await client.query(
        `
          INSERT INTO content_versions (content_id, version_no, text_body, prompt_config)
          VALUES ($1, $2, $3, '{}'::jsonb);
        `,
        [params.contentId, nextVersion, params.textBody]
      );

      await client.query(
        `
          UPDATE contents
          SET current_text = $2,
              updated_at = now()
          WHERE id = $1;
        `,
        [params.contentId, params.textBody]
      );

      await client.query(
        `
          INSERT INTO audit_logs (workspace_id, action, entity_type, entity_id, result)
          VALUES ($1, 'generation.create_version', 'content', $2, 'success');
        `,
        [params.workspaceId, params.contentId]
      );

      await client.query("COMMIT");
      return { ok: true, versionNo: nextVersion };
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // noop
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async listContentVersions(workspaceId: string, contentId: string) {
    const contentCheck = await this.dbPool().query<{ id: string }>(
      `SELECT id FROM contents WHERE id = $1 AND workspace_id = $2`,
      [contentId, workspaceId]
    );

    if (!contentCheck.rows[0]) {
      throw new NotFoundException("Content not found");
    }

    const versions = await this.dbPool().query<{
      version_no: number;
      text_body: string;
      created_at: string;
    }>(
      `
        SELECT version_no, text_body, created_at
        FROM content_versions
        WHERE content_id = $1
        ORDER BY version_no ASC;
      `,
      [contentId]
    );

    return versions.rows;
  }
}
