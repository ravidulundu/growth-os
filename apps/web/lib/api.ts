export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

type ApiErrorBody = {
  message?: string | string[];
  error?: string;
  statusCode?: number;
};

type ApiRequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
};

function toErrorMessage(status: number, body: unknown) {
  const fallback = `Request failed with status ${status}`;
  if (!body || typeof body !== "object") {
    return fallback;
  }

  const err = body as ApiErrorBody;
  if (Array.isArray(err.message) && err.message.length > 0) {
    return err.message.join(". ");
  }

  if (typeof err.message === "string" && err.message.trim()) {
    return err.message;
  }

  if (typeof err.error === "string" && err.error.trim()) {
    return err.error;
  }

  return fallback;
}

async function requestJson<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options;
  const requestHeaders = new Headers(headers);
  if (body !== undefined && !requestHeaders.has("content-type")) {
    requestHeaders.set("content-type", "application/json");
  }

  const init: RequestInit = {
    ...rest,
    credentials: "include",
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body)
  };

  const response = await fetch(`${API_BASE_URL}${path}`, init);
  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    throw new Error(toErrorMessage(response.status, payload));
  }

  return payload as T;
}

export type HealthResponse = {
  status: string;
  service: string;
  timestamp: string;
};

export type MagicLinkRequestResponse = {
  ok: boolean;
  message: string;
};

export type AuthSessionResponse = {
  ok: true;
  userId: string | null;
  sessionId: string | null;
};

export type MagicLinkVerifyResponse = {
  ok: boolean;
  userId: string;
};

export type StartConnectResponse = {
  authUrl: string;
  state: string;
};

export type CompleteConnectResponse = {
  ok: boolean;
  accountId: string;
  username: string;
};

export type Account = {
  id: string;
  x_user_id: string;
  username: string;
  created_at: string;
  updated_at: string;
};

export type IngestTimelineResponse = {
  ok: boolean;
  insertedCount: number;
};

export type StyleProfile = {
  avgLength: number;
  hashtagRatio: number;
  emojiRatio: number;
  ctaRatio: number;
  preferredTone: "concise" | "balanced" | "long";
  preferredFormat: "single" | "thread" | "mixed";
  languageRegister: "formal" | "neutral" | "informal";
  humorSarcasmScore: number;
  vocabulary: string[];
  hookPatterns: Array<{
    key: string;
    label: string;
    count: number;
    examples: string[];
  }>;
  doList: string[];
  dontList: string[];
  ctaPatterns: string[];
  brandSafetyNotes: string[];
  sentenceRhythm: {
    avgSentenceLength: number;
    shortSentenceRatio: number;
    mediumSentenceRatio: number;
    longSentenceRatio: number;
  };
};

export type StyleExtractResponse = {
  ok: boolean;
  sourcePostCount: number;
  profile: StyleProfile;
};

export type StyleGetResponse = {
  style_profile: StyleProfile;
  updated_at: string;
};

export type CreateDraftResponse = {
  ok: boolean;
  contentId: string;
  text: string;
};

export type CreateVersionResponse = {
  ok: boolean;
  versionNo: number;
};

export type VersionRow = {
  version_no: number;
  text_body: string;
  created_at: string;
};

export type PublishNowResponse = {
  ok: boolean;
  publishJobId: string;
  dedupeKey: string;
  scheduledFor: string;
};

export type JobRow = {
  id: string;
  content_id: string;
  state: string;
  run_at: string;
  next_run_at: string;
  attempt_count: number;
  last_error_code: string | null;
  updated_at: string;
};

export type AnalyticsSnapshot = {
  window_key: string;
  impressions: number;
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
  captured_at: string;
};

export type AnalyticsResponse = {
  publishedPostId: string;
  externalPostId: string;
  snapshots: AnalyticsSnapshot[];
};

export type FirstHourAlertResponse = {
  publishedPostId: string;
  externalPostId: string;
  windowKey: string;
  capturedAt: string;
  impressions: number;
  engagement: number;
  engagementRate: number;
  level: "ok" | "watch" | "critical";
  reasons: string[];
  thresholds: {
    minImpressions: number;
    minEngagementRate: number;
    criticalImpressions: number;
    criticalEngagementRate: number;
  };
};

export type BillingMeteringResponse = {
  planKey: string;
  monthlyGenerationLimit: number | null;
  usedUnits: number;
  remainingUnits: number | null;
  periodStart: string;
  periodEnd: string;
};

export async function fetchHealth() {
  return requestJson<HealthResponse>("/health", { method: "GET", credentials: "omit" });
}

export async function requestMagicLink(
  email: string,
  options?: {
    callbackURL?: string;
    newUserCallbackURL?: string;
    errorCallbackURL?: string;
  }
) {
  return requestJson<MagicLinkRequestResponse>("/auth/sign-in/magic-link", {
    method: "POST",
    body: { email, ...options }
  });
}

export async function fetchAuthSession() {
  return requestJson<AuthSessionResponse>("/auth/session", {
    method: "GET"
  });
}

export async function verifyMagicLink(
  token: string,
  options?: {
    callbackURL?: string;
    newUserCallbackURL?: string;
    errorCallbackURL?: string;
  }
) {
  const params = new URLSearchParams({ token });
  if (options?.callbackURL) {
    params.set("callbackURL", options.callbackURL);
  }
  if (options?.newUserCallbackURL) {
    params.set("newUserCallbackURL", options.newUserCallbackURL);
  }
  if (options?.errorCallbackURL) {
    params.set("errorCallbackURL", options.errorCallbackURL);
  }

  return requestJson<MagicLinkVerifyResponse>(`/auth/magic-link/verify?${params.toString()}`, {
    method: "GET"
  });
}

export async function startXConnect(workspaceId: string) {
  return requestJson<StartConnectResponse>("/x/connect/start", {
    method: "POST",
    body: { workspaceId }
  });
}

export async function completeXConnect(workspaceId: string, state: string, code: string) {
  return requestJson<CompleteConnectResponse>("/x/connect/callback", {
    method: "POST",
    body: { workspaceId, state, code }
  });
}

export async function listWorkspaceAccounts(workspaceId: string) {
  return requestJson<Account[]>(`/x/accounts/${workspaceId}`, { method: "GET" });
}

export async function ingestTimeline(workspaceId: string, accountId: string, limit: number) {
  return requestJson<IngestTimelineResponse>("/x/timeline/ingest", {
    method: "POST",
    body: { workspaceId, accountId, limit }
  });
}

export async function extractStyle(workspaceId: string, accountId: string, sourceLimit: number) {
  return requestJson<StyleExtractResponse>("/style/extract", {
    method: "POST",
    body: { workspaceId, accountId, sourceLimit }
  });
}

export async function getStyle(workspaceId: string, accountId: string, refresh = false) {
  const suffix = refresh ? "?refresh=1" : "";
  return requestJson<StyleGetResponse>(`/style/${workspaceId}/${accountId}${suffix}`, {
    method: "GET"
  });
}

export async function createDraft(payload: {
  workspaceId: string;
  accountId: string;
  topic: string;
  type: "tweet" | "thread" | "reply" | "quote";
  promptInput?: string;
  templateName?: string;
}) {
  return requestJson<CreateDraftResponse>("/generation/draft", {
    method: "POST",
    body: payload
  });
}

export async function createVersion(workspaceId: string, contentId: string, textBody: string) {
  return requestJson<CreateVersionResponse>(`/generation/content/${contentId}/version`, {
    method: "POST",
    body: { workspaceId, textBody }
  });
}

export async function listVersions(workspaceId: string, contentId: string) {
  return requestJson<VersionRow[]>(`/generation/content/${workspaceId}/${contentId}/versions`, {
    method: "GET"
  });
}

export async function publishNow(payload: {
  workspaceId: string;
  accountId: string;
  contentId: string;
  dedupeKey?: string;
  confirmHumanReview?: boolean;
}) {
  return requestJson<PublishNowResponse>("/scheduling/publish-now", {
    method: "POST",
    body: payload
  });
}

export async function listJobs(workspaceId: string) {
  return requestJson<JobRow[]>(`/scheduling/jobs/${workspaceId}`, {
    method: "GET"
  });
}

export async function getAnalyticsByContent(workspaceId: string, contentId: string) {
  return requestJson<AnalyticsResponse>(`/analytics/content/${workspaceId}/${contentId}`, {
    method: "GET"
  });
}

export async function getFirstHourAlert(workspaceId: string, contentId: string) {
  return requestJson<FirstHourAlertResponse>(
    `/analytics/content/${workspaceId}/${contentId}/first-hour-alert`,
    {
      method: "GET"
    }
  );
}

export async function getBillingMetering(workspaceId: string) {
  return requestJson<BillingMeteringResponse>(`/billing/metering/${workspaceId}`, {
    method: "GET"
  });
}
