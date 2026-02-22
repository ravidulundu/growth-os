import assert from "node:assert/strict";
import test from "node:test";
import { authCookieSameSite, authCookieSecure } from "../../src/modules/auth/auth.controller";

function withEnv(
  env: Partial<
    Record<"NODE_ENV" | "AUTH_COOKIE_SECURE" | "AUTH_COOKIE_SAME_SITE", string | undefined>
  >,
  run: () => void
) {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousAuthCookieSecure = process.env.AUTH_COOKIE_SECURE;
  const previousAuthCookieSameSite = process.env.AUTH_COOKIE_SAME_SITE;

  if (env.NODE_ENV === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = env.NODE_ENV;
  }

  if (env.AUTH_COOKIE_SECURE === undefined) {
    delete process.env.AUTH_COOKIE_SECURE;
  } else {
    process.env.AUTH_COOKIE_SECURE = env.AUTH_COOKIE_SECURE;
  }

  if (env.AUTH_COOKIE_SAME_SITE === undefined) {
    delete process.env.AUTH_COOKIE_SAME_SITE;
  } else {
    process.env.AUTH_COOKIE_SAME_SITE = env.AUTH_COOKIE_SAME_SITE;
  }

  try {
    run();
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }

    if (previousAuthCookieSecure === undefined) {
      delete process.env.AUTH_COOKIE_SECURE;
    } else {
      process.env.AUTH_COOKIE_SECURE = previousAuthCookieSecure;
    }

    if (previousAuthCookieSameSite === undefined) {
      delete process.env.AUTH_COOKIE_SAME_SITE;
    } else {
      process.env.AUTH_COOKIE_SAME_SITE = previousAuthCookieSameSite;
    }
  }
}

test("authCookieSecure respects explicit and fallback behavior", () => {
  withEnv({ NODE_ENV: "development", AUTH_COOKIE_SECURE: undefined }, () => {
    assert.equal(authCookieSecure(), false);
  });

  withEnv({ NODE_ENV: "production", AUTH_COOKIE_SECURE: undefined }, () => {
    assert.equal(authCookieSecure(), true);
  });

  withEnv({ NODE_ENV: "staging", AUTH_COOKIE_SECURE: undefined }, () => {
    assert.equal(authCookieSecure(), true);
  });

  withEnv({ NODE_ENV: "development", AUTH_COOKIE_SECURE: "" }, () => {
    assert.equal(authCookieSecure(), false);
  });

  withEnv({ NODE_ENV: "development", AUTH_COOKIE_SECURE: "false" }, () => {
    assert.equal(authCookieSecure(), false);
  });

  withEnv({ NODE_ENV: "development", AUTH_COOKIE_SECURE: "true" }, () => {
    assert.equal(authCookieSecure(), true);
  });
});

test("authCookieSameSite resolves valid values and guards none-without-secure", () => {
  withEnv(
    { NODE_ENV: "development", AUTH_COOKIE_SECURE: undefined, AUTH_COOKIE_SAME_SITE: undefined },
    () => {
      assert.equal(authCookieSameSite(), "Strict");
    }
  );

  withEnv(
    { NODE_ENV: "development", AUTH_COOKIE_SECURE: undefined, AUTH_COOKIE_SAME_SITE: "lax" },
    () => {
      assert.equal(authCookieSameSite(), "Lax");
    }
  );

  withEnv(
    { NODE_ENV: "development", AUTH_COOKIE_SECURE: undefined, AUTH_COOKIE_SAME_SITE: "none" },
    () => {
      assert.equal(authCookieSameSite(), "Lax");
    }
  );

  withEnv(
    { NODE_ENV: "production", AUTH_COOKIE_SECURE: "true", AUTH_COOKIE_SAME_SITE: "none" },
    () => {
      assert.equal(authCookieSameSite(), "None");
    }
  );
});
