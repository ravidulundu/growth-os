import { Injectable, NotFoundException } from "@nestjs/common";
import { getPool } from "../../shared/db/pool";
import { BillingService } from "../billing/billing.service";
import type { StyleProfile } from "../style/style.service";

export type ContentType = "tweet" | "thread" | "reply" | "quote";

type PromptTemplate = {
  name: string;
  systemPrompt: string;
  userPromptTemplate: string;
  promptConfig: Record<string, unknown>;
  contentType: ContentType;
  isActive: boolean;
};

type PromptTemplateRow = {
  name: string;
  content_type: ContentType;
  system_prompt: string;
  user_prompt_template: string;
  prompt_config: Record<string, unknown> | null;
  is_active: boolean;
};

const CTA_PATTERN = /\b(join|try|read|check|follow|share|start|learn)\b/gi;
const ABSOLUTE_CLAIM_PATTERN = /\b(kesin|garanti|asla|mutlaka|100%)\b/gi;

function contentPrefix(type: ContentType) {
  if (type === "thread") {
    return "Thread taslağı";
  }
  if (type === "reply") {
    return "Reply taslağı";
  }
  if (type === "quote") {
    return "Quote taslağı";
  }
  return "Tweet taslağı";
}

function typeInstruction(type: ContentType) {
  if (type === "thread") {
    return "4 maddelik numaralı bir thread yaz. Her satırı `1/`, `2/` şeklinde başlat.";
  }
  if (type === "reply") {
    return "Tek mesajlık, yapıcı ve net bir reply yaz.";
  }
  if (type === "quote") {
    return "Tek mesajlık, içgörü odaklı bir quote-post yorumu yaz.";
  }
  return "Tek paragraflık, yayınlanabilir bir tweet yaz.";
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

  const hookSummary = style.hookPatterns
    .filter((pattern) => pattern.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 2)
    .map((item) => item.label)
    .join(", ");

  return [
    `Ton: ${style.preferredTone}.`,
    `Ortalama uzunluk hedefi: ${style.avgLength}.`,
    `Format tercihi: ${style.preferredFormat}.`,
    `Dil register: ${style.languageRegister}.`,
    `Hashtag oranı: ${style.hashtagRatio}.`,
    `Emoji oranı: ${style.emojiRatio}.`,
    `CTA oranı: ${style.ctaRatio}.`,
    hookSummary ? `Öne çıkan kanca tipleri: ${hookSummary}.` : ""
  ]
    .filter(Boolean)
    .join(" ");
}

function defaultTemplate(type: ContentType): PromptTemplate {
  if (type === "thread") {
    return {
      name: "default-thread",
      systemPrompt:
        "Write structured 4-part Turkish threads with clear progression and practical advice.",
      userPromptTemplate:
        "Türkçe 4 parçalı thread yaz. Konu: {{topic}}. Stil: {{style}}. Ek talimat: {{prompt_input}}.",
      promptConfig: { parts: 4 },
      contentType: type,
      isActive: true
    };
  }

  if (type === "reply") {
    return {
      name: "default-reply",
      systemPrompt:
        "Write concise, constructive Turkish replies that add value and avoid confrontation.",
      userPromptTemplate:
        "Yapıcı bir reply yaz. Bağlam/konu: {{topic}}. Stil: {{style}}. Ek talimat: {{prompt_input}}.",
      promptConfig: { tone: "helpful" },
      contentType: type,
      isActive: true
    };
  }

  if (type === "quote") {
    return {
      name: "default-quote",
      systemPrompt:
        "Write sharp Turkish quote-post commentary with one insight and one practical takeaway.",
      userPromptTemplate:
        "Quote tweet yorumu yaz. Bağlam/konu: {{topic}}. Stil: {{style}}. Ek talimat: {{prompt_input}}.",
      promptConfig: { tone: "insightful" },
      contentType: type,
      isActive: true
    };
  }

  return {
    name: "default-tweet",
    systemPrompt: "Write concise, practical Turkish tweets with clear value.",
    userPromptTemplate:
      "Türkçe tweet yaz. Konu: {{topic}}. Stil: {{style}}. Ek talimat: {{prompt_input}}.",
    promptConfig: { maxChars: 280 },
    contentType: type,
    isActive: true
  };
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

function toPromptTemplate(row: PromptTemplateRow): PromptTemplate {
  return {
    name: row.name,
    systemPrompt: row.system_prompt,
    userPromptTemplate: row.user_prompt_template,
    promptConfig: isRecord(row.prompt_config) ? row.prompt_config : {},
    contentType: row.content_type,
    isActive: row.is_active
  };
}

function interpolateTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_full, key: string) => {
    return values[key] ?? "";
  });
}

function buildOpenRouterPrompt(input: {
  topic: string;
  type: ContentType;
  promptInput?: string;
  style?: StyleProfile;
  template: PromptTemplate;
}) {
  const extraPrompt = input.promptInput?.trim() || "Yok";
  const values = {
    topic: input.topic,
    type: input.type,
    style: styleInstruction(input.style),
    prompt_input: extraPrompt
  };

  const templatePrompt = interpolateTemplate(input.template.userPromptTemplate, values);
  const userPrompt = [
    "Türkçe içerik üret.",
    typeInstruction(input.type),
    templatePrompt,
    "Gereksiz abartı, emoji spam, provokatif veya yanıltıcı iddia kullanma.",
    "Aynı cümleyi tekrar etme."
  ].join(" ");

  return {
    systemPrompt: input.template.systemPrompt,
    userPrompt
  };
}

function splitTextParts(text: string, type: ContentType) {
  if (type === "thread") {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }

  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function dedupeParts(text: string, type: ContentType) {
  const uniqueParts: string[] = [];
  const seen = new Set<string>();

  for (const part of splitTextParts(text, type)) {
    const normalized = part.toLocaleLowerCase("tr").replace(/\s+/g, " ").trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    uniqueParts.push(part);
  }

  if (uniqueParts.length === 0) {
    return text.trim();
  }

  return type === "thread" ? uniqueParts.join("\n") : uniqueParts.join(" ");
}

function softenAbsoluteClaims(text: string) {
  return text.replace(ABSOLUTE_CLAIM_PATTERN, (match) => {
    const lower = match.toLocaleLowerCase("tr");
    if (lower === "kesin" || lower === "garanti") {
      return "muhtemelen";
    }
    if (lower === "asla") {
      return "genelde";
    }
    if (lower === "mutlaka") {
      return "çoğunlukla";
    }
    if (lower === "100%") {
      return "yüksek olasılıkla";
    }
    return match;
  });
}

function limitCtaMentions(text: string, maxMentions: number) {
  let seen = 0;
  const replaced = text.replace(CTA_PATTERN, (token) => {
    if (seen < maxMentions) {
      seen += 1;
      return token;
    }
    return "";
  });

  return replaced
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;!?])/g, "$1")
    .trim();
}

function normalizeGeneratedText(text: string, type: ContentType) {
  if (type === "thread") {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n");
  }

  return text.replace(/\s+/g, " ").trim();
}

export function applyGenerationGuardrails(text: string, type: ContentType) {
  const deduped = dedupeParts(text, type);
  const softened = softenAbsoluteClaims(deduped);
  const ctaLimited = limitCtaMentions(softened, type === "thread" ? 3 : 2);
  return normalizeGeneratedText(ctaLimited, type);
}

async function requestOpenRouterCompletion(input: {
  topic: string;
  type: ContentType;
  promptInput?: string;
  style?: StyleProfile;
  template: PromptTemplate;
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

  const prompt = buildOpenRouterPrompt(input);

  const response = await fetch(`${openRouterBaseUrl()}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: openRouterModel(),
      temperature: 0.6,
      messages: [
        {
          role: "system",
          content: prompt.systemPrompt
        },
        {
          role: "user",
          content: prompt.userPrompt
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
      "2/ Ana fikir: problemi net isimlendir, çözümü küçük adımlarla uygula.",
      `3/ ${toneHint}`,
      "4/ Sonuç: bugün tek bir adım seç ve yayınla."
    ].join("\n");
  }

  if (input.type === "reply") {
    return `Yanıt: ${input.topic}. Kısa, yapıcı ve net bir katkı sun. ${toneHint}`;
  }

  if (input.type === "quote") {
    return `Quote yorumu: ${input.topic}. Bir içgörü ver ve tek bir uygulanabilir çıkarım bırak. ${toneHint}`;
  }

  return `${input.topic}: problemi sadeleştir, küçük adımlarla yayınla. ${toneHint}`;
}

@Injectable()
export class GenerationService {
  constructor(private readonly billingService: BillingService = new BillingService()) {}

  protected dbPool() {
    return getPool();
  }

  protected async findPromptTemplate(
    workspaceId: string,
    type: ContentType,
    templateName?: string
  ): Promise<PromptTemplate> {
    const queryParams: string[] = [workspaceId, type];
    const nameFilter = templateName?.trim();

    let sql = `
      SELECT name, content_type, system_prompt, user_prompt_template, prompt_config, is_active
      FROM prompt_templates
      WHERE workspace_id = $1
        AND content_type = $2
        AND is_active = true
    `;

    if (nameFilter) {
      queryParams.push(nameFilter);
      sql += " AND name = $3";
    }

    sql += " ORDER BY updated_at DESC LIMIT 1;";

    const result = await this.dbPool().query<PromptTemplateRow>(sql, queryParams);
    if (!result.rows[0]) {
      return defaultTemplate(type);
    }
    return toPromptTemplate(result.rows[0]);
  }

  async listPromptTemplates(workspaceId: string, contentType?: ContentType) {
    const params: string[] = [workspaceId];
    let sql = `
      SELECT name, content_type, system_prompt, user_prompt_template, prompt_config, is_active, updated_at
      FROM prompt_templates
      WHERE workspace_id = $1
    `;

    if (contentType) {
      params.push(contentType);
      sql += " AND content_type = $2";
    }

    sql += " ORDER BY updated_at DESC;";

    const result = await this.dbPool().query<{
      name: string;
      content_type: ContentType;
      system_prompt: string;
      user_prompt_template: string;
      prompt_config: Record<string, unknown> | null;
      is_active: boolean;
      updated_at: string;
    }>(sql, params);

    return result.rows.map((row) => ({
      name: row.name,
      contentType: row.content_type,
      systemPrompt: row.system_prompt,
      userPromptTemplate: row.user_prompt_template,
      promptConfig: isRecord(row.prompt_config) ? row.prompt_config : {},
      isActive: row.is_active,
      updatedAt: row.updated_at
    }));
  }

  async upsertPromptTemplate(params: {
    workspaceId: string;
    name: string;
    contentType: ContentType;
    systemPrompt: string;
    userPromptTemplate: string;
    promptConfig?: Record<string, unknown>;
    isActive?: boolean;
  }) {
    const isActive = params.isActive ?? true;
    const result = await this.dbPool().query<{
      name: string;
      content_type: ContentType;
      system_prompt: string;
      user_prompt_template: string;
      prompt_config: Record<string, unknown> | null;
      is_active: boolean;
      updated_at: string;
    }>(
      `
        INSERT INTO prompt_templates (
          workspace_id,
          name,
          content_type,
          system_prompt,
          user_prompt_template,
          prompt_config,
          is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
        ON CONFLICT (workspace_id, name)
        DO UPDATE SET
          content_type = EXCLUDED.content_type,
          system_prompt = EXCLUDED.system_prompt,
          user_prompt_template = EXCLUDED.user_prompt_template,
          prompt_config = EXCLUDED.prompt_config,
          is_active = EXCLUDED.is_active,
          updated_at = now()
        RETURNING name, content_type, system_prompt, user_prompt_template, prompt_config, is_active, updated_at;
      `,
      [
        params.workspaceId,
        params.name,
        params.contentType,
        params.systemPrompt,
        params.userPromptTemplate,
        JSON.stringify(params.promptConfig ?? {}),
        isActive
      ]
    );

    const row = result.rows[0];
    return {
      name: row.name,
      contentType: row.content_type,
      systemPrompt: row.system_prompt,
      userPromptTemplate: row.user_prompt_template,
      promptConfig: isRecord(row.prompt_config) ? row.prompt_config : {},
      isActive: row.is_active,
      updatedAt: row.updated_at
    };
  }

  protected async generateDraftText(input: {
    topic: string;
    type: ContentType;
    promptInput?: string;
    style?: StyleProfile;
    template: PromptTemplate;
  }) {
    const fallbackText = applyGenerationGuardrails(buildGeneratedText(input), input.type);

    if (llmProvider() !== "openrouter") {
      return fallbackText;
    }

    const generatedText = await requestOpenRouterCompletion(input);
    if (!generatedText || generatedText.length === 0) {
      return fallbackText;
    }

    return applyGenerationGuardrails(generatedText, input.type);
  }

  async createDraft(params: {
    workspaceId: string;
    accountId: string;
    topic: string;
    type: ContentType;
    promptInput?: string;
    templateName?: string;
  }) {
    const [styleResult, template] = await Promise.all([
      this.dbPool().query<{ style_profile: StyleProfile }>(
        `
          SELECT style_profile
          FROM style_profiles
          WHERE workspace_id = $1
            AND account_id = $2;
        `,
        [params.workspaceId, params.accountId]
      ),
      this.findPromptTemplate(params.workspaceId, params.type, params.templateName)
    ]);

    const generatedText = await this.generateDraftText({
      topic: params.topic,
      type: params.type,
      promptInput: params.promptInput,
      style: styleResult.rows[0]?.style_profile,
      template
    });

    const client = await this.dbPool().connect();
    try {
      await client.query("BEGIN");
      const metering = await this.billingService.enforceGenerationLimit(
        params.workspaceId,
        this.billingService.newTransactionExecutor(client),
        1
      );
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
        [
          contentResult.rows[0].id,
          generatedText,
          JSON.stringify({
            topic: params.topic,
            type: params.type,
            templateName: template.name,
            templateConfig: template.promptConfig
          })
        ]
      );

      await client.query(
        `
          INSERT INTO usage_events (workspace_id, account_id, event_type, endpoint_key, units, metadata)
          VALUES ($1, $2, 'content.generate', 'generation.draft', 1, $3::jsonb);
        `,
        [
          params.workspaceId,
          params.accountId,
          JSON.stringify({
            type: params.type,
            templateName: template.name,
            planKey: metering.planKey
          })
        ]
      );

      await client.query(
        `
          INSERT INTO audit_logs (workspace_id, action, entity_type, entity_id, result, metadata)
          VALUES ($1, 'generation.create_draft', 'content', $2, 'success', $3::jsonb);
        `,
        [
          params.workspaceId,
          contentResult.rows[0].id,
          JSON.stringify({ topic: params.topic, type: params.type, templateName: template.name })
        ]
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
