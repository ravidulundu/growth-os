import assert from "node:assert/strict";
import test from "node:test";
import { decryptSecret, encryptSecret } from "../../src/shared/security/token-vault";

test("encryptSecret/decryptSecret roundtrip", () => {
  const previousKey = process.env.TOKEN_ENCRYPTION_KEY;
  process.env.TOKEN_ENCRYPTION_KEY = "local-dev-32-byte-key";

  try {
    const encrypted = encryptSecret("secret-token-value");
    assert.notEqual(encrypted, "secret-token-value");
    assert.equal(decryptSecret(encrypted), "secret-token-value");
  } finally {
    if (previousKey === undefined) {
      delete process.env.TOKEN_ENCRYPTION_KEY;
    } else {
      process.env.TOKEN_ENCRYPTION_KEY = previousKey;
    }
  }
});
