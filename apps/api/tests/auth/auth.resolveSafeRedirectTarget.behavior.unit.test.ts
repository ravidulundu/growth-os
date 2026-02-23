import assert from "node:assert/strict";
import test from "node:test";
import { resolveSafeRedirectTarget } from "../../src/modules/auth/auth.controller";

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

test("auth.resolveSafeRedirectTarget.behavior.unit", () => {
  withEnv({ APP_URL: "http://localhost:3010", CORS_ALLOWED_ORIGINS: undefined }, () => {
    assert.equal(
      resolveSafeRedirectTarget("/dashboard?view=settings"),
      "http://localhost:3010/dashboard?view=settings"
    );
    assert.equal(
      resolveSafeRedirectTarget("http://127.0.0.1:3010/login"),
      "http://127.0.0.1:3010/login"
    );
    assert.equal(resolveSafeRedirectTarget("https://evil.example/phish"), null);
    assert.equal(resolveSafeRedirectTarget("javascript:alert(1)"), null);
  });

  withEnv(
    {
      APP_URL: undefined,
      CORS_ALLOWED_ORIGINS: "https://app.growth-os.dev,https://staging.growth-os.dev"
    },
    () => {
      assert.equal(
        resolveSafeRedirectTarget("https://app.growth-os.dev/welcome"),
        "https://app.growth-os.dev/welcome"
      );
      assert.equal(resolveSafeRedirectTarget("http://localhost:3010"), null);
    }
  );
});
