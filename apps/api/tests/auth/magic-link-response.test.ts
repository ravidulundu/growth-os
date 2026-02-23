import assert from "node:assert/strict";
import test from "node:test";
import { buildMagicLinkRequestResponse } from "../../src/modules/auth/auth-response";

test("magic-link request response does not expose raw token or URL", () => {
  const response = buildMagicLinkRequestResponse();

  assert.equal(response.ok, true);
  assert.equal("magicLink" in response, false);
  assert.equal("token" in response, false);
});
