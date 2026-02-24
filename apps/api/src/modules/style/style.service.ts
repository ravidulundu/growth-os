import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { z } from "zod";
import { getPool } from "../../shared/db/pool";

export type StyleTone = "concise" | "balanced" | "long";
export type PreferredFormat = "single" | "thread" | "mixed";
export type LanguageRegister = "formal" | "neutral" | "informal";

export type StyleHookPattern = {
  key: string;
  label: string;
  count: number;
  examples: string[];
};

export type SentenceRhythm = {
  avgSentenceLength: number;
  shortSentenceRatio: number;
  mediumSentenceRatio: number;
  longSentenceRatio: number;
};

export type StyleProfile = {
  avgLength: number;
  hashtagRatio: number;
  emojiRatio: number;
  ctaRatio: number;
  preferredTone: StyleTone;
  preferredFormat: PreferredFormat;
  languageRegister: LanguageRegister;
  humorSarcasmScore: number;
  vocabulary: string[];
  hookPatterns: StyleHookPattern[];
  doList: string[];
  dontList: string[];
  ctaPatterns: string[];
  brandSafetyNotes: string[];
  sentenceRhythm: SentenceRhythm;
  writingPersonality?: string;
};

type StylePromptTemplate = {
  systemPrompt: string;
  userPromptTemplate: string;
};

type StylePromptTemplateRow = {
  system_prompt: string;
  user_prompt_template: string;
};

type LlmStyleHookPattern = {
  type: string;
  examples: string[];
};

type LlmStylePayload = {
  vocabulary?: string[];
  humorSarcasmScore?: number;
  doList?: string[];
  dontList?: string[];
  brandSafetyNotes?: string[];
  hookPatterns?: LlmStyleHookPattern[];
  writingPersonality?: string;
};

type ExtractStyleOptions = {
  forceLlm?: boolean;
};

const STYLE_PROMPT_TEMPLATE_NAME = "style-analysis-v1";
const STYLE_INPUT_POST_LIMIT = 50;
const STYLE_INPUT_POST_CHAR_LIMIT = 320;
const STYLE_OPENROUTER_MODEL = "openai/gpt-4o-mini";
const STYLE_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

const DEFAULT_STYLE_SYSTEM_PROMPT = [
  "Sen bir sosyal medya stil analistisin.",
  "Verilen postları semantik olarak incele ve sadece geçerli bir JSON nesnesi döndür.",
  "JSON dışı hiçbir metin, markdown veya code fence kullanma.",
  "Çıktı Türkçe olmalı ve kişiye özel gözlem içermeli."
].join(" ");

const DEFAULT_STYLE_USER_PROMPT_TEMPLATE = [
  "Aşağıdaki postları analiz et ve sadece şu JSON alanlarını döndür:",
  "{",
  '"vocabulary": string[] (en fazla 20),',
  '"humorSarcasmScore": number (0-1),',
  '"doList": string[] (en fazla 8),',
  '"dontList": string[] (en fazla 8),',
  '"brandSafetyNotes": string[] (en fazla 8),',
  '"hookPatterns": [{ "type": string, "examples": string[] }],',
  '"writingPersonality": string (2-3 cümle)',
  "}",
  "Postlar:",
  "{{posts}}"
].join("\n");

const llmStylePayloadSchema = z.object({
  vocabulary: z.array(z.string().min(1)).max(20).optional(),
  humorSarcasmScore: z.number().min(0).max(1).optional(),
  doList: z.array(z.string().min(1)).max(8).optional(),
  dontList: z.array(z.string().min(1)).max(8).optional(),
  brandSafetyNotes: z.array(z.string().min(1)).max(8).optional(),
  hookPatterns: z
    .array(
      z.object({
        type: z.string().min(1),
        examples: z.array(z.string().min(1)).max(3)
      })
    )
    .max(10)
    .optional(),
  writingPersonality: z.string().min(10).max(800).optional()
});

// Module-scope regexes with /g are safe here: used only via .match()/.replace() which
// create fresh match state per call. Do NOT use .test() or .exec() on these globals.
const emojiPattern = /\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu;
const ctaPattern = /\b(join|try|read|check|follow|share|start|learn)\b/gi;
const urlPattern = /https?:\/\/\S+/gi;
const punctuationTrimPattern = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;
const numberTestPattern = /\b\d+(?:[.,]\d+)?(?:%|x|\s*kat|k|m)?\b/i;
const numberScanPattern = /\b\d+(?:[.,]\d+)?(?:%|x|\s*kat|k|m)?\b/gi;
const humorMarkerPattern = /\b(lol|lmao|haha|hehe|meme|jk|ironi|ironic|sarkazm)\b|😂|🤣|😅|😉/gi;
const sarcasmMarkerPattern = /\b(tabii ki|aynen|sanki|ya tabii)\b/gi;
const informalMarkerPattern = /\b(kanka|abi|dostum|ya|bi|valla|aynen|lol|haha)\b/gi;
const formalMarkerPattern = /\b(lütfen|sayın|rica|teşekkür|arz ederim|bilgilendirme)\b/gi;
const riskyWordsPattern =
  /\b(garanti|kesin|mucize|pump|dump|inside[r]?|hızlı zengin|kolay para)\b/gi;

const stopWords = new Set([
  "ve",
  "ile",
  "bir",
  "bu",
  "şu",
  "için",
  "daha",
  "çok",
  "gibi",
  "olan",
  "ama",
  "fakat",
  "that",
  "this",
  "with",
  "from",
  "your",
  "you",
  "the",
  "and",
  "for",
  "biraz",
  "then",
  "just",
  "when",
  "how",
  "why"
]);

type HookDefinition = {
  key: string;
  label: string;
  test: (text: string) => boolean;
};

const hookDefinitions: HookDefinition[] = [
  {
    key: "question",
    label: "Question Hook",
    test: (text) => text.includes("?") || /^\s*(neden|nasıl|why|how|what)\b/i.test(text)
  },
  {
    key: "numbered",
    label: "Numbered Opening",
    test: (text) => /^\s*\d+[.)\s-]/.test(text)
  },
  {
    key: "data",
    label: "Data Point Hook",
    test: (text) => numberTestPattern.test(text)
  },
  {
    key: "contrast",
    label: "Contrast Hook",
    test: (text) => /\b(ama|fakat|ancak|but|however|instead)\b/i.test(text)
  },
  {
    key: "story",
    label: "Story/Context Hook",
    test: (text) => /\b(bugün|dün|geçen|when|today|yesterday|once)\b/i.test(text)
  },
  {
    key: "problem",
    label: "Problem Hook",
    test: (text) => /\b(sorun|problem|pain|struggle|blocked)\b/i.test(text)
  },
  {
    key: "tip",
    label: "Tip Hook",
    test: (text) => /^\s*(ipucu|tip|pro tip|quick tip|not:)\b/i.test(text)
  },
  {
    key: "callout",
    label: "Audience Callout",
    test: (text) => /^\s*(@?\w+[:,]|hey\s+\w+)/i.test(text)
  },
  {
    key: "checklist",
    label: "Checklist Hook",
    test: (text) => /\b(checklist|adım|step|liste)\b/i.test(text)
  },
  {
    key: "bold_claim",
    label: "Bold Claim Hook",
    test: (text) => /\b(asla|her zaman|always|never|en iyi|tek yol)\b/i.test(text)
  }
];

function normalizeEnvValue(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function styleLlmProvider() {
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

function styleLlmModel() {
  return (
    normalizeEnvValue(process.env.OPENROUTER_MODEL) ??
    normalizeEnvValue(process.env.OPENAI_MODEL) ??
    STYLE_OPENROUTER_MODEL
  );
}

function styleLlmBaseUrl() {
  return normalizeEnvValue(process.env.OPENROUTER_BASE_URL) ?? STYLE_OPENROUTER_BASE_URL;
}

function openRouterHeaders() {
  const apiKey = normalizeEnvValue(process.env.OPENROUTER_API_KEY);
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is required when LLM_PROVIDER=openrouter.");
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
  const appUrl = normalizeEnvValue(process.env.APP_URL);
  if (appUrl) {
    headers["HTTP-Referer"] = appUrl;
  }

  const appName = normalizeEnvValue(process.env.OPENROUTER_APP_NAME) ?? "growth-os";
  headers["X-Title"] = appName;
  return headers;
}

function extractOpenRouterContent(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const record = payload as Record<string, unknown>;
  const choices = record.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return undefined;
  }

  const first = choices[0];
  if (!first || typeof first !== "object") {
    return undefined;
  }
  const message = (first as Record<string, unknown>).message;
  if (!message || typeof message !== "object") {
    return undefined;
  }

  const content = (message as Record<string, unknown>).content;
  return typeof content === "string" ? content.trim() : undefined;
}

function stripJsonCodeFence(content: string) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  return trimmed;
}

function parseLlmJsonPayload(content: string) {
  const raw = stripJsonCodeFence(content);
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  const jsonText =
    firstBrace >= 0 && lastBrace > firstBrace ? raw.slice(firstBrace, lastBrace + 1) : raw;
  return JSON.parse(jsonText) as unknown;
}

function sanitizeList(values: string[] | undefined, max: number) {
  if (!values || values.length === 0) {
    return undefined;
  }

  const unique = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) {
      continue;
    }
    const key = normalized.toLocaleLowerCase("tr");
    if (unique.has(key)) {
      continue;
    }
    unique.add(key);
    result.push(normalized);
    if (result.length >= max) {
      break;
    }
  }

  return result.length > 0 ? result : undefined;
}

function hookPatternKey(type: string, index: number) {
  const normalized = type
    .toLocaleLowerCase("tr")
    .replace(/[^a-z0-9ğüşöçı]+/gi, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || `llm_hook_${index + 1}`;
}

function toStyleHookPatterns(hooks: LlmStyleHookPattern[] | undefined) {
  if (!hooks || hooks.length === 0) {
    return undefined;
  }

  const mapped = hooks
    .map((hook, index) => {
      const label = hook.type.trim();
      if (!label) {
        return undefined;
      }

      const examples = sanitizeList(hook.examples, 2) ?? [];
      return {
        key: hookPatternKey(label, index),
        label,
        count: Math.max(1, examples.length),
        examples
      } satisfies StyleHookPattern;
    })
    .filter((pattern): pattern is StyleHookPattern => Boolean(pattern));

  return mapped.length > 0 ? mapped.slice(0, 10) : undefined;
}

function mergeStyleProfile(base: StyleProfile, enrichment: Partial<StyleProfile>): StyleProfile {
  return {
    ...base,
    vocabulary: sanitizeList(enrichment.vocabulary, 20) ?? base.vocabulary,
    humorSarcasmScore: enrichment.humorSarcasmScore ?? base.humorSarcasmScore,
    doList: sanitizeList(enrichment.doList, 8) ?? base.doList,
    dontList: sanitizeList(enrichment.dontList, 8) ?? base.dontList,
    brandSafetyNotes: sanitizeList(enrichment.brandSafetyNotes, 8) ?? base.brandSafetyNotes,
    hookPatterns: enrichment.hookPatterns ?? base.hookPatterns,
    writingPersonality: enrichment.writingPersonality?.trim() || base.writingPersonality
  };
}

function stubWritingPersonality(profile: StyleProfile) {
  const hookLabel = profile.hookPatterns
    .filter((pattern) => pattern.count > 0)
    .sort((a, b) => b.count - a.count)
    .map((pattern) => pattern.label)[0];

  const toneSentence = `Genellikle ${profile.preferredTone} ve ${profile.languageRegister} bir anlatım kullanıyor.`;
  const formatSentence =
    profile.preferredFormat === "thread"
      ? "Mesajlarını bölümleyerek ilerleyen thread yapısını tercih ediyor."
      : "Tek post içinde net ve hızlı değer iletmeyi tercih ediyor.";
  const hookSentence = hookLabel
    ? `Açılışta en çok ${hookLabel} tipi kanca kullanıyor ve dikkat çekmeyi hedefliyor.`
    : "Açılış cümlesinde doğrudan problemi tarif eden bir yaklaşımı benimsiyor.";

  return `${toneSentence} ${formatSentence} ${hookSentence}`;
}

function buildStyleInputPosts(texts: string[]) {
  return texts
    .slice(0, STYLE_INPUT_POST_LIMIT)
    .map((text, index) => {
      const normalized = text.replace(/\s+/g, " ").trim().slice(0, STYLE_INPUT_POST_CHAR_LIMIT);
      return `${index + 1}. ${normalized}`;
    })
    .join("\n");
}

function interpolatePromptTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_full, key: string) => {
    return values[key] ?? "";
  });
}

function roundToTwo(value: number) {
  return Number(value.toFixed(2));
}

function tokenize(text: string) {
  return text
    .toLocaleLowerCase("tr")
    .replace(urlPattern, " ")
    .split(/\s+/)
    .map((token) => token.replace(punctuationTrimPattern, ""))
    .filter((token) => token.length >= 3 && !stopWords.has(token));
}

function splitSentences(text: string) {
  return text
    .split(/[.!?]+/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function extractVocabulary(texts: string[], maxItems = 20) {
  const frequency = new Map<string, number>();

  for (const text of texts) {
    for (const token of tokenize(text)) {
      frequency.set(token, (frequency.get(token) ?? 0) + 1);
    }
  }

  return [...frequency.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "tr"))
    .slice(0, maxItems)
    .map(([token]) => token);
}

function extractHookPatterns(texts: string[]) {
  const counters = hookDefinitions.map((definition) => ({
    key: definition.key,
    label: definition.label,
    count: 0,
    examples: [] as string[]
  }));

  for (const text of texts) {
    const normalized = text.trim().replace(/\s+/g, " ").slice(0, 180);
    if (!normalized) {
      continue;
    }

    for (let index = 0; index < hookDefinitions.length; index += 1) {
      const definition = hookDefinitions[index];
      if (!definition) {
        continue;
      }
      if (!definition.test(normalized)) {
        continue;
      }

      const entry = counters[index];
      if (!entry) {
        continue;
      }
      entry.count += 1;
      if (entry.examples.length < 2) {
        entry.examples.push(normalized);
      }
    }
  }

  return counters;
}

function extractCtaPatterns(texts: string[]) {
  const patterns = new Map<string, number>();
  for (const text of texts) {
    const sentences = splitSentences(text);
    for (const sentence of sentences) {
      const matched = sentence.match(ctaPattern);
      if (!matched) {
        continue;
      }

      const normalizedSentence = sentence.replace(/\s+/g, " ").trim();
      if (!normalizedSentence) {
        continue;
      }

      const key = normalizedSentence.slice(0, 80);
      patterns.set(key, (patterns.get(key) ?? 0) + matched.length);
    }
  }

  const sorted = [...patterns.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "tr")
  );
  const top = sorted.slice(0, 8).map(([pattern]) => pattern);
  if (top.length > 0) {
    return top;
  }

  return ["Açık bir aksiyon çağrısı ekle", "Okuyucuyu tek bir sonraki adıma yönlendir"];
}

function detectPreferredFormat(texts: string[]): PreferredFormat {
  const total = texts.length || 1;
  const threadSignals = texts.reduce((count, text) => {
    const hasThreadHint =
      text.includes("\n") || /(?:^|\s)\d+\/\d+\b/.test(text) || /\b(thread|🧵)\b/i.test(text);
    return count + (hasThreadHint ? 1 : 0);
  }, 0);
  const ratio = threadSignals / total;

  if (ratio >= 0.45) {
    return "thread";
  }

  if (ratio <= 0.2) {
    return "single";
  }

  return "mixed";
}

function detectLanguageRegister(texts: string[]): LanguageRegister {
  // Use standard toLowerCase for ASCII regex matching, then Turkish locale
  // for Turkish-specific patterns. Turkish toLocaleLowerCase("tr") converts
  // ASCII 'I' to 'ı' (dotless), breaking ASCII regex like /ironic/gi.
  const corpus = texts.join(" ").toLowerCase();
  const informal = corpus.match(informalMarkerPattern)?.length ?? 0;
  const formal = corpus.match(formalMarkerPattern)?.length ?? 0;

  if (informal > formal * 1.5 && informal > 0) {
    return "informal";
  }

  if (formal > informal * 1.5 && formal > 0) {
    return "formal";
  }

  return "neutral";
}

function computeHumorSarcasmScore(texts: string[]) {
  const corpus = texts.join(" ").toLowerCase();
  const humor = corpus.match(humorMarkerPattern)?.length ?? 0;
  const sarcasm = corpus.match(sarcasmMarkerPattern)?.length ?? 0;
  const scale = Math.max(1, texts.length * 2);
  const rawScore = (humor + sarcasm * 1.2) / scale;
  return roundToTwo(Math.max(0, Math.min(1, rawScore)));
}

function computeSentenceRhythm(texts: string[]): SentenceRhythm {
  const sentenceLengths: number[] = [];
  for (const text of texts) {
    for (const sentence of splitSentences(text)) {
      const tokenCount = sentence
        .split(/\s+/)
        .map((token) => token.replace(punctuationTrimPattern, ""))
        .filter(Boolean).length;
      if (tokenCount > 0) {
        sentenceLengths.push(tokenCount);
      }
    }
  }

  if (sentenceLengths.length === 0) {
    return {
      avgSentenceLength: 0,
      shortSentenceRatio: 0,
      mediumSentenceRatio: 0,
      longSentenceRatio: 0
    };
  }

  const total = sentenceLengths.length;
  const short = sentenceLengths.filter((length) => length <= 8).length;
  const medium = sentenceLengths.filter((length) => length >= 9 && length <= 16).length;
  const long = sentenceLengths.filter((length) => length > 16).length;
  const avg = sentenceLengths.reduce((sum, value) => sum + value, 0) / total;

  return {
    avgSentenceLength: roundToTwo(avg),
    shortSentenceRatio: roundToTwo(short / total),
    mediumSentenceRatio: roundToTwo(medium / total),
    longSentenceRatio: roundToTwo(long / total)
  };
}

function createDoList(profile: {
  preferredTone: StyleTone;
  preferredFormat: PreferredFormat;
  ctaRatio: number;
  emojiRatio: number;
  hashtagRatio: number;
  languageRegister: LanguageRegister;
  hookPatterns: StyleHookPattern[];
}) {
  const mostActiveHook = [...profile.hookPatterns].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label, "tr")
  )[0]?.label;

  const list = [
    "Açılış cümlesinde tek bir ana mesajla gir.",
    `Tonunu ${profile.preferredTone} çizgide koru; gereksiz uzatmadan ilerle.`,
    `Format tercihini ${profile.preferredFormat} odağında tut ve aynı akışta kal.`,
    "Her içerikte okuyucuya tek bir net aksiyon adımı bırak.",
    "Kısa paragraflar ve satır kırılımlarıyla okunabilirliği artır.",
    `Dil register'ını ${profile.languageRegister} seviyesinde tutarlı kullan.`,
    "İddialı sayısal ifadelerde kaynak veya bağlam belirt.",
    "Yayın sonrası ilk saat performansına göre varyasyon üret."
  ];

  if (profile.ctaRatio > 0.8) {
    list[3] = "CTA kullanırken tek ve ölçülebilir aksiyon seç.";
  }
  if (profile.emojiRatio > 0.2) {
    list[4] = "Emoji kullanımını ana fikri destekleyecek seviyede sınırlı tut.";
  }
  if (profile.hashtagRatio > 1) {
    list[0] = "Hashtag'i gövdeyi bozmadan 1-2 adetle sınırla.";
  }
  if (mostActiveHook) {
    list[7] = `En iyi çalışan kanca tipi (${mostActiveHook}) için A/B varyasyonları üret.`;
  }

  return list;
}

function createDontList(profile: {
  ctaRatio: number;
  emojiRatio: number;
  hashtagRatio: number;
  preferredFormat: PreferredFormat;
}) {
  const list = [
    "Aynı cümleyi veya CTA ifadesini arka arkaya tekrar etme.",
    "Aşırı ünlem ve büyük harfli agresif vurgu kullanma.",
    "Kaynaksız kesinlik ifade eden iddialar yazma.",
    "Bağlamdan kopuk hashtag yığma.",
    "Tık odaklı ama değer üretmeyen clickbait açılışlar kurma.",
    "Okunabilirliği düşüren tek parça uzun bloklar paylaşma.",
    "Tam otomatik toplu yayınla insan onayını tamamen atlama.",
    "Format dışı (thread yerine dağınık tek post veya tersi) içerik üretme."
  ];

  if (profile.ctaRatio > 1.2) {
    list[0] = "Her cümleye CTA gömme; tek bir güçlü CTA bırak.";
  }
  if (profile.emojiRatio > 0.4) {
    list[1] = "Emoji yağmuruna dönüştürme; okunurluğu düşürme.";
  }
  if (profile.hashtagRatio > 1.5) {
    list[3] = "Hashtag spam yapma; alaka dışı etiket kullanma.";
  }
  if (profile.preferredFormat === "thread") {
    list[7] = "Thread akışını bölüm mantığı olmadan tek post gibi yazma.";
  }

  return list;
}

function buildBrandSafetyNotes(texts: string[], ctaRatio: number) {
  const notes = new Set<string>();
  const corpus = texts.join(" ").toLowerCase();

  if (corpus.match(riskyWordsPattern)) {
    notes.add("Yüksek riskli vaat/kelime tespit edildi; onay gerektiren içerik olarak işaretle.");
  }
  if (corpus.match(numberScanPattern)) {
    notes.add("Sayısal iddialarda kaynak zorunlu kuralı uygula.");
  }
  if (corpus.includes("!!!") || /[A-ZÇĞİÖŞÜ]{5,}/.test(texts.join(" "))) {
    notes.add("Aşırı vurgu dili (ALL CAPS/çoklu ünlem) güven skoru düşürebilir.");
  }
  if (ctaRatio > 1.2) {
    notes.add("Yüksek CTA yoğunluğu spam algısını artırabilir, azaltılmış varyant üret.");
  }

  notes.add("Politika riski taşıyan içerikler için publish öncesi insan onayı zorunlu olsun.");
  notes.add("Hassas konu/iddia içeren gönderilerde kaynak veya uyarı notu ekle.");
  return [...notes];
}

export function extractStyleProfile(texts: string[]): StyleProfile {
  const total = texts.length || 1;
  const lengths = texts.map((text) => text.trim().length);
  const avgLength = lengths.reduce((sum, value) => sum + value, 0) / total;
  const hashtagCount = texts.reduce((sum, text) => sum + (text.match(/#/g)?.length ?? 0), 0);
  const emojiCount = texts.reduce((sum, text) => sum + (text.match(emojiPattern)?.length ?? 0), 0);
  const ctaCount = texts.reduce((sum, text) => sum + (text.match(ctaPattern)?.length ?? 0), 0);
  const preferredTone: StyleTone =
    avgLength < 90 ? "concise" : avgLength < 180 ? "balanced" : "long";
  const preferredFormat = detectPreferredFormat(texts);
  const languageRegister = detectLanguageRegister(texts);
  const hookPatterns = extractHookPatterns(texts);
  const hashtagRatio = roundToTwo(hashtagCount / total);
  const emojiRatio = roundToTwo(emojiCount / total);
  const ctaRatio = roundToTwo(ctaCount / total);

  return {
    avgLength: roundToTwo(avgLength),
    hashtagRatio,
    emojiRatio,
    ctaRatio,
    preferredTone,
    preferredFormat,
    languageRegister,
    humorSarcasmScore: computeHumorSarcasmScore(texts),
    vocabulary: extractVocabulary(texts),
    hookPatterns,
    doList: createDoList({
      preferredTone,
      preferredFormat,
      ctaRatio,
      emojiRatio,
      hashtagRatio,
      languageRegister,
      hookPatterns
    }),
    dontList: createDontList({
      ctaRatio,
      emojiRatio,
      hashtagRatio,
      preferredFormat
    }),
    ctaPatterns: extractCtaPatterns(texts),
    brandSafetyNotes: buildBrandSafetyNotes(texts, ctaRatio),
    sentenceRhythm: computeSentenceRhythm(texts)
  };
}

function toStylePromptTemplate(row: StylePromptTemplateRow | undefined): StylePromptTemplate {
  if (!row) {
    return {
      systemPrompt: DEFAULT_STYLE_SYSTEM_PROMPT,
      userPromptTemplate: DEFAULT_STYLE_USER_PROMPT_TEMPLATE
    };
  }

  return {
    systemPrompt: row.system_prompt,
    userPromptTemplate: row.user_prompt_template
  };
}

function persistedLlmFields(profile: StyleProfile | undefined): Partial<StyleProfile> {
  if (!profile) {
    return {};
  }

  return {
    vocabulary: profile.vocabulary,
    humorSarcasmScore: profile.humorSarcasmScore,
    doList: profile.doList,
    dontList: profile.dontList,
    brandSafetyNotes: profile.brandSafetyNotes,
    hookPatterns: profile.hookPatterns,
    writingPersonality: profile.writingPersonality
  };
}

function toLlmStyleEnrichment(payload: LlmStylePayload): Partial<StyleProfile> {
  return {
    vocabulary: sanitizeList(payload.vocabulary, 20),
    humorSarcasmScore: payload.humorSarcasmScore,
    doList: sanitizeList(payload.doList, 8),
    dontList: sanitizeList(payload.dontList, 8),
    brandSafetyNotes: sanitizeList(payload.brandSafetyNotes, 8),
    hookPatterns: toStyleHookPatterns(payload.hookPatterns),
    writingPersonality: payload.writingPersonality?.trim()
  };
}

@Injectable()
export class StyleService {
  private readonly logger = new Logger(StyleService.name);

  protected dbPool() {
    return getPool();
  }

  protected async loadExistingStyleProfile(workspaceId: string, accountId: string) {
    const result = await this.dbPool().query<{ style_profile: StyleProfile }>(
      `
        SELECT style_profile
        FROM style_profiles
        WHERE workspace_id = $1
          AND account_id = $2;
      `,
      [workspaceId, accountId]
    );

    return result.rows[0]?.style_profile;
  }

  protected shouldRunLlmEnrichment(
    existingProfile: StyleProfile | undefined,
    options: ExtractStyleOptions
  ) {
    if (options.forceLlm) {
      return true;
    }
    return !existingProfile?.writingPersonality;
  }

  protected async loadStylePromptTemplate(workspaceId: string) {
    const result = await this.dbPool().query<StylePromptTemplateRow>(
      `
        SELECT system_prompt, user_prompt_template
        FROM prompt_templates
        WHERE workspace_id = $1
          AND name = $2
        ORDER BY updated_at DESC
        LIMIT 1;
      `,
      [workspaceId, STYLE_PROMPT_TEMPLATE_NAME]
    );

    return toStylePromptTemplate(result.rows[0]);
  }

  protected buildStyleAnalysisPrompt(template: StylePromptTemplate, texts: string[]) {
    const userPrompt = interpolatePromptTemplate(template.userPromptTemplate, {
      posts: buildStyleInputPosts(texts)
    });

    return {
      systemPrompt: template.systemPrompt,
      userPrompt
    };
  }

  protected async requestStyleOpenRouterAnalysis(prompt: {
    systemPrompt: string;
    userPrompt: string;
  }) {
    const response = await fetch(`${styleLlmBaseUrl()}/chat/completions`, {
      method: "POST",
      headers: openRouterHeaders(),
      body: JSON.stringify({
        model: styleLlmModel(),
        temperature: 0.3,
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
      const detail = (await response.text()).trim();
      const suffix = detail ? `: ${detail.slice(0, 300)}` : "";
      throw new Error(`OpenRouter style analysis failed (${response.status})${suffix}`);
    }

    let payload: unknown;
    try {
      payload = (await response.json()) as unknown;
    } catch (error) {
      throw new Error("OpenRouter style analysis returned invalid JSON", { cause: error });
    }

    const content = extractOpenRouterContent(payload);
    if (!content) {
      throw new Error("OpenRouter style analysis returned empty content.");
    }

    let parsedPayload: unknown;
    try {
      parsedPayload = parseLlmJsonPayload(content);
    } catch (error) {
      throw new Error("OpenRouter style analysis did not return valid JSON object", {
        cause: error
      });
    }

    const validated = llmStylePayloadSchema.safeParse(parsedPayload);
    if (!validated.success) {
      throw new Error(`OpenRouter style analysis schema mismatch: ${validated.error.message}`);
    }

    return validated.data;
  }

  protected async analyzeStyleWithLLM(input: {
    workspaceId: string;
    texts: string[];
    baseProfile: StyleProfile;
  }): Promise<Partial<StyleProfile>> {
    if (styleLlmProvider() === "stub") {
      return {
        vocabulary: input.baseProfile.vocabulary.slice(0, 20),
        humorSarcasmScore: input.baseProfile.humorSarcasmScore,
        doList: input.baseProfile.doList.slice(0, 8),
        dontList: input.baseProfile.dontList.slice(0, 8),
        brandSafetyNotes: input.baseProfile.brandSafetyNotes.slice(0, 8),
        hookPatterns: input.baseProfile.hookPatterns.slice(0, 10),
        writingPersonality: stubWritingPersonality(input.baseProfile)
      };
    }

    const template = await this.loadStylePromptTemplate(input.workspaceId);
    const prompt = this.buildStyleAnalysisPrompt(template, input.texts);
    const llmPayload = await this.requestStyleOpenRouterAnalysis(prompt);
    return toLlmStyleEnrichment(llmPayload);
  }

  async extractAndPersist(
    workspaceId: string,
    accountId: string,
    sourceLimit = 30,
    options: ExtractStyleOptions = {}
  ) {
    const [source, existingProfile] = await Promise.all([
      this.dbPool().query<{ text_body: string }>(
        `
          SELECT text_body
          FROM x_timeline_posts
          WHERE workspace_id = $1
            AND account_id = $2
          ORDER BY posted_at DESC
          LIMIT $3;
        `,
        [workspaceId, accountId, sourceLimit]
      ),
      this.loadExistingStyleProfile(workspaceId, accountId)
    ]);

    if (!source.rows.length) {
      throw new NotFoundException("No timeline posts found. Run timeline ingest first.");
    }

    const texts = source.rows.map((row) => row.text_body);
    const baseProfile = extractStyleProfile(texts);
    let profile = mergeStyleProfile(baseProfile, persistedLlmFields(existingProfile));
    const shouldRunLlm = this.shouldRunLlmEnrichment(existingProfile, options);

    if (shouldRunLlm) {
      try {
        const llmProfile = await this.analyzeStyleWithLLM({
          workspaceId,
          texts,
          baseProfile
        });
        profile = mergeStyleProfile(baseProfile, llmProfile);
      } catch (error) {
        this.logger.warn(
          `Style LLM enrichment failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

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
