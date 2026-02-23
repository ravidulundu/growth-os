import assert from "node:assert/strict";
import test from "node:test";
import { MockXClient, RealXClient, getXClient, resetXClientCacheForTests } from "../src/x-client";

function withEnv(
  env: Partial<Record<"X_CLIENT_MODE" | "X_API_MAX_RETRIES", string | undefined>>,
  run: () => Promise<void> | void
) {
  const previousMode = process.env.X_CLIENT_MODE;
  const previousMaxRetries = process.env.X_API_MAX_RETRIES;

  if (env.X_CLIENT_MODE === undefined) {
    delete process.env.X_CLIENT_MODE;
  } else {
    process.env.X_CLIENT_MODE = env.X_CLIENT_MODE;
  }

  if (env.X_API_MAX_RETRIES === undefined) {
    delete process.env.X_API_MAX_RETRIES;
  } else {
    process.env.X_API_MAX_RETRIES = env.X_API_MAX_RETRIES;
  }

  resetXClientCacheForTests();
  const result = run();
  return Promise.resolve(result).finally(() => {
    if (previousMode === undefined) {
      delete process.env.X_CLIENT_MODE;
    } else {
      process.env.X_CLIENT_MODE = previousMode;
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
    headers: { "content-type": "application/json" }
  });
}

test("worker x client mock publish/metrics behaves deterministically", async () => {
  const client = new MockXClient();
  const published = await client.publishPost("access-token", "hello world");
  assert.match(published.externalPostId, /^mock_post_/);

  const metrics = await client.fetchPostMetrics("access-token", published.externalPostId);
  assert.ok(metrics.impressions > 0);
  assert.ok(metrics.likes >= 0);
  assert.ok(metrics.replies >= 0);
  assert.ok(metrics.reposts >= 0);
  assert.ok(metrics.quotes >= 0);
});

test("worker getXClient respects mode and caches per-mode instance", async () => {
  await withEnv({ X_CLIENT_MODE: "mock" }, () => {
    const first = getXClient();
    const second = getXClient();
    assert.equal(first, second);
    assert.ok(first instanceof MockXClient);
  });

  await withEnv({ X_CLIENT_MODE: "real" }, () => {
    const first = getXClient();
    const second = getXClient();
    assert.equal(first, second);
    assert.ok(first instanceof RealXClient);
  });

  await withEnv({ X_CLIENT_MODE: "unknown" }, () => {
    assert.throws(() => getXClient(), {
      message: "Unsupported worker X client mode: unknown"
    });
  });
});

test("worker real x client surfaces invalid JSON responses", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response("{invalid", {
      status: 200,
      headers: { "content-type": "application/json" }
    });

  const client = new RealXClient({ fetchImpl });
  await assert.rejects(() => client.fetchPostMetrics("token", "post-1"), {
    message: /invalid JSON response/i
  });
});

test("worker real x client retries transient 429 and succeeds", async () => {
  let attempts = 0;
  const sleepCalls: number[] = [];

  const fetchImpl: typeof fetch = async (input, init) => {
    attempts += 1;
    const url = String(input);
    const method = init?.method?.toUpperCase() ?? "GET";

    if (attempts === 1) {
      return jsonResponse({ detail: "rate limited" }, 429);
    }

    if (url.endsWith("/tweets") && method === "POST") {
      return jsonResponse({ data: { id: "pub-1" } });
    }

    return jsonResponse(
      {
        data: {
          public_metrics: {
            impression_count: 10,
            like_count: 2,
            reply_count: 1,
            retweet_count: 1,
            quote_count: 0
          }
        }
      },
      200
    );
  };

  const client = new RealXClient({
    fetchImpl,
    sleepImpl: async (ms) => {
      sleepCalls.push(ms);
    },
    apiBaseUrl: "https://api.x.test/2"
  });

  const published = await client.publishPost("token", "hello");
  assert.equal(published.externalPostId, "pub-1");
  assert.equal(attempts, 2);
  assert.equal(sleepCalls.length, 1);
});
