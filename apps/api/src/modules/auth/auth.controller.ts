import {
  BadRequestException,
  Body,
  Controller,
  HttpException,
  InternalServerErrorException,
  Logger,
  Get,
  Post,
  Query,
  Req,
  Res
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { Public } from "../../shared/auth/public.decorator";
import {
  resolveAuthCookieSameSiteHeaderValue,
  resolveAuthCookieSecure
} from "../../shared/auth/cookie-policy";
import { getPool } from "../../shared/db/pool";
import { resolveAppOrigins } from "../../shared/http/origin-utils";
import { getBetterAuth } from "./better-auth";
import { buildMagicLinkRequestResponse } from "./auth-response";

const requestSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).optional(),
  callbackURL: z.string().url().optional(),
  newUserCallbackURL: z.string().url().optional(),
  errorCallbackURL: z.string().url().optional()
});

const verifySchema = z.object({
  token: z.string().min(16),
  callbackURL: z.string().url().optional(),
  newUserCallbackURL: z.string().url().optional(),
  errorCallbackURL: z.string().url().optional()
});

const waitlistSchema = z.object({
  email: z.string().email(),
  source: z.string().min(1).max(64).optional()
});

const LOCAL_REDIRECT_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3010",
  "http://127.0.0.1:3010"
];

export function authCookieSecure() {
  return resolveAuthCookieSecure();
}

export function authCookieSameSite() {
  return resolveAuthCookieSameSiteHeaderValue();
}

function toWebHeaders(headersObject: FastifyRequest["headers"]) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(headersObject)) {
    if (typeof value === "string") {
      headers.set(key, value);
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
    }
  }
  return headers;
}

export function buildCookieValue(sessionToken: string) {
  const cookieParts = [
    `session_token=${encodeURIComponent(sessionToken)}`,
    "Path=/",
    "HttpOnly",
    `SameSite=${authCookieSameSite()}`,
    `Max-Age=${30 * 24 * 60 * 60}`
  ];

  if (authCookieSecure()) {
    cookieParts.push("Secure");
  }

  return cookieParts.join("; ");
}

function deriveDisplayName(email: string, name?: string) {
  if (name?.trim()) {
    return name.trim();
  }

  const localPart = email.split("@")[0]?.trim();
  return localPart && localPart.length > 0 ? localPart : "user";
}

export function resolveRedirectOrigins() {
  const configured = process.env.CORS_ALLOWED_ORIGINS?.trim();
  if (configured) {
    return configured
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  return resolveAppOrigins(process.env.APP_URL, LOCAL_REDIRECT_ORIGINS);
}

export function resolveSafeRedirectTarget(rawTarget?: string) {
  if (!rawTarget) {
    return null;
  }

  const candidate = rawTarget.trim();
  if (!candidate) {
    return null;
  }

  const fallbackBase = process.env.APP_URL?.trim() || "http://localhost:3010";

  let parsed: URL;
  try {
    parsed = new URL(candidate, fallbackBase);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  const allowedOrigins = new Set(
    resolveRedirectOrigins()
      .map((origin) => {
        try {
          return new URL(origin).origin;
        } catch {
          Logger.warn(
            `Ignoring malformed redirect origin in allowlist: ${origin}`,
            "AuthController"
          );
          return null;
        }
      })
      .filter((origin): origin is string => Boolean(origin))
  );

  return allowedOrigins.has(parsed.origin) ? parsed.toString() : null;
}

function headerAsString(value: string | string[] | undefined) {
  if (typeof value === "string") {
    return value.toLowerCase();
  }
  if (Array.isArray(value)) {
    return value.join(",").toLowerCase();
  }
  return "";
}

export function requestAcceptsHtml(request: FastifyRequest) {
  const accept = headerAsString(request.headers.accept);
  if (!accept.includes("text/html")) {
    return false;
  }

  const fetchMode = headerAsString(request.headers["sec-fetch-mode"]);
  const fetchDest = headerAsString(request.headers["sec-fetch-dest"]);

  // Sec-Fetch-* headers are set by modern browsers; older clients or custom HTTP
  // libraries may omit them entirely. When absent, fall back to Accept header alone.
  if (!fetchMode && !fetchDest) {
    return true;
  }

  return fetchMode === "navigate" || fetchDest === "document" || fetchDest === "iframe";
}

const DEFAULT_AUTH_ERROR_MESSAGE = "Authentication request failed";
const BETTER_AUTH_ERROR_MAPPING: Record<string, { status: number; message: string }> = {
  [`401:${DEFAULT_AUTH_ERROR_MESSAGE}`]: {
    status: 401,
    message: "Invalid or expired magic link token"
  }
};

function normalizeWaitlistEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeWaitlistSource(source: string | undefined) {
  if (!source) {
    return "landing";
  }

  return (
    source
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "_")
      .slice(0, 64) || "landing"
  );
}

async function persistWaitlistEntry(email: string, source: string) {
  const result = await getPool().query<{ id: string }>(
    `
      INSERT INTO waitlist_entries (email, source)
      VALUES ($1, $2)
      ON CONFLICT (email) DO NOTHING
      RETURNING id;
    `,
    [email, source]
  );

  return {
    alreadyJoined: !result.rows[0]
  };
}

function normalizeBetterAuthStatus(statusCode: unknown) {
  if (typeof statusCode !== "number") {
    return 500;
  }
  if (statusCode >= 300 && statusCode < 400) {
    return 401;
  }
  if (statusCode >= 400 && statusCode < 600) {
    return statusCode;
  }
  return 500;
}

function resolveBetterAuthMessage(error: { body?: { message?: unknown }; message?: unknown }) {
  const bodyMessage = error.body?.message;
  if (typeof bodyMessage === "string" && bodyMessage.trim()) {
    return bodyMessage;
  }

  if (typeof error.message === "string" && error.message.trim()) {
    return error.message;
  }

  return DEFAULT_AUTH_ERROR_MESSAGE;
}

function toMappedAuthError(status: number, message: string) {
  return BETTER_AUTH_ERROR_MAPPING[`${status}:${message}`] ?? { status, message };
}

function toMappedHttpException(params: { status: number; message: string }) {
  if (params.status === 500) {
    return new InternalServerErrorException(params.message);
  }

  return new HttpException(params.message, params.status);
}

export function mapBetterAuthError(error: unknown): HttpException {
  if (error instanceof HttpException) {
    return error;
  }

  if (typeof error !== "object" || !error) {
    return new InternalServerErrorException(DEFAULT_AUTH_ERROR_MESSAGE);
  }

  const authError = error as {
    statusCode?: unknown;
    body?: { message?: unknown };
    message?: unknown;
  };
  const status = normalizeBetterAuthStatus(authError.statusCode);
  const message = resolveBetterAuthMessage(authError);
  return toMappedHttpException(toMappedAuthError(status, message));
}

@Controller("auth")
@Public()
export class AuthController {
  @Post("sign-in/magic-link")
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async requestMagicLink(@Body() body: unknown, @Req() request: FastifyRequest) {
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.requestMagicLinkWithBetterAuth(parsed.data, request);
  }

  @Get("magic-link/verify")
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async verifyMagicLink(
    @Query() query: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) response: FastifyReply
  ) {
    const parsed = verifySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.verifyMagicLinkWithBetterAuth(parsed.data, request, response);
  }

  @Post("waitlist")
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async joinWaitlist(@Body() body: unknown) {
    const parsed = waitlistSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const normalizedEmail = normalizeWaitlistEmail(parsed.data.email);
    const normalizedSource = normalizeWaitlistSource(parsed.data.source);
    const result = await persistWaitlistEntry(normalizedEmail, normalizedSource);

    return {
      ok: true,
      alreadyJoined: result.alreadyJoined,
      message: result.alreadyJoined
        ? "You are already on the waitlist."
        : "You have been added to the waitlist."
    };
  }

  private async requestMagicLinkWithBetterAuth(
    payload: z.infer<typeof requestSchema>,
    request: FastifyRequest
  ) {
    try {
      const auth = await getBetterAuth();
      await auth.api.signInMagicLink({
        body: {
          ...payload,
          email: payload.email.toLowerCase().trim(),
          name: deriveDisplayName(payload.email, payload.name)
        },
        headers: toWebHeaders(request.headers)
      });
    } catch (error) {
      const mapped = mapBetterAuthError(error);
      Logger.warn(
        `Magic link request failed (${mapped.getStatus()}): ${mapped.message}`,
        "AuthController"
      );
      // Anti-enumeration: rate-limited requests return the same generic success response
      // so attackers cannot distinguish rate-limited emails from non-existent ones.
      if (mapped.getStatus() === 429) {
        return buildMagicLinkRequestResponse();
      }
      throw mapped;
    }

    return buildMagicLinkRequestResponse();
  }

  private async verifyMagicLinkWithBetterAuth(
    payload: z.infer<typeof verifySchema>,
    request: FastifyRequest,
    response: FastifyReply
  ) {
    let result: { token: string; user: { id: string } };
    try {
      const auth = await getBetterAuth();
      result = await auth.api.magicLinkVerify({
        query: payload,
        headers: toWebHeaders(request.headers)
      });
    } catch (error) {
      throw mapBetterAuthError(error);
    }

    response.header("Set-Cookie", buildCookieValue(result.token));

    const redirectTarget = resolveSafeRedirectTarget(
      payload.callbackURL ?? payload.newUserCallbackURL
    );
    if (redirectTarget) {
      response.redirect(redirectTarget, 302);
      return;
    }

    if (requestAcceptsHtml(request)) {
      const appFallback = resolveSafeRedirectTarget(process.env.APP_URL);
      if (appFallback) {
        response.redirect(appFallback, 302);
        return;
      }
    }

    return {
      ok: true,
      userId: result.user.id
    };
  }
}
