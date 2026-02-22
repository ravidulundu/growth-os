import { Queue } from "bullmq";
import IORedis from "ioredis";

let redisConnection: IORedis | undefined;
let publishQueue: Queue | undefined;
let metricsQueue: Queue | undefined;

function getRedisUrl() {
  return process.env.REDIS_URL ?? "redis://localhost:56379";
}

function connection() {
  if (!redisConnection) {
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
    await activeConnection.quit().catch(() => activeConnection.disconnect());
  }
}
