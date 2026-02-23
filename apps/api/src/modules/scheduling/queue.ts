import { Queue } from "bullmq";
import IORedis from "ioredis";
import { Logger } from "@nestjs/common";

let redisConnection: IORedis | undefined;
let publishQueue: Queue | undefined;
let metricsQueue: Queue | undefined;
const logger = new Logger("SchedulingQueue");

function getRedisUrl() {
  return process.env.REDIS_URL ?? "redis://localhost:56379";
}

function connection() {
  if (!redisConnection) {
    // API process only uses Queue producers (no Worker/QueueEvents), so sharing a single
    // IORedis instance is safe — no blocking commands are involved. Workers run in a
    // separate process with dedicated per-consumer connections.
    redisConnection = new IORedis(getRedisUrl(), {
      maxRetriesPerRequest: null,
      enableReadyCheck: true
    });
  }

  return redisConnection;
}

export function getPublishQueue() {
  if (!publishQueue) {
    publishQueue = new Queue("publish-jobs", { connection: connection() });
  }

  return publishQueue;
}

export function getMetricsQueue() {
  if (!metricsQueue) {
    metricsQueue = new Queue("metrics-jobs", { connection: connection() });
  }

  return metricsQueue;
}

export async function closeSchedulingQueues() {
  if (publishQueue) {
    const activePublishQueue = publishQueue;
    publishQueue = undefined;
    await activePublishQueue.close();
  }

  if (metricsQueue) {
    const activeMetricsQueue = metricsQueue;
    metricsQueue = undefined;
    await activeMetricsQueue.close();
  }

  if (redisConnection) {
    const activeConnection = redisConnection;
    redisConnection = undefined;
    try {
      await activeConnection.quit();
    } catch (error) {
      logger.warn(
        `Redis quit failed, forcing disconnect: ${error instanceof Error ? error.message : String(error)}`
      );
      activeConnection.disconnect();
    }
  }
}
