import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import cors from "@fastify/cors";
import { AppModule } from "./app.module";
import { loadEnv } from "./shared/db/env";

async function bootstrap() {
  loadEnv();

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false })
  );

  await app.register(cors, {
    origin: true,
    credentials: true
  });

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port, "0.0.0.0");

  Logger.log(`API running on http://localhost:${port}`, "Bootstrap");
}

bootstrap();
