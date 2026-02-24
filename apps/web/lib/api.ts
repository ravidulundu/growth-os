// In development, web (port 3000) and API (port 4000) run on the same hostname (localhost).
// SameSite cookies work at "site" level (same registrable domain), so credentials: "include"
// sends cookies cross-port. In production, deploy web and API under the same site domain.
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

export type WaitlistResponse = {
  ok: boolean;
  alreadyJoined: boolean;
  message: string;
};

export type AuthSessionResponse = {
  ok: true;
  userId: string | null;
  sessionId: string | null;
};

export type OnboardingSteps = {
  workspaceValidated: boolean;
  xConnected: boolean;
  timelineIngested: boolean;
  styleExtracted: boolean;
  draftGenerated: boolean;
};

export type OnboardingState = {
  workspaceId: string | null;
  steps: OnboardingSteps;
  completedAt: string | null;
  updatedAt: string | null;
};

export type AuthSessionStateResponse = {
  ok: true;
  onboarding: OnboardingState;
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

export type SeriesCadence = "hourly" | "daily" | "weekly" | "biweekly" | "monthly";

export type ContentSeriesItem = {
  id: string;
  contentId: string;
  position: number;
  state: "pending" | "queued" | "published" | "archived";
  contentTopic: string | null;
  lastEnqueuedAt: string | null;
  lastPublishedAt: string | null;
};

export type ContentSeries = {
  id: string;
  name: string;
  cadence: SeriesCadence;
  isActive: boolean;
  enqueueNextOnPublish: boolean;
  createdAt: string;
  updatedAt: string;
  nextItem: {
    id: string;
    contentId: string;
    position: number;
    state: "pending" | "queued" | "published" | "archived";
    contentTopic: string | null;
  } | null;
  items: ContentSeriesItem[];
};

export type CreateSeriesResponse = {
  ok: boolean;
  seriesId: string;
  itemCount: number;
  isActive: boolean;
  enqueueNextOnPublish: boolean;
};

export type RepurposeResponse = {
  ok: boolean;
  contentId: string;
  text: string;
  repurposeRunId: string;
  sourceContentId: string;
};

export type PublishNowResponse = {
  ok: boolean;
  publishJobId: string;
  dedupeKey: string;
  scheduledFor: string;
};

export type ManualPublishFallbackResponse = {
  composeUrl: string | null;
  plainText: string;
  reason: string;
  reasonLabel: string;
  reminderSent: boolean;
  reminderSkipped: boolean;
};

export type JobRow = {
  id: string;
  content_id: string;
  content_title?: string | null;
  content_text: string;
  state: string;
  run_at: string;
  next_run_at: string;
  attempt_count: number;
  last_error_code: string | null;
  manual_action_compose_url: string | null;
  requires_manual_action: boolean;
  updated_at: string;
};

export async function schedulePublish(payload: {
  workspaceId: string;
  accountId: string;
  contentId: string;
  runAt: string;
  dedupeKey?: string;
  confirmHumanReview?: boolean;
}) {
  return requestJson<PublishNowResponse>("/scheduling/schedule", {
    method: "POST",
    body: payload
  });
}

export async function createManualPublishFallback(payload: {
  workspaceId: string;
  contentId: string;
  reasonCode: string;
  publishJobId?: string;
  reminderEmail?: string;
}) {
  return requestJson<ManualPublishFallbackResponse>("/scheduling/manual-fallback", {
    method: "POST",
    body: payload
  });
}

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

export type AnalyticsKpiRange = "24h" | "7d" | "30d";

export type AnalyticsKpiSnapshotResponse = {
  workspace_id: string;
  range: AnalyticsKpiRange;
  range_start: string;
  range_end: string;
  draft_to_publish_rate: number;
  first_hour_success_rate: number;
  policy_risk_rate: number;
  time_to_first_value: number | null;
  totals: {
    draft_count: number;
    published_count: number;
    first_hour_sample_count: number;
    first_hour_success_count: number;
    policy_job_count: number;
    policy_risk_count: number;
  };
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

export type AddCompetitorResponse = {
  ok: true;
  competitorAccountId: string;
  handle: string;
  platform: "x";
  xUserId: string;
  ingestedCount: number;
  metricsCapturedCount: number;
};

export type CompetitorOverviewResponse = {
  workspaceId: string;
  generatedAt: string;
  summary: {
    competitorCount: number;
    totalPosts: number;
    metricsCoverage: number;
  };
  competitors: Array<{
    id: string;
    platform: "x";
    handle: string;
    xUserId: string | null;
    isActive: boolean;
    snapshotCount: number;
    lastCapturedAt: string | null;
  }>;
  topHookTypes: Array<{ type: string; count: number }>;
  postingWindows: Array<{ hour: number; count: number }>;
  bestPerformingPosts: Array<{
    competitorHandle: string;
    xPostId: string;
    textBody: string;
    postedAt: string;
    capturedAt: string;
    impressions: number;
    engagement: number;
    engagementRate: number;
    hookType: string;
  }>;
};

export type BillingMeteringResponse = {
  planKey: string;
  monthlyGenerationLimit: number | null;
  usedUnits: number;
  remainingUnits: number | null;
  periodStart: string;
  periodEnd: string;
  billing: {
    provider: "stripe";
    status: string;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: string | null;
    planKey: "mvp0" | "free" | "creator" | "growth" | "team" | null;
  } | null;
  latestInvoice: {
    status: string;
    amountCents: number;
    currency: string | null;
    hostedInvoiceUrl: string | null;
    invoicePdfUrl: string | null;
    periodEnd: string | null;
    paidAt: string | null;
  } | null;
};

export type BillingPlanKey = "free" | "creator" | "growth" | "team";

export type BillingCheckoutPlanKey = Exclude<BillingPlanKey, "free">;

export type BillingCheckoutSessionResponse = {
  url: string;
};

export type BillingPortalSessionResponse = {
  url: string;
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

export async function joinWaitlist(email: string, source = "landing") {
  return requestJson<WaitlistResponse>("/auth/waitlist", {
    method: "POST",
    body: { email, source }
  });
}

export async function fetchAuthSession() {
  return requestJson<AuthSessionResponse>("/auth/session", {
    method: "GET"
  });
}

export async function fetchAuthSessionState() {
  return requestJson<AuthSessionStateResponse>("/auth/session/state", {
    method: "GET"
  });
}

export async function patchAuthSessionState(payload: {
  workspaceId?: string;
  steps?: Partial<OnboardingSteps>;
  completedAt?: string | null;
}) {
  return requestJson<AuthSessionStateResponse>("/auth/session/state", {
    method: "PATCH",
    body: payload
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
    method: "GET",
    headers: {
      accept: "application/json"
    }
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

export async function createSeries(payload: {
  workspaceId: string;
  accountId: string;
  name: string;
  cadence: SeriesCadence;
  isActive?: boolean;
  enqueueNextOnPublish?: boolean;
  contentIds: string[];
}) {
  return requestJson<CreateSeriesResponse>("/generation/series", {
    method: "POST",
    body: payload
  });
}

export async function listSeries(workspaceId: string, accountId: string) {
  return requestJson<ContentSeries[]>(`/generation/series/${workspaceId}/${accountId}`, {
    method: "GET"
  });
}

export async function repurposeContent(payload: {
  workspaceId: string;
  sourceContentId: string;
  targetType: "tweet" | "thread" | "reply" | "quote";
  accountId?: string;
  promptInput?: string;
  templateName?: string;
}) {
  return requestJson<RepurposeResponse>("/generation/repurpose", {
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

export async function getAnalyticsKpi(workspaceId: string, range: AnalyticsKpiRange = "7d") {
  return requestJson<AnalyticsKpiSnapshotResponse>(`/analytics/kpi/${workspaceId}?range=${range}`, {
    method: "GET"
  });
}

export async function addCompetitorAccount(payload: {
  workspaceId: string;
  handle: string;
  platform?: "x";
  limit?: number;
}) {
  const { workspaceId, ...body } = payload;
  return requestJson<AddCompetitorResponse>(`/analytics/competitors/${workspaceId}/add`, {
    method: "POST",
    body
  });
}

export async function getCompetitorOverview(workspaceId: string) {
  return requestJson<CompetitorOverviewResponse>(`/analytics/competitors/${workspaceId}/overview`, {
    method: "GET"
  });
}

export async function getBillingMetering(workspaceId: string) {
  return requestJson<BillingMeteringResponse>(`/billing/metering/${workspaceId}`, {
    method: "GET"
  });
}

export async function createBillingCheckoutSession(payload: {
  workspaceId: string;
  planKey: BillingCheckoutPlanKey;
}) {
  return requestJson<BillingCheckoutSessionResponse>("/billing/checkout-session", {
    method: "POST",
    body: payload
  });
}

export async function createBillingPortalSession(workspaceId: string) {
  return requestJson<BillingPortalSessionResponse>("/billing/portal-session", {
    method: "POST",
    body: { workspaceId }
  });
}
