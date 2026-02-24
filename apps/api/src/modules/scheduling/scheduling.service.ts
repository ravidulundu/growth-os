import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { getPool } from "../../shared/db/pool";
import { sendEmail } from "../../shared/email/email.service";
import { getPublishQueue } from "./queue";
import { nextSchedulerState } from "./state-machine";

function defaultDedupeKey(contentId: string, runAt: Date) {
  return createHash("sha256").update(`${contentId}:${runAt.toISOString()}`).digest("hex");
}

function publishNowDedupeKey(contentId: string, runAt: Date) {
  // Use minute-level buckets to block accidental double-click publishes while allowing later retries.
  const minuteBucket = Math.floor(runAt.getTime() / 60_000);
  return createHash("sha256").update(`${contentId}:publish-now:${minuteBucket}`).digest("hex");
}

function safeModeEnabled() {
  return (process.env.SAFE_MODE_ENABLED ?? "true").toLowerCase() !== "false";
}

type ScheduleParams = {
  workspaceId: string;
  accountId: string;
  contentId: string;
  runAt: Date;
  dedupeKey?: string;
  confirmHumanReview?: boolean;
};

type SeriesCadence = "hourly" | "daily" | "weekly" | "biweekly" | "monthly";

const seriesCadenceDelayMs: Record<SeriesCadence, number> = {
  hourly: 60 * 60_000,
  daily: 24 * 60 * 60_000,
  weekly: 7 * 24 * 60 * 60_000,
  biweekly: 14 * 24 * 60 * 60_000,
  monthly: 30 * 24 * 60 * 60_000
};

function seriesDedupeKey(seriesId: string, seriesItemId: string, runAt: Date) {
  const minuteBucket = Math.floor(runAt.getTime() / 60_000);
  return createHash("sha256")
    .update(`series:${seriesId}:item:${seriesItemId}:slot:${minuteBucket}`)
    .digest("hex");
}

const manualActionErrorCodes = new Set(["POLICY_REJECTED", "RATE_LIMIT", "AUTH_FAILED"]);
const manualFallbackNotificationType = "manual_publish_reminder";
const manualFallbackEmailChannel = "email";
const manualFallbackReasonLabels: Record<string, string> = {
  POLICY_REJECTED: "Policy rejected by X",
  RATE_LIMIT: "X API rate limit reached",
  AUTH_FAILED: "X authentication failed"
};

function createManualComposeUrl(rawText: string) {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return null;
  }
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(trimmed)}`;
}

type CreateManualPublishFallbackParams = {
  workspaceId: string;
  contentId: string;
  reasonCode: string;
  publishJobId?: string;
  reminderEmail?: string;
};

function normalizeReasonCode(reasonCode: string) {
  return reasonCode.trim().toUpperCase();
}

function manualFallbackReasonLabel(reasonCode: string) {
  return manualFallbackReasonLabels[reasonCode] ?? reasonCode;
}

function manualReminderLevel(reasonCode: string): "watch" | "critical" {
  return reasonCode === "RATE_LIMIT" ? "watch" : "critical";
}

function buildManualReminderText(params: {
  reasonCode: string;
  plainText: string;
  composeUrl: string | null;
}) {
  const reasonLabel = manualFallbackReasonLabel(params.reasonCode);
  const lines = [
    "Automatic publish failed. Manual publish fallback is ready.",
    `Reason: ${reasonLabel} (${params.reasonCode})`,
    "",
    "Plain text:",
    params.plainText,
    "",
    `Compose URL: ${params.composeUrl ?? "unavailable"}`
  ];

  return lines.join("\n");
}

@Injectable()
export class SchedulingService {
  private readonly logger = new Logger(SchedulingService.name);

  protected dbPool() {
    return getPool();
  }

  private validateScheduleInput(params: ScheduleParams) {
    if (safeModeEnabled() && !params.confirmHumanReview) {
      throw new BadRequestException(
        "SAFE_MODE is enabled. Set confirmHumanReview=true before scheduling publish."
      );
    }
  }

  private resolvePublishTime(runAt: Date) {
    return { runAt, queueDelayMs: Math.max(0, runAt.getTime() - Date.now()) };
  }

  private handleDedupe(contentId: string, runAt: Date, dedupeKey?: string) {
    return dedupeKey ?? defaultDedupeKey(contentId, runAt);
  }

  private resolveSeriesRunAt(cadence: SeriesCadence, runAt?: Date) {
    if (runAt) {
      return runAt;
    }
    const delayMs = seriesCadenceDelayMs[cadence] ?? seriesCadenceDelayMs.daily;
    return new Date(Date.now() + delayMs);
  }

  private async fetchSeriesContext(seriesId: string) {
    const result = await this.dbPool().query<{
      id: string;
      workspace_id: string;
      account_id: string;
      cadence: SeriesCadence;
      is_active: boolean;
      enqueue_next_on_publish: boolean;
    }>(
      `
        SELECT id, workspace_id, account_id, cadence, is_active, enqueue_next_on_publish
        FROM content_series
        WHERE id = $1
        LIMIT 1;
      `,
      [seriesId]
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException("Content series not found");
    }
    return row;
  }

  private async fetchNextSeriesItem(seriesId: string) {
    const result = await this.dbPool().query<{
      id: string;
      content_id: string;
      position: number;
      state: string;
    }>(
      `
        SELECT id, content_id, position, state
        FROM content_series_items
        WHERE series_id = $1
          AND state IN ('pending', 'published')
        ORDER BY
          CASE WHEN state = 'pending' THEN 0 ELSE 1 END ASC,
          position ASC
        LIMIT 1;
      `,
      [seriesId]
    );

    return result.rows[0] ?? null;
  }

  private async markSeriesItemQueued(seriesItemId: string) {
    await this.dbPool().query(
      `
        UPDATE content_series_items
        SET state = 'queued',
            last_enqueued_at = now(),
            updated_at = now()
        WHERE id = $1;
      `,
      [seriesItemId]
    );
  }

  private async ensureContentExists(client: PoolClient, params: ScheduleParams) {
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
  }

  private async createPublishJob(params: {
    client: PoolClient;
    workspaceId: string;
    accountId: string;
    contentId: string;
    dedupeKey: string;
    runAt: Date;
  }) {
    const result = await params.client.query<{ id: string }>(
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
      [
        params.workspaceId,
        params.accountId,
        params.contentId,
        params.dedupeKey,
        params.runAt,
        params.runAt
      ]
    );

    return result.rows[0]?.id;
  }

  private async markContentScheduled(client: PoolClient, contentId: string) {
    await client.query(
      `
        UPDATE contents
        SET status = 'scheduled',
            updated_at = now()
        WHERE id = $1;
      `,
      [contentId]
    );
  }

  private async logPersistedScheduling(params: {
    client: PoolClient;
    workspaceId: string;
    publishJobId: string;
    runAt: Date;
    dedupeKey: string;
    confirmHumanReview?: boolean;
  }) {
    await params.client.query(
      `
        INSERT INTO audit_logs (workspace_id, action, entity_type, entity_id, result, metadata)
        VALUES ($1, 'scheduling.persisted', 'publish_job', $2, 'success', $3::jsonb);
      `,
      [
        params.workspaceId,
        params.publishJobId,
        JSON.stringify({
          runAt: params.runAt.toISOString(),
          dedupeKey: params.dedupeKey,
          confirmHumanReview: params.confirmHumanReview ?? false
        })
      ]
    );
  }

  private async rollbackTransactionWithWarning(client: PoolClient, message: string) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      this.logger.warn(
        `${message}: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`
      );
    }
  }

  private throwOnDedupeConflict(error: unknown) {
    const message = String((error as { message?: string }).message ?? "");
    if (message.includes("uq_publish_jobs_workspace_account_dedupe")) {
      throw new ConflictException("A publish job already exists for this dedupe key");
    }
  }

  private async persistSchedule(
    params: ScheduleParams,
    runAt: Date,
    dedupeKey: string
  ): Promise<string | undefined> {
    const client = await this.dbPool().connect();
    let publishJobId: string | undefined;

    try {
      await client.query("BEGIN");
      await this.ensureContentExists(client, params);
      publishJobId = await this.createPublishJob({
        client,
        workspaceId: params.workspaceId,
        accountId: params.accountId,
        contentId: params.contentId,
        dedupeKey,
        runAt
      });
      if (publishJobId) {
        await this.markContentScheduled(client, params.contentId);
        await this.logPersistedScheduling({
          client,
          workspaceId: params.workspaceId,
          publishJobId,
          runAt,
          dedupeKey,
          confirmHumanReview: params.confirmHumanReview
        });
      }
      await client.query("COMMIT");
      return publishJobId;
    } catch (error) {
      await this.rollbackTransactionWithWarning(
        client,
        "Failed to rollback scheduling transaction"
      );
      this.throwOnDedupeConflict(error);
      throw error;
    } finally {
      client.release();
    }
  }

  private async logEnqueueSuccess(params: {
    workspaceId: string;
    publishJobId: string;
    runAt: Date;
    dedupeKey: string;
    queueDelayMs: number;
  }) {
    await this.dbPool().query(
      `
        INSERT INTO audit_logs (workspace_id, action, entity_type, entity_id, result, metadata)
        VALUES ($1, 'scheduling.enqueue', 'publish_job', $2, 'success', $3::jsonb);
      `,
      [
        params.workspaceId,
        params.publishJobId,
        JSON.stringify({
          runAt: params.runAt.toISOString(),
          dedupeKey: params.dedupeKey,
          queueDelayMs: params.queueDelayMs
        })
      ]
    );
  }

  private async persistEnqueueRecovery(params: {
    workspaceId: string;
    contentId: string;
    publishJobId: string;
    runAt: Date;
    dedupeKey: string;
    reason: string;
  }) {
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
        [params.publishJobId, failedState, params.reason]
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
          params.publishJobId,
          JSON.stringify({
            runAt: params.runAt.toISOString(),
            dedupeKey: params.dedupeKey,
            reason: params.reason
          })
        ]
      );
      await recoveryClient.query("COMMIT");
    } catch (recoveryError) {
      await this.rollbackTransactionWithWarning(
        recoveryClient,
        "Failed to rollback scheduling enqueue recovery transaction"
      );
      this.logger.error("Failed to persist enqueue recovery state", recoveryError);
    } finally {
      recoveryClient.release();
    }
  }

  private async enqueueJob(params: {
    workspaceId: string;
    contentId: string;
    publishJobId: string;
    runAt: Date;
    dedupeKey: string;
    queueDelayMs: number;
  }) {
    try {
      await getPublishQueue().add(
        "publish",
        { publishJobId: params.publishJobId },
        {
          jobId: `publish:${params.publishJobId}:initial`,
          delay: params.queueDelayMs
        }
      );
      await this.logEnqueueSuccess(params);
    } catch (error) {
      const message = String((error as { message?: string }).message ?? "Queue enqueue failed");
      await this.persistEnqueueRecovery({ ...params, reason: message });
      throw new ServiceUnavailableException("Failed to enqueue publish job");
    }
  }

  async schedule(params: ScheduleParams) {
    this.validateScheduleInput(params);
    const { runAt, queueDelayMs } = this.resolvePublishTime(params.runAt);
    const dedupeKey = this.handleDedupe(params.contentId, runAt, params.dedupeKey);
    const publishJobId = await this.persistSchedule(params, runAt, dedupeKey);
    if (!publishJobId) {
      throw new ServiceUnavailableException("Publish job creation failed");
    }

    await this.enqueueJob({
      workspaceId: params.workspaceId,
      contentId: params.contentId,
      publishJobId,
      runAt,
      dedupeKey,
      queueDelayMs
    });

    return {
      ok: true,
      publishJobId,
      dedupeKey,
      scheduledFor: runAt.toISOString()
    };
  }

  async enqueueSeriesNextItem(params: {
    seriesId: string;
    trigger?: "manual" | "publish_success";
    runAt?: Date;
  }) {
    const series = await this.fetchSeriesContext(params.seriesId);
    if (!series.is_active) {
      return { ok: false, reason: "series_inactive" } as const;
    }
    if (params.trigger === "publish_success" && !series.enqueue_next_on_publish) {
      return { ok: false, reason: "enqueue_next_disabled" } as const;
    }

    const nextItem = await this.fetchNextSeriesItem(series.id);
    if (!nextItem) {
      return { ok: false, reason: "no_series_item" } as const;
    }

    const runAt = this.resolveSeriesRunAt(series.cadence, params.runAt);
    const dedupeKey = seriesDedupeKey(series.id, nextItem.id, runAt);
    try {
      const scheduled = await this.schedule({
        workspaceId: series.workspace_id,
        accountId: series.account_id,
        contentId: nextItem.content_id,
        runAt,
        dedupeKey,
        confirmHumanReview: true
      });
      await this.markSeriesItemQueued(nextItem.id);

      return {
        deduped: false,
        seriesId: series.id,
        seriesItemId: nextItem.id,
        contentId: nextItem.content_id,
        ...scheduled
      } as const;
    } catch (error) {
      if (error instanceof ConflictException) {
        return {
          ok: true,
          deduped: true,
          seriesId: series.id,
          seriesItemId: nextItem.id,
          contentId: nextItem.content_id,
          dedupeKey,
          scheduledFor: runAt.toISOString()
        } as const;
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
    const runAt = new Date();
    const dedupeKey = params.dedupeKey ?? publishNowDedupeKey(params.contentId, runAt);
    return this.schedule({ ...params, runAt, dedupeKey });
  }

  private async loadContentForManualFallback(workspaceId: string, contentId: string) {
    const result = await this.dbPool().query<{ current_text: string; topic: string | null }>(
      `
        SELECT current_text, topic
        FROM contents
        WHERE id = $1
          AND workspace_id = $2
        LIMIT 1;
      `,
      [contentId, workspaceId]
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException("Content not found");
    }

    return row;
  }

  private validateManualFallbackReason(rawReasonCode: string) {
    const reasonCode = normalizeReasonCode(rawReasonCode);
    if (!manualActionErrorCodes.has(reasonCode)) {
      throw new BadRequestException(
        "Manual fallback is supported only for POLICY_REJECTED, RATE_LIMIT, AUTH_FAILED."
      );
    }

    return reasonCode;
  }

  private async validateManualFallbackJob(params: {
    workspaceId: string;
    publishJobId: string;
    contentId: string;
    reasonCode: string;
  }) {
    const result = await this.dbPool().query<{
      content_id: string;
      state: string;
      last_error_code: string | null;
    }>(
      `
        SELECT content_id, state, last_error_code
        FROM publish_jobs
        WHERE id = $1
          AND workspace_id = $2
        LIMIT 1;
      `,
      [params.publishJobId, params.workspaceId]
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException("Publish job not found");
    }
    if (row.content_id !== params.contentId) {
      throw new BadRequestException("Publish job/content mismatch");
    }
    if (row.state !== "failed_permanent") {
      throw new BadRequestException("Manual fallback is available only for failed jobs");
    }
    if (row.last_error_code !== params.reasonCode) {
      throw new BadRequestException("Manual fallback reason mismatch");
    }
  }

  private async reserveManualReminder(params: {
    workspaceId: string;
    referenceId: string;
    reasonCode: string;
    reminderEmail: string;
  }) {
    const result = await this.dbPool().query<{ id: string }>(
      `
        INSERT INTO notification_log (
          workspace_id,
          notification_type,
          reference_id,
          channel,
          level,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
        ON CONFLICT (reference_id, channel, notification_type)
        DO NOTHING
        RETURNING id;
      `,
      [
        params.workspaceId,
        manualFallbackNotificationType,
        params.referenceId,
        manualFallbackEmailChannel,
        manualReminderLevel(params.reasonCode),
        JSON.stringify({ reasonCode: params.reasonCode, reminderEmail: params.reminderEmail })
      ]
    );

    return Boolean(result.rows[0]);
  }

  private async releaseManualReminderReservation(workspaceId: string, referenceId: string) {
    await this.dbPool().query(
      `
        DELETE FROM notification_log
        WHERE workspace_id = $1
          AND reference_id = $2
          AND channel = $3
          AND notification_type = $4;
      `,
      [workspaceId, referenceId, manualFallbackEmailChannel, manualFallbackNotificationType]
    );
  }

  private async sendManualReminder(params: {
    workspaceId: string;
    referenceId: string;
    reasonCode: string;
    topic: string | null;
    plainText: string;
    composeUrl: string | null;
    reminderEmail: string;
  }) {
    const reserved = await this.reserveManualReminder(params);
    if (!reserved) {
      return false;
    }

    try {
      await sendEmail({
        to: params.reminderEmail,
        subject: `Manual publish reminder: ${params.topic?.trim() || "Untitled post"}`,
        text: buildManualReminderText({
          reasonCode: params.reasonCode,
          plainText: params.plainText,
          composeUrl: params.composeUrl
        }),
        logContext: SchedulingService.name
      });
      return true;
    } catch (error) {
      await this.releaseManualReminderReservation(params.workspaceId, params.referenceId);
      if (
        error instanceof Error &&
        error.message.toLowerCase().includes("delivery is not configured")
      ) {
        this.logger.warn("manual publish reminder skipped: email delivery is not configured");
        return false;
      }
      throw error;
    }
  }

  async createManualPublishFallback(params: CreateManualPublishFallbackParams) {
    const reasonCode = this.validateManualFallbackReason(params.reasonCode);
    if (params.publishJobId) {
      await this.validateManualFallbackJob({
        workspaceId: params.workspaceId,
        publishJobId: params.publishJobId,
        contentId: params.contentId,
        reasonCode
      });
    }

    const content = await this.loadContentForManualFallback(params.workspaceId, params.contentId);
    const plainText = content.current_text ?? "";
    const composeUrl = createManualComposeUrl(plainText);
    const referenceId = params.publishJobId ?? params.contentId;
    const reminderSent = params.reminderEmail
      ? await this.sendManualReminder({
          workspaceId: params.workspaceId,
          referenceId,
          reasonCode,
          topic: content.topic,
          plainText,
          composeUrl,
          reminderEmail: params.reminderEmail
        })
      : false;

    await this.dbPool().query(
      `
        INSERT INTO audit_logs (workspace_id, action, entity_type, entity_id, result, metadata)
        VALUES ($1, 'scheduling.manual_fallback', $2, $3, 'success', $4::jsonb);
      `,
      [
        params.workspaceId,
        params.publishJobId ? "publish_job" : "content",
        referenceId,
        JSON.stringify({
          contentId: params.contentId,
          reasonCode,
          reminderEmail: params.reminderEmail ?? null,
          reminderSent
        })
      ]
    );

    return {
      composeUrl,
      plainText,
      reason: reasonCode,
      reminderSent,
      reminderSkipped: Boolean(params.reminderEmail) && !reminderSent,
      reasonLabel: manualFallbackReasonLabel(reasonCode)
    };
  }

  async listJobs(workspaceId: string) {
    const result = await this.dbPool().query<{
      id: string;
      content_id: string;
      content_title: string | null;
      content_text: string;
      state: string;
      run_at: string;
      next_run_at: string;
      attempt_count: number;
      last_error_code: string | null;
      updated_at: string;
    }>(
      `
        SELECT
          pj.id,
          pj.content_id,
          c.topic AS content_title,
          c.current_text AS content_text,
          pj.state,
          pj.run_at,
          pj.next_run_at,
          pj.attempt_count,
          pj.last_error_code,
          pj.updated_at
        FROM publish_jobs pj
        JOIN contents c ON c.id = pj.content_id
        WHERE pj.workspace_id = $1
        ORDER BY pj.created_at DESC
        LIMIT 100;
      `,
      [workspaceId]
    );

    return result.rows.map((row) => {
      const manualText = row.content_text ?? "";
      const manualComposeUrl = createManualComposeUrl(manualText);
      const requiresManualAction =
        row.state === "failed_permanent" &&
        Boolean(row.last_error_code && manualActionErrorCodes.has(row.last_error_code));

      return {
        ...row,
        requires_manual_action: requiresManualAction,
        manual_action_compose_url: manualComposeUrl
      };
    });
  }
}
