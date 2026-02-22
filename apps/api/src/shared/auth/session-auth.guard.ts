import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
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
      auth?: { userId: string; sessionId: string };
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

    request.auth = {
      userId: session.user_id,
      sessionId: session.id
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
