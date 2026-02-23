import assert from "node:assert/strict";
import test from "node:test";
import { extractBearerToken } from "../../src/shared/auth/session-auth.guard";

test("session-auth-guard.extractBearerToken.unit", () => {
  assert.equal(extractBearerToken(undefined), null);
  assert.equal(extractBearerToken("Basic abc"), null);
  assert.equal(extractBearerToken("Bearer"), null);
  assert.equal(extractBearerToken("Bearer "), null);
  assert.equal(extractBearerToken("Bearer abc"), "abc");
  assert.equal(extractBearerToken("bearer token-123"), "token-123");
  assert.equal(extractBearerToken("Bearer abc def"), null);
  assert.equal(extractBearerToken(["Bearer one", "Bearer two"]), "one");
});
