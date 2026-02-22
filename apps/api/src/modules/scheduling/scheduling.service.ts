import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { getPool } from "../../shared/db/pool";
import { getPublishQueue } from "./queue";
import { nextSchedulerState } from "./state-machine";

function defaultDedupeKey(contentId: string, runAt: Date) {
  return createHash("sha256").update(`${contentId}:${runAt.toISOString()}`).digest("hex");
}

function safeModeEnabled() {
  return (process.env.SAFE_MODE_ENABLED ?? "true").toLowerCase() !== "false";
}

@Injectable()
export class SchedulingService {
  protected dbPool() {
    return getPool();
  }

  async schedule(params: {
    workspaceId: string;
    accountId: string;
    contentId: string;
    runAt: Date;
    dedupeKey?: string;
    confirmHumanReview?: boolean;
  }) {
    const runAt = params.runAt;
    const dedupeKey = params.dedupeKey ?? defaultDedupeKey(params.contentId, runAt);
    const queueDelay = Math.max(0, runAt.getTime() - Date.now());
    let publishJobId: string | undefined;

    if (safeModeEnabled() && !params.confirmHumanReview) {
      throw new BadRequestException(
        "SAFE_MODE is enabled. Set confirmHumanReview=true before scheduling publish."
      );
    }

    const client = await this.dbPool().connect();

    try {
      await client.query("BEGIN");
      const contentResult = await client.query<{ id: string }>(
        `
          SELECT id
          FROM contents
          WHERE id = $1
            AND workspace_id = $2
          FOR UPDATE;
        `,
        [params.contentId, params.workspaceId]
      );

      if (!contentResult.rows[0]) {
        throw new NotFoundException("Content not found");
      }

      const result = await client.query<{ id: string }>(
        `
          INSERT INTO publish_jobs (
            workspace_id,
            account_id,
            content_id,
            dedupe_key,
            state,
            run_at,
            next_run_at
          )
          VALUES ($1, $2, $3, $4, 'queued', $5, $6)
          RETURNING id;
        `,
        [params.workspaceId, params.accountId, params.contentId, dedupeKey, runAt, runAt]
      );

      publishJobId = result.rows[0].id;

      await client.query(
        `
          UPDATE contents
          SET status = 'scheduled',
              updated_at = now()
          WHERE id = $1;
        `,
        [params.contentId]
      );

      await client.query(
        `
          INSERT INTO audit_logs (workspace_id, action, entity_type, entity_id, result, metadata)
          VALUES ($1, 'scheduling.persisted', 'publish_job', $2, 'success', $3::jsonb);
        `,
        [
          params.workspaceId,
          publishJobId,
          JSON.stringify({
            runAt: runAt.toISOString(),
            dedupeKey,
            confirmHumanReview: params.confirmHumanReview ?? false
          })
        ]
      );

      await client.query("COMMIT");
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // noop
      }

      const message = String((error as { message?: string }).message ?? "");
      if (message.includes("uq_publish_jobs_workspace_account_dedupe")) {
        throw new ConflictException("A publish job already exists for this dedupe key");
      }

      throw error;
    } finally {
      client.release();
    }

    if (!publishJobId) {
      throw new ServiceUnavailableException("Publish job creation failed");
    }

    try {
      await getPublishQueue().add(
        "publish",
        { publishJobId },
        {
          jobId: `publish:${publishJobId}:initial`,
          delay: queueDelay,
          removeOnComplete: true,
          removeOnFail: 100
        }
      );

      await this.dbPool().query(
        `
          INSERT INTO audit_logs (workspace_id, action, entity_type, entity_id, result, metadata)
          VALUES ($1, 'scheduling.enqueue', 'publish_job', $2, 'success', $3::jsonb);
        `,
        [
          params.workspaceId,
          publishJobId,
          JSON.stringify({
            runAt: runAt.toISOString(),
            dedupeKey,
            queueDelayMs: queueDelay
          })
        ]
      );
    } catch (error) {
      const message = String((error as { message?: string }).message ?? "Queue enqueue failed");
      const recoveryClient = await this.dbPool().connect();

      try {
        await recoveryClient.query("BEGIN");
        const failedState = nextSchedulerState("queued", "fail_permanent");

        await recoveryClient.query(
          `
            UPDATE publish_jobs
            SET state = $2,
                last_error_code = 'QUEUE_ENQUEUE_FAILED',
                last_error_message = $3,
                locked_at = NULL,
                locked_by = NULL,
                updated_at = now()
            WHERE id = $1;
          `,
          [publishJobId, failedState, message]
        );

        await recoveryClient.query(
          `
            UPDATE contents
            SET status = 'draft',
                updated_at = now()
            WHERE id = $1
              AND status = 'scheduled';
          `,
          [params.contentId]
        );

        await recoveryClient.query(
          `
            INSERT INTO audit_logs (workspace_id, action, entity_type, entity_id, result, metadata)
            VALUES ($1, 'scheduling.enqueue', 'publish_job', $2, 'failure', $3::jsonb);
          `,
          [
            params.workspaceId,
            publishJobId,
            JSON.stringify({
              runAt: runAt.toISOString(),
              dedupeKey,
              reason: message
            })
          ]
        );
        await recoveryClient.query("COMMIT");
      } catch {
        try {
          await recoveryClient.query("ROLLBACK");
        } catch {
          // noop
        }
      } finally {
        recoveryClient.release();
      }

      throw new ServiceUnavailableException("Failed to enqueue publish job");
    }

    return {
      ok: true,
      publishJobId,
      dedupeKey,
      scheduledFor: runAt.toISOString()
    };
  }

  async publishNow(params: {
    workspaceId: string;
    accountId: string;
    contentId: string;
    dedupeKey?: string;
    confirmHumanReview?: boolean;
  }) {
    return this.schedule({ ...params, runAt: new Date() });
  }

  async listJobs(workspaceId: string) {
    const result = await this.dbPool().query<{
      id: string;
      content_id: string;
      state: string;
      run_at: string;
      next_run_at: string;
      attempt_count: number;
      last_error_code: string | null;
      updated_at: string;
    }>(
      `
        SELECT
          id,
          content_id,
          state,
          run_at,
          next_run_at,
          attempt_count,
          last_error_code,
          updated_at
        FROM publish_jobs
        WHERE workspace_id = $1
        ORDER BY created_at DESC
        LIMIT 100;
      `,
      [workspaceId]
    );

    return result.rows;
  }
}
