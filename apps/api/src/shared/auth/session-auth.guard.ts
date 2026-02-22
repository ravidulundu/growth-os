import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { createHash } from "node:crypto";
import { getPool } from "../db/pool";
import { IS_PUBLIC_ROUTE } from "./public.decorator";

export function extractBearerToken(headerValue: string | string[] | undefined) {
  const header = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (!header) {
    return null;
  }

  const separatorIndex = header.indexOf(" ");
  if (separatorIndex <= 0) {
    return null;
  }

  const scheme = header.slice(0, separatorIndex).toLowerCase();
  if (scheme !== "bearer") {
    return null;
  }

  const token = header.slice(separatorIndex + 1).trim();
  if (!token || token.includes(" ")) {
    return null;
  }

  return token;
}

function extractCookieToken(headerValue: string | string[] | undefined, cookieName: string) {
  const header = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (!header) {
    return null;
  }

  for (const pair of header.split(";")) {
    const separatorIndex = pair.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const name = pair.slice(0, separatorIndex).trim();
    if (name !== cookieName) {
      continue;
    }
    const value = pair.slice(separatorIndex + 1).trim();
    if (!value) {
      return null;
    }
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return null;
}

function pickStringValue(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (Array.isArray(value) && typeof value[0] === "string") {
    const trimmed = value[0].trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  return null;
}

function extractWorkspaceId(request: {
  params?: Record<string, unknown>;
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
}) {
  return (
    pickStringValue(request.params?.workspaceId) ??
    pickStringValue(request.body?.workspaceId) ??
    pickStringValue(request.body?.workspace_id) ??
    pickStringValue(request.query?.workspaceId) ??
    pickStringValue(request.query?.workspace_id)
  );
}

function extractScopedResourceIds(request: {
  params?: Record<string, unknown>;
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
}) {
  return {
    contentId:
      pickStringValue(request.params?.contentId) ??
      pickStringValue(request.body?.contentId) ??
      pickStringValue(request.query?.contentId),
    accountId:
      pickStringValue(request.params?.accountId) ??
      pickStringValue(request.body?.accountId) ??
      pickStringValue(request.query?.accountId),
    publishJobId:
      pickStringValue(request.params?.publishJobId) ??
      pickStringValue(request.body?.publishJobId) ??
      pickStringValue(request.query?.publishJobId),
    publishedPostId:
      pickStringValue(request.params?.publishedPostId) ??
      pickStringValue(request.body?.publishedPostId) ??
      pickStringValue(request.query?.publishedPostId)
  };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

type RouteAwareRequest = {
  method?: unknown;
  routerPath?: unknown;
  routeOptions?: { url?: unknown };
  url?: unknown;
};

const WORKSPACE_OPTIONAL_ROUTE_KEYS = new Set(["GET:/auth/session"]);

export function resolveRouteKey(request: RouteAwareRequest) {
  const method = typeof request.method === "string" ? request.method.toUpperCase() : "";
  if (!method) {
    return null;
  }

  const routerPath =
    typeof request.routerPath === "string"
      ? request.routerPath
      : typeof request.routeOptions?.url === "string"
        ? request.routeOptions.url
        : typeof request.url === "string"
          ? request.url.split("?")[0]
          : "";
  if (!routerPath) {
    return null;
  }

  return `${method}:${routerPath}`;
}

export function isWorkspaceScopeOptionalRoute(request: RouteAwareRequest) {
  const routeKey = resolveRouteKey(request);
  return routeKey ? WORKSPACE_OPTIONAL_ROUTE_KEYS.has(routeKey) : false;
}

export function buildSessionTokenLookupCandidates(token: string) {
  const sha256 = createHash("sha256").update(token).digest();
  return Array.from(
    new Set([
      token,
      sha256.toString("hex"),
      sha256.toString("base64"),
      sha256.toString("base64url")
    ])
  );
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass()
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      method?: string;
      routerPath?: string;
      routeOptions?: { url?: string };
      url?: string;
      params?: Record<string, unknown>;
      body?: Record<string, unknown>;
      query?: Record<string, unknown>;
      auth?: { userId: string; sessionId: string; workspaceId?: string };
    }>();
    const token =
      extractBearerToken(request.headers.authorization) ??
      extractCookieToken(request.headers.cookie, "session_token");
    if (!token) {
      throw new UnauthorizedException("Missing or invalid session token");
    }
    const tokenCandidates = buildSessionTokenLookupCandidates(token);

    const pool = getPool();
    const betterAuthSessionResult = await pool.query<{ id: string; user_id: string }>(
      `
        SELECT id, user_id
        FROM better_auth_sessions
        WHERE token = ANY($1::text[])
          AND expires_at > now()
        ORDER BY created_at DESC
        LIMIT 1;
      `,
      [tokenCandidates]
    );

    const session = betterAuthSessionResult.rows[0];
    if (!session) {
      throw new UnauthorizedException("Invalid or expired session");
    }

    const explicitWorkspaceId = extractWorkspaceId(request);
    if (explicitWorkspaceId && !isUuid(explicitWorkspaceId)) {
      throw new ForbiddenException("Workspace access denied");
    }

    const scopedResourceIds = extractScopedResourceIds(request);
    const hasScopedResourceId = Boolean(
      scopedResourceIds.contentId ||
        scopedResourceIds.accountId ||
        scopedResourceIds.publishJobId ||
        scopedResourceIds.publishedPostId
    );

    const scopedWorkspaceIds = new Set<string>();
    const registerScopedWorkspaceId = (workspaceId: string | null) => {
      if (!workspaceId) {
        throw new ForbiddenException("Workspace access denied");
      }
      scopedWorkspaceIds.add(workspaceId);
      if (scopedWorkspaceIds.size > 1) {
        throw new ForbiddenException("Workspace access denied");
      }
    };

    if (scopedResourceIds.contentId) {
      if (!isUuid(scopedResourceIds.contentId)) {
        throw new ForbiddenException("Workspace access denied");
      }
      const contentWorkspaceResult = await pool.query<{ workspace_id: string }>(
        `
          SELECT workspace_id
          FROM contents
          WHERE id = $1
          LIMIT 1;
        `,
        [scopedResourceIds.contentId]
      );
      registerScopedWorkspaceId(contentWorkspaceResult.rows[0]?.workspace_id ?? null);
    }

    if (scopedResourceIds.accountId) {
      if (!isUuid(scopedResourceIds.accountId)) {
        throw new ForbiddenException("Workspace access denied");
      }
      const accountWorkspaceResult = await pool.query<{ workspace_id: string }>(
        `
          SELECT workspace_id
          FROM x_accounts
          WHERE id = $1
          LIMIT 1;
        `,
        [scopedResourceIds.accountId]
      );
      registerScopedWorkspaceId(accountWorkspaceResult.rows[0]?.workspace_id ?? null);
    }

    if (scopedResourceIds.publishJobId) {
      if (!isUuid(scopedResourceIds.publishJobId)) {
        throw new ForbiddenException("Workspace access denied");
      }
      const publishJobWorkspaceResult = await pool.query<{ workspace_id: string }>(
        `
          SELECT workspace_id
          FROM publish_jobs
          WHERE id = $1
          LIMIT 1;
        `,
        [scopedResourceIds.publishJobId]
      );
      registerScopedWorkspaceId(publishJobWorkspaceResult.rows[0]?.workspace_id ?? null);
    }

    if (scopedResourceIds.publishedPostId) {
      if (!isUuid(scopedResourceIds.publishedPostId)) {
        throw new ForbiddenException("Workspace access denied");
      }
      const publishedWorkspaceResult = await pool.query<{ workspace_id: string }>(
        `
          SELECT workspace_id
          FROM published_posts
          WHERE id = $1
          LIMIT 1;
        `,
        [scopedResourceIds.publishedPostId]
      );
      registerScopedWorkspaceId(publishedWorkspaceResult.rows[0]?.workspace_id ?? null);
    }

    const derivedWorkspaceId = scopedWorkspaceIds.values().next().value ?? null;
    if (explicitWorkspaceId && derivedWorkspaceId && explicitWorkspaceId !== derivedWorkspaceId) {
      throw new ForbiddenException("Workspace access denied");
    }

    const workspaceId = explicitWorkspaceId ?? derivedWorkspaceId;
    if (hasScopedResourceId && !workspaceId) {
      throw new ForbiddenException("Workspace access denied");
    }
    if (!workspaceId && !hasScopedResourceId && !isWorkspaceScopeOptionalRoute(request)) {
      throw new ForbiddenException("Workspace ID is required");
    }

    if (workspaceId) {
      const membershipResult = await pool.query<{ ok: number }>(
        `
          SELECT 1 AS ok
          FROM workspace_members
          WHERE workspace_id = $1
            AND user_id = $2
          LIMIT 1;
        `,
        [workspaceId, session.user_id]
      );

      if (!membershipResult.rows[0]) {
        throw new ForbiddenException("Workspace access denied");
      }
    }

    request.auth = {
      userId: session.user_id,
      sessionId: session.id,
      workspaceId: workspaceId ?? undefined
    };

    // Best-effort activity update; auth should not fail solely due to this.
    void pool
      .query(
        `
          UPDATE better_auth_sessions
          SET updated_at = now()
          WHERE id = $1;
        `,
        [session.id]
      )
      .catch(() => undefined);

    return true;
  }
}
