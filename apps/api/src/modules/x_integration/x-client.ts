import { createHash, randomBytes } from "node:crypto";

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
  exchangeCodeForToken(code: string): Promise<XTokenExchangeResult>;
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

export function getXClient(): XClient {
  if (cachedClient) {
    return cachedClient;
  }

  // For MVP-0, we always default to mock mode unless an explicit non-mock client is added.
  cachedClient = new MockXClient();
  return cachedClient;
}
