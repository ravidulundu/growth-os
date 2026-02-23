import assert from "node:assert/strict";
import test from "node:test";
import { resolveRedirectOrigins } from "../../src/modules/auth/auth.controller";
import { resolveTrustedOrigins } from "../../src/modules/auth/better-auth";

function withEnv(
  env: Partial<Record<"APP_URL" | "CORS_ALLOWED_ORIGINS", string | undefined>>,
  run: () => void
) {
  const previousAppUrl = process.env.APP_URL;
  const previousCorsOrigins = process.env.CORS_ALLOWED_ORIGINS;

  if (env.APP_URL === undefined) {
    delete process.env.APP_URL;
  } else {
    process.env.APP_URL = env.APP_URL;
  }

  if (env.CORS_ALLOWED_ORIGINS === undefined) {
    delete process.env.CORS_ALLOWED_ORIGINS;
  } else {
    process.env.CORS_ALLOWED_ORIGINS = env.CORS_ALLOWED_ORIGINS;
  }

  try {
    run();
  } finally {
    if (previousAppUrl === undefined) {
      delete process.env.APP_URL;
    } else {
      process.env.APP_URL = previousAppUrl;
    }

    if (previousCorsOrigins === undefined) {
      delete process.env.CORS_ALLOWED_ORIGINS;
    } else {
      process.env.CORS_ALLOWED_ORIGINS = previousCorsOrigins;
    }
  }
}

test("auth origin allowlists include localhost origins only for localhost app URLs", () => {
  withEnv({ APP_URL: "https://app.growth-os.dev", CORS_ALLOWED_ORIGINS: undefined }, () => {
    assert.deepEqual(resolveRedirectOrigins(), ["https://app.growth-os.dev"]);
    assert.deepEqual(resolveTrustedOrigins(), ["https://app.growth-os.dev"]);
  });

  withEnv({ APP_URL: "http://localhost:3010", CORS_ALLOWED_ORIGINS: undefined }, () => {
    assert.deepEqual(resolveRedirectOrigins(), [
      "http://localhost:3010",
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://127.0.0.1:3010"
    ]);
    assert.deepEqual(resolveTrustedOrigins(), [
      "http://localhost:3010",
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://127.0.0.1:3010"
    ]);
  });

  withEnv(
    {
      APP_URL: undefined,
      CORS_ALLOWED_ORIGINS: "https://app.growth-os.dev,https://staging.growth-os.dev"
    },
    () => {
      assert.deepEqual(resolveRedirectOrigins(), [
        "https://app.growth-os.dev",
        "https://staging.growth-os.dev"
      ]);
      assert.deepEqual(resolveTrustedOrigins(), [
        "https://app.growth-os.dev",
        "https://staging.growth-os.dev"
      ]);
    }
  );
});
