import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateBackoffDelayMs,
  cosineSimilarity,
  decryptSecret,
  encryptSecret,
  exceedsSimilarityThreshold,
  nextSchedulerState
} from "../src";

test("calculateBackoffDelayMs stays inside expected bounds", () => {
  const delay = calculateBackoffDelayMs({ attempt: 3, baseMs: 1000, jitterMs: 20 });
  assert.ok(delay >= 4000);
  assert.ok(delay <= 4020);
});

test("cosineSimilarity works for equal and unrelated phrases", () => {
  const equalScore = cosineSimilarity("growth os scheduler", "growth os scheduler");
  const distantScore = cosineSimilarity("publish tweet", "invoice payment");

  assert.ok(equalScore > 0.99);
  assert.ok(distantScore < 0.5);
  assert.equal(exceedsSimilarityThreshold("growth os", "growth os", 0.9), true);
});

test("nextSchedulerState validates transitions", () => {
  assert.equal(nextSchedulerState("queued", "start"), "in_progress");
  assert.throws(
    () => nextSchedulerState("completed", "retry"),
    /Invalid scheduler state transition/
  );
});

test("encryptSecret/decryptSecret roundtrip", () => {
  const key = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const payload = encryptSecret("token-value", key);
  assert.equal(decryptSecret(payload, key), "token-value");
});

test("decryptSecret rejects payloads with extra dot-separated segments", () => {
  const key = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const payload = `${encryptSecret("token-value", key)}.extra`;
  assert.throws(() => decryptSecret(payload, key), /Invalid encrypted payload format/);
});
