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
import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { Public } from "../../shared/auth/public.decorator";
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

const LOCAL_REDIRECT_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3010",
  "http://127.0.0.1:3010"
];

export function authCookieSecure() {
  const explicit = process.env.AUTH_COOKIE_SECURE?.trim();
  if (explicit) {
    return explicit.toLowerCase() !== "false";
  }

  const nodeEnv = process.env.NODE_ENV?.trim().toLowerCase();
  return nodeEnv === "production" || nodeEnv === "staging";
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

function buildCookieValue(sessionToken: string) {
  const cookieParts = [
    `session_token=${encodeURIComponent(sessionToken)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
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

function resolveRedirectOrigins() {
  const configured = process.env.CORS_ALLOWED_ORIGINS?.trim();
  if (configured) {
    return configured
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  const appUrl = process.env.APP_URL?.trim();
  if (!appUrl) {
    return LOCAL_REDIRECT_ORIGINS;
  }

  return Array.from(new Set([appUrl, ...LOCAL_REDIRECT_ORIGINS]));
}

function resolveSafeRedirectTarget(rawTarget?: string) {
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
          return null;
        }
      })
      .filter((origin): origin is string => Boolean(origin))
  );

  return allowedOrigins.has(parsed.origin) ? parsed.toString() : null;
}

function requestAcceptsHtml(request: FastifyRequest) {
  const accept = request.headers.accept;
  return typeof accept === "string" && accept.includes("text/html");
}

function mapBetterAuthError(error: unknown): HttpException {
  if (error instanceof HttpException) {
    return error;
  }

  if (typeof error !== "object" || !error) {
    return new InternalServerErrorException("Authentication request failed");
  }

  const maybeStatusCode = (error as { statusCode?: unknown }).statusCode;
  const rawStatusCode = typeof maybeStatusCode === "number" ? maybeStatusCode : undefined;
  const statusCode =
    rawStatusCode === undefined
      ? 500
      : rawStatusCode >= 300 && rawStatusCode < 400
        ? 401
        : rawStatusCode;

  const maybeBodyMessage = (error as { body?: { message?: unknown } }).body?.message;
  const maybeMessage = (error as { message?: unknown }).message;
  const message =
    (typeof maybeBodyMessage === "string" && maybeBodyMessage.trim()) ||
    (typeof maybeMessage === "string" && maybeMessage.trim()) ||
    "Authentication request failed";

  if (statusCode === 401 && message === "Authentication request failed") {
    return new HttpException("Invalid or expired magic link token", statusCode);
  }

  if (!rawStatusCode) {
    return new InternalServerErrorException(message);
  }

  return new HttpException(message, statusCode);
}

@Controller("auth")
@Public()
export class AuthController {
  @Post("sign-in/magic-link")
  async requestMagicLink(@Body() body: unknown, @Req() request: FastifyRequest) {
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.requestMagicLinkWithBetterAuth(parsed.data, request);
  }

  @Get("magic-link/verify")
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
      if (mapped.getStatus() >= 400 && mapped.getStatus() < 500) {
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
      response.redirect(302, redirectTarget);
      return;
    }

    if (requestAcceptsHtml(request)) {
      const appFallback = resolveSafeRedirectTarget(process.env.APP_URL);
      if (appFallback) {
        response.redirect(302, appFallback);
        return;
      }
    }

    return {
      ok: true,
      userId: result.user.id
    };
  }
}
