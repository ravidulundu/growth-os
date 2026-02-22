import assert from "node:assert/strict";
import test from "node:test";
import { extractStyleProfile } from "../../src/modules/style/style.service";

test("extractStyleProfile computes core style metrics", () => {
  const profile = extractStyleProfile([
    "1) Bugün odak: Kısa ve net bir not. #build",
    "Üretimi sadeleştir 🚀 ve küçük adımlarla ilerle. Daha fazlası için read dokümanını kontrol et.",
    "Neden bu kadar uzun sürüyor? Check listeni daralt ve start küçük iterasyonlarla."
  ]);

  assert.equal(profile.preferredTone, "concise");
  assert.ok(profile.avgLength > 10);
  assert.ok(profile.hashtagRatio > 0);
  assert.ok(profile.emojiRatio > 0);
  assert.ok(profile.ctaRatio > 0);
  assert.ok(profile.vocabulary.length > 0);
  assert.equal(profile.hookPatterns.length, 10);
  assert.equal(profile.doList.length, 8);
  assert.equal(profile.dontList.length, 8);
  assert.ok(profile.ctaPatterns.length > 0);
  assert.ok(profile.humorSarcasmScore >= 0 && profile.humorSarcasmScore <= 1);
  assert.ok(profile.sentenceRhythm.avgSentenceLength > 0);
  assert.ok(profile.brandSafetyNotes.length >= 2);
});
