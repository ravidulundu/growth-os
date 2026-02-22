import assert from "node:assert/strict";
import test from "node:test";
import { buildSessionTokenLookupCandidates } from "../../src/shared/auth/session-auth.guard";

test("buildSessionTokenLookupCandidates returns deterministic unique values", () => {
  const candidates = buildSessionTokenLookupCandidates("session-token-123");
  assert.equal(candidates.length, 1);
  assert.equal(new Set(candidates).size, 1);
  assert.equal(candidates[0], "session-token-123");
});
