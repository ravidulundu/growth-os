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

function extractBearerToken(headerValue: string | string[] | undefined) {
  const header = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (!header) {
    return null;
  }

  const [scheme, token] = header.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return null;
  }

  return token.trim();
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

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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
      params?: Record<string, unknown>;
      body?: Record<string, unknown>;
      query?: Record<string, unknown>;
      auth?: { userId: string; sessionId: string; workspaceId?: string };
    }>();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException("Missing or invalid Authorization header");
    }

    const tokenHash = createHash("sha256").update(token).digest("hex");
    const sessionResult = await getPool().query<{ id: string; user_id: string }>(
      `
        SELECT id, user_id
        FROM auth_sessions
        WHERE token_hash = $1
          AND revoked_at IS NULL
          AND expires_at > now()
        ORDER BY created_at DESC
        LIMIT 1;
      `,
      [tokenHash]
    );

    const session = sessionResult.rows[0];
    if (!session) {
      throw new UnauthorizedException("Invalid or expired session");
    }

    const workspaceId = extractWorkspaceId(request);
    if (workspaceId) {
      if (!isUuid(workspaceId)) {
        throw new ForbiddenException("Workspace access denied");
      }

      const membershipResult = await getPool().query<{ ok: number }>(
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
    void getPool()
      .query(
        `
          UPDATE auth_sessions
          SET last_used_at = now()
          WHERE id = $1;
        `,
        [session.id]
      )
      .catch(() => undefined);

    return true;
  }
}
