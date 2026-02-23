import assert from "node:assert/strict";
import test from "node:test";
import { closePool } from "../../../shared/db/pool";
import { getBetterAuth } from "../better-auth";

test("auth.getBetterAuth.init.integration", async (t) => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousAuthSecret = process.env.BETTER_AUTH_SECRET;
  const previousAppUrl = process.env.APP_URL;
  const previousCorsOrigins = process.env.CORS_ALLOWED_ORIGINS;
  const previousSmtpHost = process.env.SMTP_HOST;

  process.env.NODE_ENV = "test";
  process.env.BETTER_AUTH_SECRET = "integration-better-auth-secret";
  process.env.APP_URL = "http://localhost:3010";
  delete process.env.CORS_ALLOWED_ORIGINS;
  delete process.env.SMTP_HOST;

  t.after(async () => {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }

    if (previousAuthSecret === undefined) {
      delete process.env.BETTER_AUTH_SECRET;
    } else {
      process.env.BETTER_AUTH_SECRET = previousAuthSecret;
    }

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

    if (previousSmtpHost === undefined) {
      delete process.env.SMTP_HOST;
    } else {
      process.env.SMTP_HOST = previousSmtpHost;
    }

    await closePool();
  });

  const auth = await getBetterAuth();
  assert.ok(auth);
  assert.equal(typeof auth.api.signInMagicLink, "function");
  assert.equal(typeof auth.api.magicLinkVerify, "function");

  const response = await auth.api.signInMagicLink({
    body: {
      email: `auth-init-${Date.now()}@example.com`,
      callbackURL: "http://localhost:3010/"
    },
    headers: new Headers({
      origin: "http://localhost:3010"
    })
  });

  assert.equal(response.status, true);
});
