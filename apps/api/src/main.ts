import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import type { FastifyRequest } from "fastify";
import { loadEnv } from "./shared/db/env";
import { closePool } from "./shared/db/pool";
import { getRequestId, requestContextStorage } from "./shared/context/request-context";
import { resolveAppOrigins } from "./shared/http/origin-utils";
import {
  captureApiException,
  initApiTelemetry,
  shutdownApiTelemetry
} from "./shared/telemetry/api-telemetry";

const LOCAL_DEV_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3010",
  "http://127.0.0.1:3010"
];

function allowedCorsOrigins() {
  const configured = process.env.CORS_ALLOWED_ORIGINS?.trim();
  if (configured) {
    return configured
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  return resolveAppOrigins(process.env.APP_URL, LOCAL_DEV_ORIGINS);
}

function resolveHeaderRequestId(headerValue: string | string[] | undefined): string | undefined {
  const candidate = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (typeof candidate !== "string") {
    return undefined;
  }

  const normalized = candidate.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function cspDirectives() {
  const isProduction = (process.env.NODE_ENV ?? "development") === "production";
  if (!isProduction) {
    return {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "http:", "https:", "ws:", "wss:"],
      fontSrc: ["'self'", "data:", "https:"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    };
  }

  return {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "https:"],
    connectSrc: ["'self'"],
    fontSrc: ["'self'"],
    objectSrc: ["'none'"],
    frameSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"]
  };
}

async function bootstrap() {
  loadEnv();
  initApiTelemetry();
  const { AppModule } = await import("./app.module");

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
    { rawBody: true }
  );
  app.enableShutdownHooks();
  const fastifyInstance = app.getHttpAdapter().getInstance();

  fastifyInstance.addHook("onRequest", (request, _reply, done) => {
    const requestId = resolveHeaderRequestId(request.headers["x-request-id"]) ?? request.id;
    (request as FastifyRequest & { requestId: string }).requestId = requestId;
    requestContextStorage.run({ requestId }, () => done());
  });

  fastifyInstance.addHook("onSend", async (request, reply, payload) => {
    const requestId =
      (request as FastifyRequest & { requestId?: string }).requestId ?? getRequestId();
    reply.header("x-request-id", requestId);
    return payload;
  });

  fastifyInstance.addHook("onClose", async () => {
    await shutdownApiTelemetry();
    await closePool();
  });

  // Security headers — registered before CORS to ensure headers on all responses.
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: cspDirectives()
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }
  });

  // CORS policy is read once at startup; restart is required after env changes.
  // Keep CORS registration in a single place. Do not call app.enableCors()
  // in addition to this block to avoid duplicate CORS hook registration.
  const allowlist = new Set(allowedCorsOrigins());
  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin || allowlist.has(origin)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
  });

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port, "0.0.0.0");

  Logger.log(`API running on http://localhost:${port}`, "Bootstrap");
}

const bootstrapLogger = new Logger("Process");

process.on("unhandledRejection", (reason) => {
  bootstrapLogger.error(
    "Unhandled Promise Rejection — this indicates a missing .catch() or await",
    reason instanceof Error ? reason.stack : String(reason)
  );
  captureApiException(reason, { tags: { source: "unhandledRejection" } });
  if (process.env.NODE_ENV === "production") {
    process.exit(1);
  }
});

process.on("uncaughtException", (error) => {
  bootstrapLogger.error("Uncaught Exception — process will exit", error.stack);
  captureApiException(error, { tags: { source: "uncaughtException" } });
  process.exit(1);
});

bootstrap().catch((error) => {
  Logger.error("Failed to bootstrap API application", error, "Bootstrap");
  captureApiException(error, { tags: { source: "bootstrap" } });
  process.exit(1);
});
