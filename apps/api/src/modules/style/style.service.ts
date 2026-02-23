import { Injectable, NotFoundException } from "@nestjs/common";
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
};

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
      if (!definition.test(normalized)) {
        continue;
      }

      const entry = counters[index];
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
