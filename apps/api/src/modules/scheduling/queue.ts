import { Queue } from "bullmq";
import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:56379";

let redisConnection: IORedis | undefined;
let publishQueue: Queue | undefined;
let metricsQueue: Queue | undefined;

function connection() {
  if (!redisConnection) {
    redisConnection = new IORedis(redisUrl, {
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
