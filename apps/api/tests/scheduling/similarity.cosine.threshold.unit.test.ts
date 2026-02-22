import assert from "node:assert/strict";
import test from "node:test";
import {
  cosineSimilarity,
  exceedsSimilarityThreshold
} from "../../src/modules/scheduling/similarity";

test("similarity.cosine.threshold.unit", () => {
  const near = cosineSimilarity(
    "publish worker idempotency and backoff strategy",
    "idempotency strategy for publish worker with retry backoff"
  );
  const far = cosineSimilarity(
    "publish worker idempotency and backoff strategy",
    "front-end typography color palette and spacing"
  );

  assert.ok(near > far);
  assert.equal(
    exceedsSimilarityThreshold("publish worker retry policy", "publish worker retry policy", 0.8),
    true
  );
  assert.equal(
    exceedsSimilarityThreshold("publish worker retry policy", "frontend color palette", 0.8),
    false
  );
});
