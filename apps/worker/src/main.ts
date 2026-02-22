import { QueueEvents, Worker } from "bullmq";
import { config } from "dotenv";
import IORedis from "ioredis";

config();

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:56379";
const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true
});

const queueName = "publish-jobs";

const worker = new Worker(
  queueName,
  async (job) => {
    console.log(`[worker] job received: ${job.id} (${job.name})`);
    return {
      processedAt: new Date().toISOString(),
      status: "ok"
    };
  },
  { connection }
);

const events = new QueueEvents(queueName, { connection });

events.on("completed", ({ jobId }) => {
  console.log(`[worker] job completed: ${jobId}`);
});

events.on("failed", ({ jobId, failedReason }) => {
  console.error(`[worker] job failed: ${jobId} - ${failedReason}`);
});

worker.on("ready", () => {
  console.log(`[worker] ready on queue '${queueName}' using ${redisUrl}`);
});

worker.on("error", (error) => {
  console.error("[worker] error", error);
});

process.on("SIGINT", async () => {
  await worker.close();
  await events.close();
  await connection.quit();
  process.exit(0);
});
