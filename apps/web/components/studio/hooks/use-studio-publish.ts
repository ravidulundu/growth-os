import { useState } from "react";
import {
  createManualPublishFallback,
  listJobs,
  publishNow,
  schedulePublish,
  type ManualPublishFallbackResponse,
  type JobRow,
  type PublishNowResponse
} from "../../../lib/api";
import { trackWebEvent } from "../../../lib/telemetry";
import type { NotifyStudioError, RunStudioAction } from "./types";

type UseStudioPublishParams = {
  workspaceId: string;
  selectedAccountId: string;
  contentId: string;
  runAction: RunStudioAction;
  notifyError: NotifyStudioError;
};

function hasPublishContext(params: UseStudioPublishParams) {
  return Boolean(params.workspaceId && params.selectedAccountId && params.contentId);
}

function trackSchedulingTelemetry(params: {
  mode: "publish_now" | "schedule";
  publishJobId: string;
  workspaceId: string;
  contentId: string;
}) {
  trackWebEvent(
    "scheduled",
    { mode: params.mode, publishJobId: params.publishJobId, contentId: params.contentId },
    { workspaceId: params.workspaceId, critical: true }
  );
}

function createPublishNowHandler(
  params: UseStudioPublishParams,
  setPublishResult: (result: PublishNowResponse) => void
) {
  return async () => {
    if (!hasPublishContext(params)) {
      params.notifyError("Workspace, account and content are required.");
      return;
    }

    const result = await params.runAction("Publish Now", async () => {
      const publishResult = await publishNow({
        workspaceId: params.workspaceId,
        accountId: params.selectedAccountId,
        contentId: params.contentId,
        confirmHumanReview: true
      });
      setPublishResult(publishResult);
      return publishResult;
    });
    if (result) {
      trackSchedulingTelemetry({
        mode: "publish_now",
        publishJobId: result.publishJobId,
        workspaceId: params.workspaceId,
        contentId: params.contentId
      });
    }
  };
}

function createLoadJobsHandler(params: UseStudioPublishParams, setJobs: (jobs: JobRow[]) => void) {
  return async () => {
    if (!params.workspaceId) {
      params.notifyError("Workspace ID is required.");
      return;
    }

    await params.runAction("Load Jobs", async () => {
      const jobs = await listJobs(params.workspaceId);
      setJobs(jobs);
      return jobs;
    });
  };
}

function createScheduleHandler(
  params: UseStudioPublishParams,
  setScheduleResult: (result: PublishNowResponse) => void
) {
  return async (runAt: string) => {
    if (!hasPublishContext(params)) {
      params.notifyError("Workspace, account and content are required.");
      return;
    }
    if (Number.isNaN(new Date(runAt).getTime())) {
      params.notifyError("Valid schedule time is required.");
      return;
    }

    const result = await params.runAction("Schedule", async () => {
      const scheduleResult = await schedulePublish({
        workspaceId: params.workspaceId,
        accountId: params.selectedAccountId,
        contentId: params.contentId,
        runAt,
        confirmHumanReview: true
      });
      setScheduleResult(scheduleResult);
      return scheduleResult;
    });
    if (result) {
      trackSchedulingTelemetry({
        mode: "schedule",
        publishJobId: result.publishJobId,
        workspaceId: params.workspaceId,
        contentId: params.contentId
      });
    }
  };
}

function createManualFallbackResolver(params: UseStudioPublishParams) {
  return async (job: JobRow): Promise<ManualPublishFallbackResponse> => {
    if (!params.workspaceId) {
      throw new Error("Workspace ID is required.");
    }
    if (!job.requires_manual_action) {
      throw new Error("Manual fallback is not available for this job.");
    }
    const reasonCode = job.last_error_code?.trim();
    if (!reasonCode) {
      throw new Error("Manual fallback reason is unavailable.");
    }

    return createManualPublishFallback({
      workspaceId: params.workspaceId,
      contentId: job.content_id,
      reasonCode,
      publishJobId: job.id
    });
  };
}

export function useStudioPublish(params: UseStudioPublishParams) {
  const [publishResult, setPublishResult] = useState<PublishNowResponse | null>(null);
  const [scheduleResult, setScheduleResult] = useState<PublishNowResponse | null>(null);
  const [jobs, setJobs] = useState<JobRow[]>([]);

  return {
    publishResult,
    scheduleResult,
    jobs,
    handlePublishNow: createPublishNowHandler(params, setPublishResult),
    handleSchedule: createScheduleHandler(params, setScheduleResult),
    handleLoadJobs: createLoadJobsHandler(params, setJobs),
    resolveManualFallback: createManualFallbackResolver(params)
  };
}
