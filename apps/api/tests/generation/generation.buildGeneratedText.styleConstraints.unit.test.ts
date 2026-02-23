import assert from "node:assert/strict";
import test from "node:test";
import { buildGeneratedText } from "../../src/modules/generation/generation.service";

test("generation.buildGeneratedText.styleConstraints.unit", () => {
  const text = buildGeneratedText({
    topic: "TTFV optimizasyonu",
    type: "tweet",
    style: {
      avgLength: 72,
      hashtagRatio: 0.3,
      emojiRatio: 0.1,
      ctaRatio: 0.4,
      preferredTone: "concise",
      preferredFormat: "single",
      languageRegister: "neutral",
      humorSarcasmScore: 0.1,
      vocabulary: ["ttfv", "optimizasyon"],
      hookPatterns: [],
      doList: [],
      dontList: [],
      ctaPatterns: [],
      brandSafetyNotes: [],
      sentenceRhythm: {
        avgSentenceLength: 8,
        shortSentenceRatio: 0.7,
        mediumSentenceRatio: 0.3,
        longSentenceRatio: 0
      }
    }
  });

  assert.match(text, /TTFV optimizasyonu/);
  assert.match(text, /Ton: concise/);
  assert.match(text, /ortalama uzunluk: 72/);
});
