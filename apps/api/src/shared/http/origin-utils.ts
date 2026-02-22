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
    return [...localOrigins];
  }

  if (isLocalhostUrl(trimmed)) {
    return Array.from(new Set([trimmed, ...localOrigins]));
  }

  return [trimmed];
}
