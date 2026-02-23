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

  const turkishNear = cosineSimilarity(
    "küçük adımlarla ilerle, sade bir yayın planı oluştur",
    "sade bir yayın planı oluşturup küçük adımlarla ilerle"
  );
  const turkishFar = cosineSimilarity(
    "küçük adımlarla ilerle, sade bir yayın planı oluştur",
    "fırında sebzeli lazanya tarifi ve akşam menüsü"
  );

  assert.ok(turkishNear > turkishFar);
  assert.ok(turkishFar < 0.85);

  const shortTokenSimilarity = cosineSimilarity("go", "hi");
  assert.equal(shortTokenSimilarity, 0);
  assert.equal(exceedsSimilarityThreshold("go", "hi", 0.8), false);
});
