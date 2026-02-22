import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import cors from "@fastify/cors";
import { loadEnv } from "./shared/db/env";

function allowedCorsOrigins() {
  const configured = process.env.CORS_ALLOWED_ORIGINS?.trim();
  if (configured) {
    return configured
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  const appUrl = process.env.APP_URL;
  if (appUrl) {
    return [appUrl];
  }

  return ["http://localhost:3000", "http://127.0.0.1:3000"];
}

async function bootstrap() {
  loadEnv();
  const { AppModule } = await import("./app.module");

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false })
  );

  // CORS policy is read once at startup; restart is required after env changes.
  const allowlist = new Set(allowedCorsOrigins());
  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin || allowlist.has(origin)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    credentials: true
  });

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port, "0.0.0.0");

  Logger.log(`API running on http://localhost:${port}`, "Bootstrap");
}

bootstrap();
