import assert from "node:assert/strict";
import test from "node:test";
import { extractStyleProfile } from "../../src/modules/style/style.service";

test("extractStyleProfile computes core style metrics", () => {
  const profile = extractStyleProfile([
    "Kısa ve net bir not. #build",
    "Üretimi sadeleştir 🚀 ve küçük adımlarla ilerle.",
    "Daha fazlası için read dokümanını kontrol et."
  ]);

  assert.equal(profile.preferredTone, "concise");
  assert.ok(profile.avgLength > 10);
  assert.ok(profile.hashtagRatio > 0);
  assert.ok(profile.emojiRatio > 0);
  assert.ok(profile.ctaRatio > 0);
});
