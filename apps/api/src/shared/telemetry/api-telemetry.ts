import * as Sentry from "@sentry/node";
import { createLogger } from "@growth-os/shared";
import { PostHog } from "posthog-node";
import { getRequestId } from "../context/request-context";

export type TelemetryEventName =
  | "x_connect_started"
  | "x_connect_completed"
  | "style_extracted"
  | "draft_generated"
  | "scheduled"
  | "published"
  | "first_hour_alert_triggered";

type TelemetryProperties = Record<string, unknown>;

type TelemetryEventOptions = {
  workspaceId?: string;
  distinctId?: string;
  sampleRate?: number;
  critical?: boolean;
};

type TelemetryExceptionContext = {
  workspaceId?: string;
  tags?: Record<string, string | number | boolean>;
  extras?: TelemetryProperties;
};

type DailyBudgetState = {
  dayKey: string;
  count: number;
};

const logger = createLogger("ApiTelemetry");
const piiKeyPattern = /(email|token|secret|password|cookie|authorization|auth|session|key)/i;
const maxSanitizeDepth = 3;
const defaultPosthogHost = "https://app.posthog.com";
const defaultPosthogFlushAt = 20;
const defaultPosthogFlushIntervalMs = 10_000;
const defaultEventSampleRate = 0.2;
const defaultCriticalSampleRate = 1;
const defaultDailyCap = 2000;
const defaultSentryErrorSampleRate = 0.3;
const defaultSentryTraceSampleRate = 0.05;
const dailyBudgetState: DailyBudgetState = { dayKey: "", count: 0 };

let posthogClient: PostHog | null | undefined;
let sentryInitialized = false;

function normalizeEnv(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseUnitFloat(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, parsed));
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}

function parseNonNegativeInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function currentDayKeyUtc() {
  return new Date().toISOString().slice(0, 10);
}

function resetBudgetIfNeeded() {
  const dayKey = currentDayKeyUtc();
  if (dailyBudgetState.dayKey === dayKey) {
    return;
  }

  dailyBudgetState.dayKey = dayKey;
  dailyBudgetState.count = 0;
}

function consumeDailyBudget(maxEvents: number) {
  resetBudgetIfNeeded();
  if (dailyBudgetState.count >= maxEvents) {
    return false;
  }

  dailyBudgetState.count += 1;
  return true;
}

function shouldSample(sampleRate: number) {
  if (sampleRate >= 1) {
    return true;
  }
  return Math.random() < sampleRate;
}

function shouldRedactKey(key: string) {
  return piiKeyPattern.test(key);
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth >= maxSanitizeDepth) {
    return "[TRUNCATED]";
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry, depth + 1));
  }

  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      result[key] = shouldRedactKey(key) ? "[REDACTED]" : sanitizeValue(entry, depth + 1);
    }
    return result;
  }

  return value;
}

function sanitizeProperties(properties: TelemetryProperties | undefined) {
  if (!properties) {
    return {};
  }

  return sanitizeValue(properties) as TelemetryProperties;
}

function toError(value: unknown) {
  if (value instanceof Error) {
    return value;
  }
  return new Error(String(value));
}

function resolvePosthogClient() {
  if (posthogClient !== undefined) {
    return posthogClient;
  }

  const apiKey = normalizeEnv(process.env.POSTHOG_KEY);
  if (!apiKey) {
    posthogClient = null;
    return posthogClient;
  }

  const host = normalizeEnv(process.env.POSTHOG_HOST) ?? defaultPosthogHost;
  const flushAt = parsePositiveInt(process.env.POSTHOG_FLUSH_AT, defaultPosthogFlushAt);
  const flushInterval = parseNonNegativeInt(
    process.env.POSTHOG_FLUSH_INTERVAL_MS,
    defaultPosthogFlushIntervalMs
  );
  posthogClient = new PostHog(apiKey, {
    host,
    flushAt,
    flushInterval,
    requestTimeout: 3000
  });
  return posthogClient;
}

function resolveEventSampleRate(options: TelemetryEventOptions) {
  if (options.critical) {
    return parseUnitFloat(process.env.TELEMETRY_CRITICAL_SAMPLE_RATE, defaultCriticalSampleRate);
  }

  return (
    options.sampleRate ?? parseUnitFloat(process.env.TELEMETRY_SAMPLE_RATE, defaultEventSampleRate)
  );
}

function canCaptureEvent(options: TelemetryEventOptions) {
  const sampleRate = resolveEventSampleRate(options);
  const dailyCap = parsePositiveInt(process.env.TELEMETRY_MAX_EVENTS_PER_DAY, defaultDailyCap);
  return shouldSample(sampleRate) && consumeDailyBudget(dailyCap);
}

function sentryEnabled() {
  return Boolean(normalizeEnv(process.env.SENTRY_DSN));
}

function sanitizeSentryEvent<TEvent extends Sentry.Event>(event: TEvent): TEvent {
  const sanitizedRequest = event.request
    ? {
        ...event.request,
        data: undefined,
        cookies: undefined
      }
    : undefined;

  return {
    ...event,
    request: sanitizedRequest,
    extra: sanitizeProperties(event.extra as TelemetryProperties | undefined),
    contexts: sanitizeValue(event.contexts) as Sentry.Event["contexts"]
  } as TEvent;
}

export function initApiTelemetry() {
  if (sentryInitialized || !sentryEnabled()) {
    return;
  }

  try {
    Sentry.init({
      dsn: normalizeEnv(process.env.SENTRY_DSN),
      environment: normalizeEnv(process.env.SENTRY_ENVIRONMENT) ?? process.env.NODE_ENV,
      release: normalizeEnv(process.env.SENTRY_RELEASE),
      sendDefaultPii: false,
      sampleRate: parseUnitFloat(
        process.env.SENTRY_ERROR_SAMPLE_RATE,
        defaultSentryErrorSampleRate
      ),
      tracesSampleRate: parseUnitFloat(
        process.env.SENTRY_TRACE_SAMPLE_RATE,
        defaultSentryTraceSampleRate
      ),
      beforeSend: sanitizeSentryEvent
    });
    sentryInitialized = true;
  } catch (error) {
    logger.warn("failed to initialize sentry", undefined, error);
  }
}

export function captureApiEvent(
  eventName: TelemetryEventName,
  properties: TelemetryProperties = {},
  options: TelemetryEventOptions = {}
) {
  const client = resolvePosthogClient();
  if (!client || !canCaptureEvent(options)) {
    return;
  }

  const requestId = getRequestId();
  const distinctId = options.distinctId ?? options.workspaceId ?? `request:${requestId}`;
  const safeProperties = sanitizeProperties({
    ...properties,
    requestId,
    workspaceId: options.workspaceId ?? null
  });

  try {
    client.capture({
      distinctId,
      event: eventName,
      properties: safeProperties
    });
  } catch (error) {
    logger.warn("failed to capture posthog event", { eventName }, error);
  }
}

export function captureApiException(exception: unknown, context: TelemetryExceptionContext = {}) {
  if (!sentryEnabled()) {
    return;
  }

  try {
    const requestId = getRequestId();
    Sentry.withScope((scope) => {
      scope.setTag("requestId", requestId);
      if (context.workspaceId) {
        scope.setTag("workspaceId", context.workspaceId);
      }
      for (const [key, value] of Object.entries(context.tags ?? {})) {
        scope.setTag(key, String(value));
      }
      if (context.extras) {
        scope.setContext("metadata", sanitizeProperties(context.extras));
      }
      Sentry.captureException(toError(exception));
    });
  } catch (error) {
    logger.warn("failed to capture sentry exception", undefined, error);
  }
}

export async function shutdownApiTelemetry() {
  if (!posthogClient) {
    return;
  }

  try {
    await posthogClient.shutdown();
  } catch (error) {
    logger.warn("failed to shutdown posthog client", undefined, error);
  }
}
