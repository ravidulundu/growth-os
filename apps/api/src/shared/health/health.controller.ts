import { Controller, Get, HttpStatus, Res } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { type FastifyReply } from "fastify";
import { getRedisConnection } from "../../modules/scheduling/queue";
import { Public } from "../auth/public.decorator";
import { getPool } from "../db/pool";

const HEALTH_CHECK_TIMEOUT_MS = 5_000;

type DependencyHealth = {
  ok: boolean;
  latencyMs?: number;
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("health check timed out"));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

@Controller("health")
@Public()
@SkipThrottle()
export class HealthController {
  @Get()
  async healthcheck(@Res() reply: FastifyReply) {
    const [db, redis] = await Promise.all([this.checkDatabase(), this.checkRedis()]);
    const healthy = db.ok && redis.ok;

    const body = {
      status: healthy ? "ok" : "degraded",
      service: "api",
      timestamp: new Date().toISOString(),
      dependencies: {
        database: db,
        redis
      }
    };

    return reply.status(healthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE).send(body);
  }

  private async checkDatabase(): Promise<DependencyHealth> {
    const start = Date.now();
    try {
      await withTimeout(getPool().query("SELECT 1"), HEALTH_CHECK_TIMEOUT_MS);
      return { ok: true, latencyMs: Date.now() - start };
    } catch {
      return { ok: false };
    }
  }

  private async checkRedis(): Promise<DependencyHealth> {
    const start = Date.now();
    try {
      await withTimeout(getRedisConnection().ping(), HEALTH_CHECK_TIMEOUT_MS);
      return { ok: true, latencyMs: Date.now() - start };
    } catch {
      return { ok: false };
    }
  }
}
