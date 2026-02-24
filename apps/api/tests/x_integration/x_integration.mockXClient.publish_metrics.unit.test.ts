import assert from "node:assert/strict";
import test from "node:test";
import {
  MockXClient,
  RealXClient,
  getXClient,
  resetXClientCacheForTests
} from "../../src/modules/x_integration/x-client";

type XClientEnvKey =
  | "NODE_ENV"
  | "X_CLIENT_MODE"
  | "X_SCOPES"
  | "X_CLIENT_ID"
  | "X_CLIENT_SECRET"
  | "X_REDIRECT_URI"
  | "X_API_BASE_URL"
  | "X_OAUTH_BASE_URL"
  | "X_API_MAX_RETRIES";

type XClientEnv = Partial<Record<XClientEnvKey, string | undefined>>;
type XClientEnvSnapshot = Record<XClientEnvKey, string | undefined>;

const X_CLIENT_ENV_KEYS: readonly XClientEnvKey[] = [
  "NODE_ENV",
  "X_CLIENT_MODE",
  "X_SCOPES",
  "X_CLIENT_ID",
  "X_CLIENT_SECRET",
  "X_REDIRECT_URI",
  "X_API_BASE_URL",
  "X_OAUTH_BASE_URL",
  "X_API_MAX_RETRIES"
];

function setEnvValue(key: XClientEnvKey, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}

function snapshotEnv(keys: readonly XClientEnvKey[]) {
  const snapshot = {} as XClientEnvSnapshot;
  for (const key of keys) {
    snapshot[key] = process.env[key];
  }
  return snapshot;
}

function applyEnv(env: XClientEnv, keys: readonly XClientEnvKey[]) {
  for (const key of keys) {
    setEnvValue(key, env[key]);
  }
}

function restoreEnv(snapshot: XClientEnvSnapshot, keys: readonly XClientEnvKey[]) {
  for (const key of keys) {
    setEnvValue(key, snapshot[key]);
  }
}

function withEnv(env: XClientEnv, run: () => Promise<void> | void) {
  const previousEnv = snapshotEnv(X_CLIENT_ENV_KEYS);

  applyEnv(env, X_CLIENT_ENV_KEYS);
  resetXClientCacheForTests();

  const result = run();

  return Promise.resolve(result).finally(() => {
    restoreEnv(previousEnv, X_CLIENT_ENV_KEYS);
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

type FetchCall = {
  url: string;
  method: string;
};

function createRealFlowFetchImpl(fetchCalls: FetchCall[]): typeof fetch {
  return async (input, init) => {
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
}

async function assertRealClientFlow(client: RealXClient, fetchCalls: FetchCall[]) {
  const token = await client.exchangeCodeForToken("code-1", { codeVerifier: "verifier-1" });
  assert.equal(token.accessToken, "real-access");
  assert.equal(token.refreshToken, "real-refresh");
  const refreshedToken = await client.refreshToken(token.refreshToken);
  assert.equal(refreshedToken.accessToken, "real-access");
  assert.equal(refreshedToken.refreshToken, "real-refresh");

  const profile = await client.getProfile(token.accessToken);
  assert.equal(profile.xUserId, "12345");
  assert.equal(profile.username, "real_user");

  const timeline = await client.fetchTimeline(token.accessToken, 2);
  assert.equal(timeline.length, 2);
  const firstTimelinePost = timeline[0];
  assert.ok(firstTimelinePost, "first timeline post should exist");
  assert.equal(firstTimelinePost.xPostId, "t-1");

  const publish = await client.publishPost(token.accessToken, "hello world");
  assert.equal(publish.externalPostId, "pub-1");

  const metrics = await client.fetchPostMetrics(token.accessToken, publish.externalPostId);
  assert.equal(metrics.impressions, 1234);
  assert.equal(metrics.likes, 120);
  assert.equal(metrics.replies, 12);
  assert.equal(metrics.reposts, 34);
  assert.equal(metrics.quotes, 5);

  assert.ok(fetchCalls.some((call) => call.url.endsWith("/oauth2/token")));
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
    const refreshedToken = await client.refreshToken(token.refreshToken);
    assert.deepEqual(refreshedToken.scopes, ["tweet.read", "users.read"]);
    assert.notEqual(refreshedToken.accessToken, token.accessToken);

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
  const fetchCalls: FetchCall[] = [];
  const fetchImpl = createRealFlowFetchImpl(fetchCalls);

  const client = new RealXClient({
    fetchImpl,
    apiBaseUrl: "https://api.x.test/2",
    oauthBaseUrl: "https://api.x.test/2/oauth2",
    clientId: "client-id",
    clientSecret: "client-secret",
    redirectUri: "https://app.example.com/callback"
  });
  await assertRealClientFlow(client, fetchCalls);
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

test("real x client fails fast on invalid JSON payloads", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response("{invalid", {
      status: 200,
      headers: {
        "content-type": "application/json"
      }
    });

  const client = new RealXClient({
    fetchImpl,
    apiBaseUrl: "https://api.x.test/2",
    oauthBaseUrl: "https://api.x.test/2/oauth2",
    clientId: "client-id",
    redirectUri: "https://app.example.com/callback"
  });

  await assert.rejects(() => client.getProfile("token"), {
    message: /invalid JSON response/i
  });
});

test("real x client refresh token keeps previous refresh token when omitted in response", async () => {
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    if (!url.endsWith("/oauth2/token")) {
      return jsonResponse({ detail: "not found" }, 404);
    }

    return jsonResponse({
      access_token: "refreshed-access",
      expires_in: 3600,
      scope: "tweet.read tweet.write users.read offline.access"
    });
  };
  const client = new RealXClient({
    fetchImpl,
    oauthBaseUrl: "https://api.x.test/2/oauth2",
    apiBaseUrl: "https://api.x.test/2",
    clientId: "client-id",
    redirectUri: "https://app.example.com/callback"
  });

  const refreshed = await client.refreshToken("existing-refresh");
  assert.equal(refreshed.accessToken, "refreshed-access");
  assert.equal(refreshed.refreshToken, "existing-refresh");
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
