import { Injectable, NotFoundException } from "@nestjs/common";
import { getPool } from "../../shared/db/pool";
import type { StyleProfile } from "../style/style.service";

export type ContentType = "tweet" | "thread";

function contentPrefix(type: ContentType) {
  return type === "thread" ? "Thread taslağı" : "Tweet taslağı";
}

function normalizeEnvValue(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function llmProvider() {
  const explicitProvider = normalizeEnvValue(process.env.LLM_PROVIDER);
  if (explicitProvider === "openrouter") {
    return "openrouter" as const;
  }
  if (explicitProvider === "stub") {
    return "stub" as const;
  }
  return normalizeEnvValue(process.env.OPENROUTER_API_KEY)
    ? ("openrouter" as const)
    : ("stub" as const);
}

function openRouterModel() {
  return (
    normalizeEnvValue(process.env.OPENROUTER_MODEL) ??
    normalizeEnvValue(process.env.OPENAI_MODEL) ??
    "openai/gpt-4o-mini"
  );
}

function openRouterBaseUrl() {
  return normalizeEnvValue(process.env.OPENROUTER_BASE_URL) ?? "https://openrouter.ai/api/v1";
}

function styleInstruction(style: StyleProfile | undefined) {
  if (!style) {
    return "Ton dengeli ve net olsun; kısa ve anlaşılır cümleler kullan.";
  }
  return [
    `Ton: ${style.preferredTone}.`,
    `Ortalama uzunluk hedefi: ${style.avgLength}.`,
    `Hashtag oranı: ${style.hashtagRatio}.`,
    `Emoji oranı: ${style.emojiRatio}.`,
    `CTA oranı: ${style.ctaRatio}.`
  ].join(" ");
}

function buildOpenRouterPrompt(input: {
  topic: string;
  type: ContentType;
  promptInput?: string;
  style?: StyleProfile;
}) {
  const extraPrompt = input.promptInput?.trim();
  const typeInstruction =
    input.type === "thread"
      ? "4 maddelik numaralı bir thread yaz. Her satırı `1/`, `2/` şeklinde başlat."
      : "Tek paragraflık, yayınlanabilir bir tweet yaz.";

  return [
    "Türkçe içerik üret.",
    typeInstruction,
    styleInstruction(input.style),
    `Konu: ${input.topic}.`,
    extraPrompt ? `Ek talimat: ${extraPrompt}.` : "Ek talimat yok.",
    "Gereksiz abartı, emoji spam ve yanıltıcı vaat kullanma."
  ].join(" ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractOpenRouterContent(payload: unknown) {
  if (!isRecord(payload)) {
    return undefined;
  }
  const choices = payload.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return undefined;
  }
  const firstChoice = choices[0];
  if (!isRecord(firstChoice)) {
    return undefined;
  }
  const message = firstChoice.message;
  if (!isRecord(message)) {
    return undefined;
  }
  const content = message.content;
  return typeof content === "string" ? content.trim() : undefined;
}

async function requestOpenRouterCompletion(input: {
  topic: string;
  type: ContentType;
  promptInput?: string;
  style?: StyleProfile;
}) {
  const apiKey = normalizeEnvValue(process.env.OPENROUTER_API_KEY);
  if (!apiKey) {
    return undefined;
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
  const appUrl = normalizeEnvValue(process.env.APP_URL);
  if (appUrl) {
    headers["HTTP-Referer"] = appUrl;
  }

  const title = normalizeEnvValue(process.env.OPENROUTER_APP_NAME) ?? "growth-os";
  headers["X-Title"] = title;

  const response = await fetch(`${openRouterBaseUrl()}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: openRouterModel(),
      temperature: 0.6,
      messages: [
        {
          role: "system",
          content:
            "You are a social media writing assistant. Return only the final publish-ready text with no extra explanation."
        },
        {
          role: "user",
          content: buildOpenRouterPrompt(input)
        }
      ]
    })
  });

  if (!response.ok) {
    return undefined;
  }

  const payload = (await response.json()) as unknown;
  return extractOpenRouterContent(payload);
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

  protected async generateDraftText(input: {
    topic: string;
    type: ContentType;
    promptInput?: string;
    style?: StyleProfile;
  }) {
    const fallbackText = buildGeneratedText(input);
    if (llmProvider() !== "openrouter") {
      return fallbackText;
    }

    const generatedText = await requestOpenRouterCompletion(input);
    return generatedText && generatedText.length > 0 ? generatedText : fallbackText;
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

    const generatedText = await this.generateDraftText({
      topic: params.topic,
      type: params.type,
      promptInput: params.promptInput,
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
