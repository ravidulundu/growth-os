import { createHash, randomBytes } from "node:crypto";
import { resolveXClientMode } from "./runtime-policy";

export type XPublishResult = {
  externalPostId: string;
  publishedAt: Date;
};

export type XPostMetrics = {
  impressions: number;
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
};

type XErrorCode =
  | "RATE_LIMIT"
  | "X_TEMPORARY_ERROR"
  | "AUTH_FAILED"
  | "POLICY_REJECTED"
  | "X_REQUEST_FAILED";

type XClientError = Error & {
  code?: XErrorCode;
  transient?: boolean;
  status?: number;
};

export interface XClient {
  publishPost(accessToken: string, text: string): Promise<XPublishResult>;
  fetchPostMetrics(accessToken: string, externalPostId: string): Promise<XPostMetrics>;
}

function tokenSuffix(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 10);
}

function randomHex(size = 8) {
  return randomBytes(size).toString("hex");
}

function normalizeBaseUrl(raw: string, fallback: string) {
  const value = raw.trim();
  if (!value) {
    return fallback;
  }
  return value.replace(/\/+$/, "");
}

function messageFromUnknownPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.detail === "string" && record.detail.trim()) {
    return record.detail.trim();
  }
  if (typeof record.title === "string" && record.title.trim()) {
    return record.title.trim();
  }
  if (typeof record.error === "string" && record.error.trim()) {
    return record.error.trim();
  }
  return undefined;
}

function createXHttpError(status: number, fallbackMessage: string, payload: unknown) {
  const message = messageFromUnknownPayload(payload) ?? fallbackMessage;
  const error = new Error(message) as XClientError;
  error.status = status;

  if (status === 429) {
    error.code = "RATE_LIMIT";
    error.transient = true;
    return error;
  }

  if (status >= 500) {
    error.code = "X_TEMPORARY_ERROR";
    error.transient = true;
    return error;
  }

  if (status === 401 || status === 403) {
    error.code = "AUTH_FAILED";
    error.transient = false;
    return error;
  }

  if (status === 400 && message.toLowerCase().includes("policy")) {
    error.code = "POLICY_REJECTED";
    error.transient = false;
    return error;
  }

  error.code = "X_REQUEST_FAILED";
  error.transient = false;
  return error;
}

type RealXClientOptions = {
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
  apiBaseUrl?: string;
};

export class RealXClient implements XClient {
  private readonly fetchImpl: typeof fetch;
  private readonly sleepImpl: (ms: number) => Promise<void>;
  private readonly apiBaseUrl: string;

  constructor(options: RealXClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleepImpl =
      options.sleepImpl ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.apiBaseUrl = normalizeBaseUrl(
      options.apiBaseUrl ?? process.env.X_API_BASE_URL ?? "",
      "https://api.x.com/2"
    );
  }

  private async parseResponseBody(response: Response) {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      try {
        return (await response.json()) as unknown;
      } catch {
        const parseError = new Error(
          `X API returned invalid JSON response (${response.status} ${response.statusText})`
        ) as XClientError;
        parseError.code = "X_REQUEST_FAILED";
        parseError.transient = false;
        throw parseError;
      }
    }

    const text = await response.text();
    return text.trim() ? { detail: text } : undefined;
  }

  private retryDelayMsFromHeaders(headers: Headers) {
    const retryAfter = headers.get("retry-after");
    if (retryAfter) {
      const retryAfterSeconds = Number(retryAfter);
      if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
        return Math.min(Math.floor(retryAfterSeconds * 1000), 30_000);
      }
    }
    return 1000;
  }

  private async requestJson<T>(url: string, init: RequestInit, fallbackErrorMessage: string) {
    const maxRetriesRaw = Number(process.env.X_API_MAX_RETRIES ?? 2);
    const maxRetries = Number.isFinite(maxRetriesRaw) && maxRetriesRaw >= 0 ? maxRetriesRaw : 2;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const response = await this.fetchImpl(url, init);
      const payload = await this.parseResponseBody(response);
      if (response.ok) {
        return payload as T;
      }

      const shouldRetry =
        (response.status === 429 || response.status >= 500) && attempt < maxRetries;
      if (shouldRetry) {
        const delayMs = this.retryDelayMsFromHeaders(response.headers);
        await this.sleepImpl(delayMs);
        continue;
      }

      throw createXHttpError(response.status, fallbackErrorMessage, payload);
    }

    throw new Error("Unexpected X client retry termination");
  }

  async publishPost(accessToken: string, text: string): Promise<XPublishResult> {
    const payload = await this.requestJson<{ data?: { id?: string } }>(
      `${this.apiBaseUrl}/tweets`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({ text })
      },
      "X publish request failed"
    );

    const externalPostId = payload.data?.id?.trim();
    if (!externalPostId) {
      throw new Error("X publish response is missing post id.");
    }

    return {
      externalPostId,
      publishedAt: new Date()
    };
  }

  async fetchPostMetrics(accessToken: string, externalPostId: string): Promise<XPostMetrics> {
    const payload = await this.requestJson<{
      data?: {
        public_metrics?: {
          impression_count?: number;
          like_count?: number;
          reply_count?: number;
          retweet_count?: number;
          quote_count?: number;
        };
      };
    }>(
      `${this.apiBaseUrl}/tweets/${encodeURIComponent(externalPostId)}?tweet.fields=public_metrics`,
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      },
      "X metrics request failed"
    );

    const metrics = payload.data?.public_metrics;
    return {
      impressions: Number(metrics?.impression_count ?? 0),
      likes: Number(metrics?.like_count ?? 0),
      replies: Number(metrics?.reply_count ?? 0),
      reposts: Number(metrics?.retweet_count ?? 0),
      quotes: Number(metrics?.quote_count ?? 0)
    };
  }
}

export class MockXClient implements XClient {
  async publishPost(accessToken: string, text: string): Promise<XPublishResult> {
    if (text.includes("[429]")) {
      const error = new Error("X rate limit exceeded") as XClientError;
      error.code = "RATE_LIMIT";
      error.transient = true;
      throw error;
    }

    if (text.includes("[500]")) {
      const error = new Error("Temporary X API failure") as XClientError;
      error.code = "X_TEMPORARY_ERROR";
      error.transient = true;
      throw error;
    }

    if (text.includes("[PERM]")) {
      const error = new Error("X policy reject") as XClientError;
      error.code = "POLICY_REJECTED";
      error.transient = false;
      throw error;
    }

    return {
      externalPostId: `mock_post_${tokenSuffix(`${accessToken}:${Date.now()}:${randomHex(4)}`)}`,
      publishedAt: new Date()
    };
  }

  async fetchPostMetrics(accessToken: string, externalPostId: string): Promise<XPostMetrics> {
    const seed = Number.parseInt(tokenSuffix(`${accessToken}:${externalPostId}`).slice(0, 6), 16);
    const base = (seed % 400) + 100;
    return {
      impressions: base * 12,
      likes: Math.floor(base * 0.2),
      replies: Math.floor(base * 0.04),
      reposts: Math.floor(base * 0.06),
      quotes: Math.floor(base * 0.02)
    };
  }
}

let cachedClient: XClient | undefined;
let cachedMode: string | undefined;

function currentMode() {
  return resolveXClientMode(process.env.X_CLIENT_MODE);
}

export function getXClient() {
  const mode = currentMode();
  if (cachedClient && cachedMode === mode) {
    return cachedClient;
  }

  if (mode === "real") {
    cachedMode = mode;
    cachedClient = new RealXClient();
    return cachedClient;
  }

  if (mode !== "mock") {
    throw new Error(`Unsupported worker X client mode: ${mode}`);
  }

  cachedMode = mode;
  cachedClient = new MockXClient();
  return cachedClient;
}

/* c8 ignore next */
export function resetXClientCacheForTests() {
  cachedClient = undefined;
  cachedMode = undefined;
}
