import { ArgumentsHost, Catch } from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";
import type { FastifyRequest } from "fastify";
import { captureApiException } from "./api-telemetry";

type RouteAwareFastifyRequest = FastifyRequest & {
  routeOptions?: {
    url?: string;
  };
};

function readWorkspaceIdFromValue(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = (value as Record<string, unknown>).workspaceId;
  if (typeof candidate !== "string") {
    return undefined;
  }

  const normalized = candidate.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function resolveWorkspaceId(request: FastifyRequest) {
  return (
    readWorkspaceIdFromValue(request.params) ??
    readWorkspaceIdFromValue(request.query) ??
    readWorkspaceIdFromValue(request.body)
  );
}

function resolveRoutePath(request: FastifyRequest) {
  const routeAware = request as RouteAwareFastifyRequest;
  return routeAware.routeOptions?.url ?? request.url;
}

@Catch()
export class SentryExceptionFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() === "http") {
      const request = host.switchToHttp().getRequest<FastifyRequest>();
      captureApiException(exception, {
        workspaceId: resolveWorkspaceId(request),
        tags: {
          method: request.method,
          route: resolveRoutePath(request)
        }
      });
    } else {
      captureApiException(exception);
    }

    super.catch(exception, host);
  }
}
