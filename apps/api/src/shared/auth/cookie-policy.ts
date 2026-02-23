export function resolveAuthCookieSecure() {
  const explicit = process.env.AUTH_COOKIE_SECURE?.trim();
  if (explicit) {
    return explicit.toLowerCase() !== "false";
  }

  const nodeEnv = process.env.NODE_ENV?.trim().toLowerCase();
  return nodeEnv === "production" || nodeEnv === "staging";
}

export function resolveAuthCookieSameSiteLowercase() {
  const explicit = process.env.AUTH_COOKIE_SAME_SITE?.trim().toLowerCase();
  if (explicit === "lax") {
    return "lax" as const;
  }
  if (explicit === "none") {
    return resolveAuthCookieSecure() ? ("none" as const) : ("lax" as const);
  }
  return "strict" as const;
}

export function resolveAuthCookieSameSiteHeaderValue() {
  const value = resolveAuthCookieSameSiteLowercase();
  if (value === "none") {
    return "None";
  }
  if (value === "lax") {
    return "Lax";
  }
  return "Strict";
}
