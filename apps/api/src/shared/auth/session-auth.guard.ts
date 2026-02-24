import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { getPool } from "../db/pool";
import { isUuid } from "../validation/uuid";
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

// Workspace extraction priority: params > body > query. Body parsing is available
// for POST/PUT/PATCH routes; GET routes use params or query. Cross-resource
// validation in canActivate enforces all scoped IDs belong to the same workspace.
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

type ScopedRequest = {
  params?: Record<string, unknown>;
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
};

type ScopedResourceIds = {
  contentId: string | null;
  accountId: string | null;
  publishJobId: string | null;
  publishedPostId: string | null;
};

type ScopedResourceKey = keyof ScopedResourceIds;

const SCOPED_RESOURCE_KEYS: readonly ScopedResourceKey[] = [
  "contentId",
  "accountId",
  "publishJobId",
  "publishedPostId"
];

const SCOPED_RESOURCE_ALIAS_MAP: Record<ScopedResourceKey, readonly string[]> = {
  contentId: ["contentId"],
  accountId: ["accountId"],
  publishJobId: ["publishJobId"],
  publishedPostId: ["publishedPostId"]
};

const SCOPED_RESOURCE_CONTAINERS: readonly (keyof ScopedRequest)[] = ["params", "body", "query"];

function pickScopedResourceId(request: ScopedRequest, resourceKey: ScopedResourceKey) {
  for (const container of SCOPED_RESOURCE_CONTAINERS) {
    const source = request[container];
    if (!source) {
      continue;
    }

    for (const alias of SCOPED_RESOURCE_ALIAS_MAP[resourceKey]) {
      const value = pickStringValue(source[alias]);
      if (value) {
        return value;
      }
    }
  }

  return null;
}

function extractScopedResourceIds(request: ScopedRequest): ScopedResourceIds {
  return SCOPED_RESOURCE_KEYS.reduce<ScopedResourceIds>(
    (result, resourceKey) => {
      result[resourceKey] = pickScopedResourceId(request, resourceKey);
      return result;
    },
    {
      contentId: null,
      accountId: null,
      publishJobId: null,
      publishedPostId: null
    }
  );
}

type RouteAwareRequest = {
  method?: unknown;
  routerPath?: unknown;
  routeOptions?: { url?: unknown };
  url?: unknown;
};

const WORKSPACE_OPTIONAL_ROUTE_KEYS = new Set([
  "GET:/auth/session",
  "GET:/auth/session/state",
  "PATCH:/auth/session/state"
]);

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
  // Better Auth session tokens are persisted and looked up as raw token values.
  // Do not include token hashes here to avoid accepting database hash material
  // as if it were a real bearer token.
  return [token];
}

type GuardRequest = ScopedRequest &
  RouteAwareRequest & {
    headers: Record<string, string | string[] | undefined>;
    auth?: { userId: string; sessionId: string; workspaceId?: string };
  };

type SessionIdentity = {
  sessionId: string;
  userId: string;
};

type DatabasePool = ReturnType<typeof getPool>;

const SCOPED_RESOURCE_WORKSPACE_QUERIES: Record<ScopedResourceKey, string> = {
  contentId: `
    SELECT workspace_id
    FROM contents
    WHERE id = $1
    LIMIT 1;
  `,
  accountId: `
    SELECT workspace_id
    FROM x_accounts
    WHERE id = $1
    LIMIT 1;
  `,
  publishJobId: `
    SELECT workspace_id
    FROM publish_jobs
    WHERE id = $1
    LIMIT 1;
  `,
  publishedPostId: `
    SELECT workspace_id
    FROM published_posts
    WHERE id = $1
    LIMIT 1;
  `
};

function hasScopedResourceId(scopedResourceIds: ScopedResourceIds) {
  return SCOPED_RESOURCE_KEYS.some((resourceKey) => Boolean(scopedResourceIds[resourceKey]));
}

function registerScopedWorkspaceId(scopedWorkspaceIds: Set<string>, workspaceId: string | null) {
  if (!workspaceId) {
    throw new ForbiddenException("Workspace access denied");
  }

  scopedWorkspaceIds.add(workspaceId);
  if (scopedWorkspaceIds.size > 1) {
    throw new ForbiddenException("Workspace access denied");
  }
}

function resolveWorkspace(params: {
  request: GuardRequest;
  explicitWorkspaceId: string | null;
  hasScopedResourceId: boolean;
  scopedWorkspaceIds: Set<string>;
}) {
  const derivedWorkspaceId = params.scopedWorkspaceIds.values().next().value ?? null;
  if (
    params.explicitWorkspaceId &&
    derivedWorkspaceId &&
    params.explicitWorkspaceId !== derivedWorkspaceId
  ) {
    throw new ForbiddenException("Workspace access denied");
  }

  const workspaceId = params.explicitWorkspaceId ?? derivedWorkspaceId;
  if (params.hasScopedResourceId && !workspaceId) {
    throw new ForbiddenException("Workspace access denied");
  }

  if (
    !workspaceId &&
    !params.hasScopedResourceId &&
    !isWorkspaceScopeOptionalRoute(params.request)
  ) {
    throw new ForbiddenException("Workspace ID is required");
  }

  return workspaceId;
}

function attachAuth(request: GuardRequest, session: SessionIdentity, workspaceId: string | null) {
  request.auth = {
    userId: session.userId,
    sessionId: session.sessionId,
    workspaceId: workspaceId ?? undefined
  };
}

function updateSessionHeartbeat(pool: DatabasePool, logger: Logger, sessionId: string) {
  // Best-effort activity update; auth should not fail solely due to this.
  void pool
    .query(
      `
        UPDATE better_auth_sessions
        SET updated_at = now()
        WHERE id = $1;
      `,
      [sessionId]
    )
    .catch((error) => {
      logger.warn(
        `Failed to update session heartbeat for ${sessionId}: ${error instanceof Error ? error.message : String(error)}`
      );
    });
}

async function validateSession(
  request: GuardRequest,
  pool: DatabasePool
): Promise<SessionIdentity> {
  const token =
    extractBearerToken(request.headers.authorization) ??
    extractCookieToken(request.headers.cookie, "session_token");
  if (!token) {
    throw new UnauthorizedException("Missing or invalid session token");
  }

  const sessionResult = await pool.query<{ id: string; user_id: string }>(
    `
      SELECT id, user_id
      FROM better_auth_sessions
      WHERE token = ANY($1::text[])
        AND expires_at > now()
      ORDER BY created_at DESC
      LIMIT 1;
    `,
    [buildSessionTokenLookupCandidates(token)]
  );
  const session = sessionResult.rows[0];

  if (!session) {
    throw new UnauthorizedException("Invalid or expired session");
  }

  return { sessionId: session.id, userId: session.user_id };
}

async function resolveScopedWorkspaceId(
  pool: DatabasePool,
  resourceKey: ScopedResourceKey,
  resourceId: string
) {
  const result = await pool.query<{ workspace_id: string }>(
    SCOPED_RESOURCE_WORKSPACE_QUERIES[resourceKey],
    [resourceId]
  );

  return result.rows[0]?.workspace_id ?? null;
}

async function handleScopedResources(params: {
  pool: DatabasePool;
  scopedResourceIds: ScopedResourceIds;
  scopedWorkspaceIds: Set<string>;
}) {
  const workspaceLookups: Array<Promise<string | null>> = [];

  for (const resourceKey of SCOPED_RESOURCE_KEYS) {
    const resourceId = params.scopedResourceIds[resourceKey];
    if (!resourceId) {
      continue;
    }
    if (!isUuid(resourceId)) {
      throw new ForbiddenException("Workspace access denied");
    }

    workspaceLookups.push(resolveScopedWorkspaceId(params.pool, resourceKey, resourceId));
  }

  if (workspaceLookups.length === 0) {
    return;
  }

  const workspaceIds = await Promise.all(workspaceLookups);
  for (const workspaceId of workspaceIds) {
    registerScopedWorkspaceId(params.scopedWorkspaceIds, workspaceId);
  }
}

async function checkPermissions(params: {
  pool: DatabasePool;
  workspaceId: string | null;
  userId: string;
}) {
  if (!params.workspaceId) {
    return;
  }

  const membershipResult = await params.pool.query<{ ok: number }>(
    `
      SELECT 1 AS ok
      FROM workspace_members
      WHERE workspace_id = $1
        AND user_id = $2
      LIMIT 1;
    `,
    [params.workspaceId, params.userId]
  );

  if (!membershipResult.rows[0]) {
    throw new ForbiddenException("Workspace access denied");
  }
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  private readonly logger = new Logger(SessionAuthGuard.name);

  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass()
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<GuardRequest>();
    const pool = getPool();
    const session = await validateSession(request, pool);

    const explicitWorkspaceId = extractWorkspaceId(request);
    if (explicitWorkspaceId && !isUuid(explicitWorkspaceId)) {
      throw new ForbiddenException("Workspace access denied");
    }

    const scopedResourceIds = extractScopedResourceIds(request);
    const scopedWorkspaceIds = new Set<string>();
    await handleScopedResources({ pool, scopedResourceIds, scopedWorkspaceIds });

    const workspaceId = resolveWorkspace({
      request,
      explicitWorkspaceId,
      hasScopedResourceId: hasScopedResourceId(scopedResourceIds),
      scopedWorkspaceIds
    });
    await checkPermissions({ pool, workspaceId, userId: session.userId });
    attachAuth(request, session, workspaceId);
    updateSessionHeartbeat(pool, this.logger, session.sessionId);

    return true;
  }
}
