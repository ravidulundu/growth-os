import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import cors from "@fastify/cors";
import { loadEnv } from "./shared/db/env";
import { closePool } from "./shared/db/pool";
import { resolveAppOrigins } from "./shared/http/origin-utils";

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

async function bootstrap() {
  loadEnv();
  const { AppModule } = await import("./app.module");

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false })
  );
  app.enableShutdownHooks();
  app
    .getHttpAdapter()
    .getInstance()
    .addHook("onClose", async () => {
      await closePool();
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

bootstrap().catch((error) => {
  Logger.error("Failed to bootstrap API application", error, "Bootstrap");
  process.exit(1);
});
