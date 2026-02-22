import assert from "node:assert/strict";
import test from "node:test";
import {
  applyGenerationGuardrails,
  buildGeneratedText
} from "../../src/modules/generation/generation.service";

test("generation.buildGeneratedText.replyAndQuote.unit", () => {
  const reply = buildGeneratedText({
    topic: "Bu stratejide ilk adım nedir?",
    type: "reply"
  });
  const quote = buildGeneratedText({
    topic: "Sistem kurmadan ölçeklenmez.",
    type: "quote"
  });

  assert.match(reply, /Yanıt:/);
  assert.match(reply, /Bu stratejide ilk adım nedir\?/);
  assert.match(quote, /Quote yorumu:/);
  assert.match(quote, /Sistem kurmadan ölçeklenmez/);
});

test("generation.applyGenerationGuardrails.dedupe_cta_claims.unit", () => {
  const raw = [
    "Kesin kazanırsın, check şimdi ve check hemen!",
    "Kesin kazanırsın, check şimdi ve check hemen!",
    "Mutlaka join ve follow et."
  ].join("\n");

  const guarded = applyGenerationGuardrails(raw, "thread");
  const checkMatches = guarded.match(/\bcheck\b/gi) ?? [];

  assert.ok(checkMatches.length <= 3);
  assert.equal(guarded.includes("Kesin kazanırsın"), false);
  assert.equal(guarded.includes("Mutlaka"), false);
  assert.equal(guarded.split("\n").length <= 2, true);
});
