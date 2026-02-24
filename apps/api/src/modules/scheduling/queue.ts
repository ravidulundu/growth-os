import { Queue } from "bullmq";
import IORedis from "ioredis";
import { Logger } from "@nestjs/common";

let redisConnection: IORedis | undefined;
let publishQueue: Queue | undefined;
let metricsQueue: Queue | undefined;
let maintenanceQueue: Queue | undefined;
const logger = new Logger("SchedulingQueue");

function getRedisUrl() {
  return process.env.REDIS_URL ?? "redis://localhost:56379";
}

export function getRedisConnection() {
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
    publishQueue = new Queue("publish-jobs", {
      connection: getRedisConnection(),
      defaultJobOptions: {
        // Publish retries are orchestrated by worker state transitions + DB updates.
        // Keep BullMQ native retries disabled to avoid dual retry flows.
        attempts: 1,
        backoff: { type: "exponential", delay: 60_000 },
        removeOnComplete: true,
        removeOnFail: 100
      }
    });
  }

  return publishQueue;
}

export function getMetricsQueue() {
  if (!metricsQueue) {
    metricsQueue = new Queue("metrics-jobs", {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: true,
        removeOnFail: 50
      }
    });
  }

  return metricsQueue;
}

export function getMaintenanceQueue() {
  if (!maintenanceQueue) {
    maintenanceQueue = new Queue("maintenance-jobs", {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 60_000 },
        removeOnComplete: true,
        removeOnFail: 50
      }
    });
  }

  return maintenanceQueue;
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

  if (maintenanceQueue) {
    const activeMaintenanceQueue = maintenanceQueue;
    maintenanceQueue = undefined;
    await activeMaintenanceQueue.close();
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
