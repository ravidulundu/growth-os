import assert from "node:assert/strict";
import test from "node:test";
import { calculateBackoffDelayMs } from "../../src/modules/scheduling/backoff";

test("calculateBackoffDelayMs grows exponentially and respects cap", () => {
  const first = calculateBackoffDelayMs({ attempt: 1, baseMs: 1000, capMs: 5000, jitterMs: 0 });
  const second = calculateBackoffDelayMs({ attempt: 2, baseMs: 1000, capMs: 5000, jitterMs: 0 });
  const fourth = calculateBackoffDelayMs({ attempt: 4, baseMs: 1000, capMs: 5000, jitterMs: 0 });

  assert.equal(first, 1000);
  assert.equal(second, 2000);
  assert.equal(fourth, 5000);
});
