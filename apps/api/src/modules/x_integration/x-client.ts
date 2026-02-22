/* c8 ignore start */
import { createHash, randomBytes } from "node:crypto";
/* c8 ignore stop */

export type XTokenExchangeResult = {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  scopes: string[];
};

export type XProfile = {
  xUserId: string;
  username: string;
};

export type XTimelinePost = {
  xPostId: string;
  textBody: string;
  postedAt: Date;
};

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

export interface XClient {
  exchangeCodeForToken(
    code: string,
    options?: { codeVerifier?: string }
  ): Promise<XTokenExchangeResult>;
  getProfile(accessToken: string): Promise<XProfile>;
  fetchTimeline(accessToken: string, limit: number): Promise<XTimelinePost[]>;
  publishPost(accessToken: string, text: string): Promise<XPublishResult>;
  fetchPostMetrics(accessToken: string, externalPostId: string): Promise<XPostMetrics>;
}

function tokenSuffix(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 8);
}

function randomHex(size = 16) {
  return randomBytes(size).toString("hex");
}

function samplePosts(username: string) {
  return [
    `Bugün odak: derin çalışma ve kısa, net çıktı.`,
    `Üretimi hızlandıran şey daha çok araç değil, daha net kapsam.`,
    `Planı sadeleştir, metrikleri daralt, akışı kilitle.`,
    `${username} için haftalık içerik: ürün notları + öğrenim özeti.`,
    `Düşük riskli iterasyonlar uzun vadede daha büyük hız sağlar.`
  ];
}

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

function normalizeBaseUrl(raw: string, fallback: string) {
  const value = raw.trim();
  if (!value) {
    return fallback;
  }
  return value.replace(/\/+$/, "");
}

function parseScopeList(rawScopes: string | undefined) {
  return (rawScopes ?? "tweet.read tweet.write users.read offline.access")
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
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

  const errors = record.errors;
  if (Array.isArray(errors) && errors.length > 0 && typeof errors[0] === "object" && errors[0]) {
    const first = errors[0] as Record<string, unknown>;
    if (typeof first.message === "string" && first.message.trim()) {
      return first.message.trim();
    }
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
  oauthBaseUrl?: string;
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  scopes?: string[];
};

export class RealXClient implements XClient {
  private readonly fetchImpl: typeof fetch;
  private readonly sleepImpl: (ms: number) => Promise<void>;
  private readonly apiBaseUrl: string;
  private readonly oauthBaseUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string | undefined;
  private readonly redirectUri: string;
  private readonly configuredScopes: string[];

  constructor(options: RealXClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleepImpl =
      options.sleepImpl ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.apiBaseUrl = normalizeBaseUrl(
      options.apiBaseUrl ?? process.env.X_API_BASE_URL ?? "",
      "https://api.x.com/2"
    );
    this.oauthBaseUrl = normalizeBaseUrl(
      options.oauthBaseUrl ?? process.env.X_OAUTH_BASE_URL ?? "",
      "https://api.x.com/2/oauth2"
    );
    this.clientId = (options.clientId ?? process.env.X_CLIENT_ID ?? "").trim();
    this.clientSecret =
      (options.clientSecret ?? process.env.X_CLIENT_SECRET ?? "").trim() || undefined;
    this.redirectUri = (options.redirectUri ?? process.env.X_REDIRECT_URI ?? "").trim();
    this.configuredScopes = options.scopes ?? parseScopeList(process.env.X_SCOPES);

    if (!this.clientId) {
      throw new Error("X_CLIENT_ID is required for X_CLIENT_MODE=real");
    }

    if (!this.redirectUri) {
      throw new Error("X_REDIRECT_URI is required for X_CLIENT_MODE=real");
    }
  }

  private async parseResponseBody(response: Response) {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      try {
        return (await response.json()) as unknown;
      } catch {
        return undefined;
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

      const retryAfterDate = new Date(retryAfter);
      if (!Number.isNaN(retryAfterDate.getTime())) {
        const diff = retryAfterDate.getTime() - Date.now();
        if (diff > 0) {
          return Math.min(diff, 30_000);
        }
      }
    }

    const xReset = headers.get("x-rate-limit-reset");
    if (xReset) {
      const resetEpochSeconds = Number(xReset);
      if (Number.isFinite(resetEpochSeconds) && resetEpochSeconds > 0) {
        const diff = Math.floor(resetEpochSeconds * 1000 - Date.now());
        if (diff > 0) {
          return Math.min(diff, 30_000);
        }
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

  async exchangeCodeForToken(
    code: string,
    options?: { codeVerifier?: string }
  ): Promise<XTokenExchangeResult> {
    const codeVerifier = options?.codeVerifier?.trim();
    if (!codeVerifier) {
      throw new Error("OAuth code verifier is required for real X client.");
    }

    const form = new URLSearchParams();
    form.set("grant_type", "authorization_code");
    form.set("code", code);
    form.set("redirect_uri", this.redirectUri);
    form.set("code_verifier", codeVerifier);
    form.set("client_id", this.clientId);

    const headers = new Headers({
      "content-type": "application/x-www-form-urlencoded"
    });

    if (this.clientSecret) {
      const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`, "utf8").toString("base64");
      headers.set("authorization", `Basic ${basic}`);
    }

    const payload = await this.requestJson<{
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    }>(
      `${this.oauthBaseUrl}/token`,
      {
        method: "POST",
        headers,
        body: form.toString()
      },
      "X token exchange failed"
    );

    if (!payload.access_token || !payload.refresh_token || !payload.expires_in) {
      throw new Error("X token response is missing required fields.");
    }

    return {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      expiresInSeconds: payload.expires_in,
      scopes: payload.scope
        ? payload.scope
            .split(/\s+/)
            .map((item) => item.trim())
            .filter(Boolean)
        : this.configuredScopes
    };
  }

  async getProfile(accessToken: string): Promise<XProfile> {
    const payload = await this.requestJson<{
      data?: { id?: string; username?: string };
    }>(
      `${this.apiBaseUrl}/users/me?user.fields=username`,
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      },
      "X profile request failed"
    );

    const xUserId = payload.data?.id?.trim();
    const username = payload.data?.username?.trim();
    if (!xUserId || !username) {
      throw new Error("X profile response is missing required fields.");
    }

    return {
      xUserId,
      username
    };
  }

  async fetchTimeline(accessToken: string, limit: number): Promise<XTimelinePost[]> {
    const profile = await this.getProfile(accessToken);
    const boundedLimit = Math.max(5, Math.min(limit, 100));
    const payload = await this.requestJson<{
      data?: Array<{ id?: string; text?: string; created_at?: string }>;
    }>(
      `${this.apiBaseUrl}/users/${profile.xUserId}/tweets?max_results=${boundedLimit}&tweet.fields=created_at`,
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      },
      "X timeline request failed"
    );

    const rows = payload.data ?? [];
    return rows
      .map((row) => {
        const xPostId = row.id?.trim();
        const textBody = row.text?.trim();
        if (!xPostId || !textBody) {
          return null;
        }

        const parsedDate = row.created_at ? new Date(row.created_at) : new Date();
        const postedAt = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
        return {
          xPostId,
          textBody,
          postedAt
        };
      })
      .filter((row): row is XTimelinePost => Boolean(row));
  }

  async publishPost(accessToken: string, text: string): Promise<XPublishResult> {
    const payload = await this.requestJson<{
      data?: { id?: string };
    }>(
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
  async exchangeCodeForToken(code: string): Promise<XTokenExchangeResult> {
    const suffix = tokenSuffix(code);
    return {
      accessToken: `x_access_${suffix}_${randomHex(12)}`,
      refreshToken: `x_refresh_${suffix}_${randomHex(12)}`,
      expiresInSeconds: 7200,
      scopes: (process.env.X_SCOPES ?? "tweet.read tweet.write users.read offline.access")
        .split(/\s+/)
        .filter(Boolean)
    };
  }

  async getProfile(accessToken: string): Promise<XProfile> {
    const suffix = tokenSuffix(accessToken);
    return {
      xUserId: `mock_user_${suffix}`,
      username: `mock_${suffix}`
    };
  }

  async fetchTimeline(accessToken: string, limit: number): Promise<XTimelinePost[]> {
    const { username } = await this.getProfile(accessToken);
    const posts = samplePosts(username);
    const boundedLimit = Math.max(1, Math.min(limit, 20));

    return posts.slice(0, boundedLimit).map((textBody, index) => ({
      xPostId: `mock_tl_${tokenSuffix(accessToken)}_${index + 1}`,
      textBody,
      postedAt: new Date(Date.now() - index * 60_000)
    }));
  }

  async publishPost(accessToken: string, text: string): Promise<XPublishResult> {
    if (text.includes("[429]")) {
      const error = new Error("X rate limit exceeded");
      (error as Error & { code?: string; transient?: boolean }).code = "RATE_LIMIT";
      (error as Error & { code?: string; transient?: boolean }).transient = true;
      throw error;
    }

    if (text.includes("[500]")) {
      const error = new Error("Temporary X API failure");
      (error as Error & { code?: string; transient?: boolean }).code = "X_TEMPORARY_ERROR";
      (error as Error & { code?: string; transient?: boolean }).transient = true;
      throw error;
    }

    if (text.includes("[PERM]")) {
      const error = new Error("X policy reject");
      (error as Error & { code?: string; transient?: boolean }).code = "POLICY_REJECTED";
      (error as Error & { code?: string; transient?: boolean }).transient = false;
      throw error;
    }

    return {
      externalPostId: `mock_post_${tokenSuffix(accessToken)}_${randomHex(8)}`,
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
  return process.env.X_CLIENT_MODE?.trim().toLowerCase() ?? "mock";
}

export function getXClient(): XClient {
  // Process-local cache: runtime env changes (mode/secrets) require restart for deterministic behavior.
  const mode = currentMode();
  const nodeEnv = process.env.NODE_ENV?.trim().toLowerCase();

  if (nodeEnv === "production" && mode === "mock") {
    throw new Error("X_CLIENT_MODE=mock is not allowed in production.");
  }

  if (cachedClient && cachedMode === mode) {
    return cachedClient;
  }

  if (mode === "real") {
    cachedMode = mode;
    cachedClient = new RealXClient();
    return cachedClient;
  }

  if (mode !== "mock") {
    throw new Error(`Unsupported X client mode: ${mode}`);
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
