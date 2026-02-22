import assert from "node:assert/strict";
import test from "node:test";
import {
  MockXClient,
  RealXClient,
  getXClient,
  resetXClientCacheForTests
} from "../../src/modules/x_integration/x-client";

function withEnv(
  env: Partial<
    Record<
      | "NODE_ENV"
      | "X_CLIENT_MODE"
      | "X_SCOPES"
      | "X_CLIENT_ID"
      | "X_CLIENT_SECRET"
      | "X_REDIRECT_URI"
      | "X_API_BASE_URL"
      | "X_OAUTH_BASE_URL"
      | "X_API_MAX_RETRIES",
      string | undefined
    >
  >,
  run: () => Promise<void> | void
) {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousMode = process.env.X_CLIENT_MODE;
  const previousScopes = process.env.X_SCOPES;
  const previousClientId = process.env.X_CLIENT_ID;
  const previousClientSecret = process.env.X_CLIENT_SECRET;
  const previousRedirectUri = process.env.X_REDIRECT_URI;
  const previousApiBaseUrl = process.env.X_API_BASE_URL;
  const previousOAuthBaseUrl = process.env.X_OAUTH_BASE_URL;
  const previousMaxRetries = process.env.X_API_MAX_RETRIES;

  if (env.NODE_ENV === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = env.NODE_ENV;
  }

  if (env.X_CLIENT_MODE === undefined) {
    delete process.env.X_CLIENT_MODE;
  } else {
    process.env.X_CLIENT_MODE = env.X_CLIENT_MODE;
  }

  if (env.X_SCOPES === undefined) {
    delete process.env.X_SCOPES;
  } else {
    process.env.X_SCOPES = env.X_SCOPES;
  }
  if (env.X_CLIENT_ID === undefined) {
    delete process.env.X_CLIENT_ID;
  } else {
    process.env.X_CLIENT_ID = env.X_CLIENT_ID;
  }
  if (env.X_CLIENT_SECRET === undefined) {
    delete process.env.X_CLIENT_SECRET;
  } else {
    process.env.X_CLIENT_SECRET = env.X_CLIENT_SECRET;
  }
  if (env.X_REDIRECT_URI === undefined) {
    delete process.env.X_REDIRECT_URI;
  } else {
    process.env.X_REDIRECT_URI = env.X_REDIRECT_URI;
  }
  if (env.X_API_BASE_URL === undefined) {
    delete process.env.X_API_BASE_URL;
  } else {
    process.env.X_API_BASE_URL = env.X_API_BASE_URL;
  }
  if (env.X_OAUTH_BASE_URL === undefined) {
    delete process.env.X_OAUTH_BASE_URL;
  } else {
    process.env.X_OAUTH_BASE_URL = env.X_OAUTH_BASE_URL;
  }
  if (env.X_API_MAX_RETRIES === undefined) {
    delete process.env.X_API_MAX_RETRIES;
  } else {
    process.env.X_API_MAX_RETRIES = env.X_API_MAX_RETRIES;
  }

  resetXClientCacheForTests();
  const result = run();

  return Promise.resolve(result).finally(() => {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }

    if (previousMode === undefined) {
      delete process.env.X_CLIENT_MODE;
    } else {
      process.env.X_CLIENT_MODE = previousMode;
    }

    if (previousScopes === undefined) {
      delete process.env.X_SCOPES;
    } else {
      process.env.X_SCOPES = previousScopes;
    }
    if (previousClientId === undefined) {
      delete process.env.X_CLIENT_ID;
    } else {
      process.env.X_CLIENT_ID = previousClientId;
    }
    if (previousClientSecret === undefined) {
      delete process.env.X_CLIENT_SECRET;
    } else {
      process.env.X_CLIENT_SECRET = previousClientSecret;
    }
    if (previousRedirectUri === undefined) {
      delete process.env.X_REDIRECT_URI;
    } else {
      process.env.X_REDIRECT_URI = previousRedirectUri;
    }
    if (previousApiBaseUrl === undefined) {
      delete process.env.X_API_BASE_URL;
    } else {
      process.env.X_API_BASE_URL = previousApiBaseUrl;
    }
    if (previousOAuthBaseUrl === undefined) {
      delete process.env.X_OAUTH_BASE_URL;
    } else {
      process.env.X_OAUTH_BASE_URL = previousOAuthBaseUrl;
    }
    if (previousMaxRetries === undefined) {
      delete process.env.X_API_MAX_RETRIES;
    } else {
      process.env.X_API_MAX_RETRIES = previousMaxRetries;
    }
    resetXClientCacheForTests();
  });
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}

test("x_integration.mockXClient.publish_metrics.unit", async () => {
  const client = new MockXClient();
  const token = await client.exchangeCodeForToken("sample-auth-code");
  const profile = await client.getProfile(token.accessToken);
  const timeline = await client.fetchTimeline(token.accessToken, 3);

  assert.match(profile.username, /^mock_/);
  assert.equal(timeline.length, 3);

  const publish = await client.publishPost(token.accessToken, "publish worker smoke content");
  assert.match(publish.externalPostId, /^mock_post_/);

  const metrics = await client.fetchPostMetrics(token.accessToken, publish.externalPostId);
  assert.ok(metrics.impressions > 0);
  assert.ok(metrics.likes >= 0);
});

test("mock x client clamps timeline limits and reads scopes", async () => {
  await withEnv({ X_SCOPES: "tweet.read users.read" }, async () => {
    const client = new MockXClient();
    const token = await client.exchangeCodeForToken("scope-code");
    assert.deepEqual(token.scopes, ["tweet.read", "users.read"]);

    const low = await client.fetchTimeline(token.accessToken, 0);
    const high = await client.fetchTimeline(token.accessToken, 999);
    assert.equal(low.length, 1);
    assert.equal(high.length, 5);
  });
});

test("mock x client classifies publish errors", async () => {
  const client = new MockXClient();
  const token = await client.exchangeCodeForToken("errors");

  await assert.rejects(() => client.publishPost(token.accessToken, "hit [429]"), {
    message: "X rate limit exceeded"
  });
  await assert.rejects(() => client.publishPost(token.accessToken, "hit [500]"), {
    message: "Temporary X API failure"
  });
  await assert.rejects(() => client.publishPost(token.accessToken, "hit [PERM]"), {
    message: "X policy reject"
  });
});

test("getXClient caches mock client by mode", async () => {
  await withEnv({ NODE_ENV: "development", X_CLIENT_MODE: "mock" }, () => {
    const first = getXClient();
    const second = getXClient();
    assert.equal(first, second);
  });
});

test("getXClient defaults to mock when mode is unset and normalizes whitespace", async () => {
  await withEnv({ NODE_ENV: undefined, X_CLIENT_MODE: undefined }, () => {
    const defaultClient = getXClient();
    assert.ok(defaultClient instanceof MockXClient);
  });

  await withEnv({ NODE_ENV: "development", X_CLIENT_MODE: "  MoCk  " }, () => {
    const normalizedClient = getXClient();
    assert.ok(normalizedClient instanceof MockXClient);
  });

  resetXClientCacheForTests();
});

test("getXClient rejects unsupported or disallowed modes", async () => {
  await withEnv({ NODE_ENV: "development", X_CLIENT_MODE: "custom" }, () => {
    assert.throws(() => getXClient(), {
      message: "Unsupported X client mode: custom"
    });
  });

  await withEnv({ NODE_ENV: "production", X_CLIENT_MODE: "mock" }, () => {
    assert.throws(() => getXClient(), {
      message: "X_CLIENT_MODE=mock is not allowed in production."
    });
  });
});

test("real x client handles token/profile/timeline/publish/metrics flow", async () => {
  const fetchCalls: Array<{ url: string; method: string }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method?.toUpperCase() ?? "GET";
    fetchCalls.push({ url, method });

    if (url.endsWith("/oauth2/token")) {
      return jsonResponse({
        access_token: "real-access",
        refresh_token: "real-refresh",
        expires_in: 7200,
        scope: "tweet.read tweet.write users.read offline.access"
      });
    }

    if (url.endsWith("/users/me?user.fields=username")) {
      return jsonResponse({
        data: {
          id: "12345",
          username: "real_user"
        }
      });
    }

    if (url.includes("/users/12345/tweets?")) {
      return jsonResponse({
        data: [
          { id: "t-1", text: "First post", created_at: new Date().toISOString() },
          { id: "t-2", text: "Second post", created_at: new Date().toISOString() }
        ]
      });
    }

    if (url.endsWith("/tweets") && method === "POST") {
      return jsonResponse({
        data: {
          id: "pub-1"
        }
      });
    }

    if (url.includes("/tweets/pub-1?tweet.fields=public_metrics")) {
      return jsonResponse({
        data: {
          public_metrics: {
            impression_count: 1234,
            like_count: 120,
            reply_count: 12,
            retweet_count: 34,
            quote_count: 5
          }
        }
      });
    }

    return jsonResponse({ detail: "not found" }, 404);
  };

  const client = new RealXClient({
    fetchImpl,
    apiBaseUrl: "https://api.x.test/2",
    oauthBaseUrl: "https://api.x.test/2/oauth2",
    clientId: "client-id",
    clientSecret: "client-secret",
    redirectUri: "https://app.example.com/callback"
  });

  const token = await client.exchangeCodeForToken("code-1", { codeVerifier: "verifier-1" });
  assert.equal(token.accessToken, "real-access");
  assert.equal(token.refreshToken, "real-refresh");

  const profile = await client.getProfile(token.accessToken);
  assert.equal(profile.xUserId, "12345");
  assert.equal(profile.username, "real_user");

  const timeline = await client.fetchTimeline(token.accessToken, 2);
  assert.equal(timeline.length, 2);
  assert.equal(timeline[0].xPostId, "t-1");

  const publish = await client.publishPost(token.accessToken, "hello world");
  assert.equal(publish.externalPostId, "pub-1");

  const metrics = await client.fetchPostMetrics(token.accessToken, publish.externalPostId);
  assert.equal(metrics.impressions, 1234);
  assert.equal(metrics.likes, 120);
  assert.equal(metrics.replies, 12);
  assert.equal(metrics.reposts, 34);
  assert.equal(metrics.quotes, 5);

  assert.ok(fetchCalls.some((call) => call.url.endsWith("/oauth2/token")));
});

test("real x client maps 429 to transient rate limit error", async () => {
  await withEnv({ X_API_MAX_RETRIES: "0" }, async () => {
    const fetchImpl: typeof fetch = async () =>
      jsonResponse(
        {
          detail: "Too many requests"
        },
        429
      );

    const client = new RealXClient({
      fetchImpl,
      apiBaseUrl: "https://api.x.test/2",
      oauthBaseUrl: "https://api.x.test/2/oauth2",
      clientId: "client-id",
      redirectUri: "https://app.example.com/callback"
    });

    await assert.rejects(
      () => client.getProfile("token"),
      (error) =>
        error instanceof Error &&
        (error as Error & { code?: string; transient?: boolean }).code === "RATE_LIMIT" &&
        (error as Error & { code?: string; transient?: boolean }).transient === true
    );
  });
});

test("real x client retries transient 429 and succeeds", async () => {
  let attempts = 0;
  const sleepCalls: number[] = [];

  const fetchImpl: typeof fetch = async () => {
    attempts += 1;
    if (attempts === 1) {
      return new Response(
        JSON.stringify({
          detail: "rate limited"
        }),
        {
          status: 429,
          headers: {
            "content-type": "application/json",
            "retry-after": "0"
          }
        }
      );
    }

    return jsonResponse({
      data: {
        id: "u-1",
        username: "retried-user"
      }
    });
  };

  const client = new RealXClient({
    fetchImpl,
    sleepImpl: async (ms) => {
      sleepCalls.push(ms);
    },
    apiBaseUrl: "https://api.x.test/2",
    oauthBaseUrl: "https://api.x.test/2/oauth2",
    clientId: "client-id",
    redirectUri: "https://app.example.com/callback"
  });

  const profile = await client.getProfile("token");
  assert.equal(profile.username, "retried-user");
  assert.equal(attempts, 2);
  assert.equal(sleepCalls.length, 1);
});

test("getXClient returns real client in real mode and validates env", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      X_CLIENT_MODE: "real",
      X_CLIENT_ID: "real-client-id",
      X_CLIENT_SECRET: "real-client-secret",
      X_REDIRECT_URI: "http://localhost:4000/x/connect/callback"
    },
    () => {
      const first = getXClient();
      const second = getXClient();
      assert.ok(first instanceof RealXClient);
      assert.equal(first, second);
    }
  );

  await withEnv(
    {
      NODE_ENV: "development",
      X_CLIENT_MODE: "real",
      X_CLIENT_ID: undefined,
      X_REDIRECT_URI: "http://localhost:4000/x/connect/callback"
    },
    () => {
      assert.throws(() => getXClient(), {
        message: "X_CLIENT_ID is required for X_CLIENT_MODE=real"
      });
    }
  );
});
