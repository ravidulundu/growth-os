import { Logger } from "@nestjs/common";

const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);

export function isLocalhostUrl(value: string) {
  try {
    const parsed = new URL(value);
    return LOCALHOST_HOSTNAMES.has(parsed.hostname);
  } catch {
    return false;
  }
}

export function resolveAppOrigins(appUrl: string | undefined, localOrigins: readonly string[]) {
  const trimmed = appUrl?.trim();
  if (!trimmed) {
    const nodeEnv = process.env.NODE_ENV?.trim().toLowerCase();
    if (nodeEnv === "production" || nodeEnv === "staging") {
      Logger.warn(
        `APP_URL is not set in ${nodeEnv} — CORS will reject all cross-origin requests. Set APP_URL to enable CORS.`,
        "OriginUtils"
      );
      return [];
    }
    return [...localOrigins];
  }

  if (isLocalhostUrl(trimmed)) {
    return Array.from(new Set([trimmed, ...localOrigins]));
  }

  return [trimmed];
}
