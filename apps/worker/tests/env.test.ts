import assert from "node:assert/strict";
import test from "node:test";
import { envFloat, envInt } from "../src/env";

test("worker.envInt and envFloat fallback on invalid values", () => {
  const previousAttempts = process.env.PUBLISH_MAX_ATTEMPTS;
  const previousSimilarity = process.env.SAFE_MODE_MAX_SIMILARITY;

  process.env.PUBLISH_MAX_ATTEMPTS = "oops";
  process.env.SAFE_MODE_MAX_SIMILARITY = "abc";
  assert.equal(envInt("PUBLISH_MAX_ATTEMPTS", 8), 8);
  assert.equal(envFloat("SAFE_MODE_MAX_SIMILARITY", 0.85, 0), 0.85);

  process.env.PUBLISH_MAX_ATTEMPTS = "12";
  process.env.SAFE_MODE_MAX_SIMILARITY = "0.92";
  assert.equal(envInt("PUBLISH_MAX_ATTEMPTS", 8), 12);
  assert.equal(envFloat("SAFE_MODE_MAX_SIMILARITY", 0.85, 0, 1), 0.92);

  process.env.SAFE_MODE_MAX_SIMILARITY = "1.3";
  assert.equal(envFloat("SAFE_MODE_MAX_SIMILARITY", 0.85, 0, 1), 0.85);

  process.env.PUBLISH_MAX_ATTEMPTS = "";
  process.env.SAFE_MODE_MAX_SIMILARITY = "";
  assert.equal(envInt("PUBLISH_MAX_ATTEMPTS", 8), 8);
  assert.equal(envFloat("SAFE_MODE_MAX_SIMILARITY", 0.85, 0, 1), 0.85);

  if (previousAttempts === undefined) {
    delete process.env.PUBLISH_MAX_ATTEMPTS;
  } else {
    process.env.PUBLISH_MAX_ATTEMPTS = previousAttempts;
  }

  if (previousSimilarity === undefined) {
    delete process.env.SAFE_MODE_MAX_SIMILARITY;
  } else {
    process.env.SAFE_MODE_MAX_SIMILARITY = previousSimilarity;
  }
});
