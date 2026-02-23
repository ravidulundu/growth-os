import assert from "node:assert/strict";
import test from "node:test";
import { buildMagicLinkRequestResponse } from "../../src/modules/auth/auth-response";

test("auth.requestMagicLink.responseShape.contract", () => {
  const response = buildMagicLinkRequestResponse();
  assert.deepEqual(Object.keys(response).sort(), ["message", "ok"]);
  assert.equal(response.ok, true);
  assert.equal(typeof response.message, "string");
});
