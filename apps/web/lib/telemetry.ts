"use client";

import * as Sentry from "@sentry/browser";
import posthog from "posthog-js";

export type WebTelemetryEventName =
  | "x_connect_started"
  | "x_connect_completed"
  | "style_extracted"
  | "draft_generated"
  | "scheduled"
  | "published"
  | "first_hour_alert_triggered";

type TelemetryProperties = Record<string, unknown>;

type TrackWebEventOptions = {
  workspaceId?: string;
  sampleRate?: number;
  critical?: boolean;
};

type DailyBudgetState = {
  dayKey: string;
  count: number;
};

const telemetryBudgetStorageKey = "growth_os_web_telemetry_budget_v1";
const defaultPosthogHost = "https://app.posthog.com";
const defaultEventSampleRate = 0.2;
const defaultCriticalSampleRate = 1;
const defaultDailyCap = 800;
const defaultSentryErrorSampleRate = 0.3;
const defaultSentryTraceSampleRate = 0.05;
const piiKeyPattern = /(email|token|secret|password|cookie|authorization|auth|session|key)/i;
const maxSanitizeDepth = 3;

let telemetryInitialized = false;
let posthogReady = false;

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

function inBrowser() {
  return typeof window !== "undefined";
}

function currentDayKeyUtc() {
  return new Date().toISOString().slice(0, 10);
}

function readDailyBudgetState(): DailyBudgetState {
  if (!inBrowser()) {
    return { dayKey: currentDayKeyUtc(), count: 0 };
  }

  try {
    const raw = window.localStorage.getItem(telemetryBudgetStorageKey);
    if (!raw) {
      return { dayKey: currentDayKeyUtc(), count: 0 };
    }
    const parsed = JSON.parse(raw) as DailyBudgetState;
    if (typeof parsed.dayKey !== "string" || typeof parsed.count !== "number") {
      return { dayKey: currentDayKeyUtc(), count: 0 };
    }
    return parsed;
  } catch {
    return { dayKey: currentDayKeyUtc(), count: 0 };
  }
}

function writeDailyBudgetState(state: DailyBudgetState) {
  if (!inBrowser()) {
    return;
  }

  try {
    window.localStorage.setItem(telemetryBudgetStorageKey, JSON.stringify(state));
  } catch {
    // Ignore storage write failures.
  }
}

function consumeDailyBudget(maxEvents: number) {
  const today = currentDayKeyUtc();
  const current = readDailyBudgetState();
  const normalized = current.dayKey === today ? current : { dayKey: today, count: 0 };
  if (normalized.count >= maxEvents) {
    return false;
  }

  const next = { dayKey: today, count: normalized.count + 1 };
  writeDailyBudgetState(next);
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

function sanitizeProperties(properties: TelemetryProperties) {
  return sanitizeValue(properties) as TelemetryProperties;
}

function sanitizeSentryEvent<TEvent extends Sentry.Event>(event: TEvent): TEvent {
  return {
    ...event,
    request: undefined,
    extra: sanitizeProperties((event.extra ?? {}) as TelemetryProperties),
    contexts: sanitizeValue(event.contexts) as Sentry.Event["contexts"]
  } as TEvent;
}

function initSentry() {
  const dsn = normalizeEnv(process.env.NEXT_PUBLIC_SENTRY_DSN);
  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    environment:
      normalizeEnv(process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT) ??
      normalizeEnv(process.env.NODE_ENV),
    release: normalizeEnv(process.env.NEXT_PUBLIC_SENTRY_RELEASE),
    sendDefaultPii: false,
    sampleRate: parseUnitFloat(
      process.env.NEXT_PUBLIC_SENTRY_ERROR_SAMPLE_RATE,
      defaultSentryErrorSampleRate
    ),
    tracesSampleRate: parseUnitFloat(
      process.env.NEXT_PUBLIC_SENTRY_TRACE_SAMPLE_RATE,
      defaultSentryTraceSampleRate
    ),
    beforeSend: sanitizeSentryEvent
  });
}

function initPosthog() {
  const apiKey = normalizeEnv(process.env.NEXT_PUBLIC_POSTHOG_KEY);
  if (!apiKey || !inBrowser()) {
    return;
  }

  posthog.init(apiKey, {
    api_host: normalizeEnv(process.env.NEXT_PUBLIC_POSTHOG_HOST) ?? defaultPosthogHost,
    autocapture: false,
    capture_pageview: false,
    persistence: "localStorage+cookie"
  });
  posthogReady = true;
}

export function initWebTelemetry() {
  if (telemetryInitialized || !inBrowser()) {
    return;
  }

  telemetryInitialized = true;
  initSentry();
  initPosthog();
}

function resolveEventSampleRate(options: TrackWebEventOptions) {
  if (options.critical) {
    return parseUnitFloat(
      process.env.NEXT_PUBLIC_TELEMETRY_CRITICAL_SAMPLE_RATE,
      defaultCriticalSampleRate
    );
  }

  return (
    options.sampleRate ??
    parseUnitFloat(process.env.NEXT_PUBLIC_TELEMETRY_SAMPLE_RATE, defaultEventSampleRate)
  );
}

function canCaptureEvent(options: TrackWebEventOptions) {
  const sampleRate = resolveEventSampleRate(options);
  const dailyCap = parsePositiveInt(
    process.env.NEXT_PUBLIC_TELEMETRY_MAX_EVENTS_PER_DAY,
    defaultDailyCap
  );
  return shouldSample(sampleRate) && consumeDailyBudget(dailyCap);
}

export function trackWebEvent(
  eventName: WebTelemetryEventName,
  properties: TelemetryProperties = {},
  options: TrackWebEventOptions = {}
) {
  initWebTelemetry();
  if (!posthogReady || !canCaptureEvent(options)) {
    return;
  }

  const safeProperties = sanitizeProperties({
    ...properties,
    workspaceId: options.workspaceId ?? null
  });
  try {
    posthog.capture(eventName, safeProperties);
  } catch {
    // Telemetry errors must never break UI flows.
  }
}
