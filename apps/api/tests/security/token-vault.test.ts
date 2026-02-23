import assert from "node:assert/strict";
import test from "node:test";
import { decryptSecret, encryptSecret } from "../../src/shared/security/token-vault";

test("encryptSecret/decryptSecret roundtrip", () => {
  const previousKey = process.env.TOKEN_ENCRYPTION_KEY;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.TOKEN_ENCRYPTION_KEY = "local-dev-32-byte-key";
  process.env.NODE_ENV = "test";

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

    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
});

test("token vault rejects derived fallback in staging mode", () => {
  const previousKey = process.env.TOKEN_ENCRYPTION_KEY;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousAllowDerived = process.env.TOKEN_KEY_ALLOW_DERIVED;
  process.env.TOKEN_ENCRYPTION_KEY = "short-staging-key";
  process.env.NODE_ENV = "staging";
  delete process.env.TOKEN_KEY_ALLOW_DERIVED;

  try {
    assert.throws(() => encryptSecret("secret-token-value"), {
      message: /TOKEN_ENCRYPTION_KEY must be a 32-byte key/
    });
  } finally {
    if (previousKey === undefined) {
      delete process.env.TOKEN_ENCRYPTION_KEY;
    } else {
      process.env.TOKEN_ENCRYPTION_KEY = previousKey;
    }

    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }

    if (previousAllowDerived === undefined) {
      delete process.env.TOKEN_KEY_ALLOW_DERIVED;
    } else {
      process.env.TOKEN_KEY_ALLOW_DERIVED = previousAllowDerived;
    }
  }
});
