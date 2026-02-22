import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { getPool } from "../../shared/db/pool";
import { getPublishQueue } from "./queue";

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

    if (safeModeEnabled() && !params.confirmHumanReview) {
      throw new BadRequestException(
        "SAFE_MODE is enabled. Set confirmHumanReview=true before scheduling publish."
      );
    }

    const contentResult = await this.dbPool().query<{ id: string }>(
      `
        SELECT id
        FROM contents
        WHERE id = $1
          AND workspace_id = $2;
      `,
      [params.contentId, params.workspaceId]
    );

    if (!contentResult.rows[0]) {
      throw new NotFoundException("Content not found");
    }

    try {
      const result = await this.dbPool().query<{ id: string }>(
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

      await this.dbPool().query(
        `
          UPDATE contents
          SET status = 'scheduled',
              updated_at = now()
          WHERE id = $1;
        `,
        [params.contentId]
      );

      const publishJobId = result.rows[0].id;
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
            confirmHumanReview: params.confirmHumanReview ?? false
          })
        ]
      );

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

      return {
        ok: true,
        publishJobId,
        dedupeKey,
        scheduledFor: runAt.toISOString()
      };
    } catch (error) {
      const message = String((error as { message?: string }).message ?? "");
      if (message.includes("uq_publish_jobs_workspace_account_dedupe")) {
        throw new ConflictException("A publish job already exists for this dedupe key");
      }

      throw error;
    }
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
