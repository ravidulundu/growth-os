"use client";

import {
  BarChart3,
  CalendarClock,
  Clock3,
  Library,
  Link2,
  Rocket,
  Settings2,
  WandSparkles
} from "lucide-react";
import { useMemo } from "react";
import { API_BASE_URL } from "../../lib/api";
import { useStudioAccounts } from "./hooks/use-studio-accounts";
import { useStudioAnalytics } from "./hooks/use-studio-analytics";
import { useStudioAuth } from "./hooks/use-studio-auth";
import { useStudioDrafts } from "./hooks/use-studio-drafts";
import { useStudioFeedback } from "./hooks/use-studio-feedback";
import { useStudioHealth } from "./hooks/use-studio-health";
import { useStudioIdentifiers } from "./hooks/use-studio-identifiers";
import { useStudioOnboarding } from "./hooks/use-studio-onboarding";
import { useStudioPublish } from "./hooks/use-studio-publish";
import { useStudioSeries } from "./hooks/use-studio-series";
import { useStudioSession } from "./hooks/use-studio-session";
import { useUnsavedDraftWarning } from "./hooks/use-unsaved-draft-warning";
import type { StudioSection, StudioStat } from "./types";

const STUDIO_SECTIONS: StudioSection[] = [
  { id: "dashboard", label: "Dashboard", icon: Rocket },
  { id: "generator", label: "Generator", icon: WandSparkles },
  { id: "library", label: "Library", icon: Library },
  { id: "scheduler", label: "Scheduler", icon: CalendarClock },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings2 }
];

function useStudioStats(params: {
  selectedAccountId: string;
  contentId: string;
  contentMode: string;
  jobsLength: number;
  snapshotsLength: number;
}) {
  return useMemo<StudioStat[]>(
    () => [
      {
        label: "Account",
        value: params.selectedAccountId ? "Connected" : "Pending",
        icon: Link2,
        tone: params.selectedAccountId ? "success" : "warning"
      },
      {
        label: "Draft",
        value: params.contentId ? `Ready (${params.contentMode})` : "Not created",
        icon: WandSparkles,
        tone: params.contentId ? "success" : "warning"
      },
      {
        label: "Queue",
        value: `${params.jobsLength} jobs`,
        icon: Clock3,
        tone: params.jobsLength > 0 ? "neutral" : "warning"
      },
      {
        label: "Analytics",
        value: params.snapshotsLength ? `${params.snapshotsLength} snapshots` : "No data",
        icon: BarChart3,
        tone: params.snapshotsLength ? "success" : "warning"
      }
    ],
    [
      params.contentId,
      params.contentMode,
      params.jobsLength,
      params.selectedAccountId,
      params.snapshotsLength
    ]
  );
}

function useStudioCore() {
  const identifiers = useStudioIdentifiers();
  const { runAction, notifyError, ...feedbackState } = useStudioFeedback();
  const session = useStudioSession();
  const { health, handleHealthCheck } = useStudioHealth(runAction);

  return {
    identifiers,
    runAction,
    notifyError,
    feedbackState,
    session,
    health,
    handleHealthCheck
  };
}

type StudioCore = ReturnType<typeof useStudioCore>;

function useStudioModules(core: StudioCore) {
  const auth = useStudioAuth({
    workspaceId: core.identifiers.workspaceId,
    setSelectedAccountId: core.identifiers.setSelectedAccountId,
    runAction: core.runAction,
    notifyError: core.notifyError
  });
  const accounts = useStudioAccounts({
    workspaceId: core.identifiers.workspaceId,
    selectedAccountId: core.identifiers.selectedAccountId,
    setSelectedAccountId: core.identifiers.setSelectedAccountId,
    runAction: core.runAction,
    notifyError: core.notifyError
  });
  const drafts = useStudioDrafts({
    workspaceId: core.identifiers.workspaceId,
    selectedAccountId: core.identifiers.selectedAccountId,
    contentId: core.identifiers.contentId,
    setContentId: core.identifiers.setContentId,
    runAction: core.runAction,
    notifyError: core.notifyError
  });
  const series = useStudioSeries({
    workspaceId: core.identifiers.workspaceId,
    selectedAccountId: core.identifiers.selectedAccountId,
    contentId: core.identifiers.contentId,
    templateName: drafts.templateName,
    runAction: core.runAction,
    notifyError: core.notifyError,
    setContentId: core.identifiers.setContentId,
    setDraftText: drafts.setDraftText,
    setSavedText: drafts.setSavedText
  });
  const publish = useStudioPublish({
    workspaceId: core.identifiers.workspaceId,
    selectedAccountId: core.identifiers.selectedAccountId,
    contentId: core.identifiers.contentId,
    runAction: core.runAction,
    notifyError: core.notifyError
  });
  const analytics = useStudioAnalytics({
    workspaceId: core.identifiers.workspaceId,
    contentId: core.identifiers.contentId,
    runAction: core.runAction,
    notifyError: core.notifyError
  });
  const onboarding = useStudioOnboarding({
    userId: core.session.userId,
    workspaceId: core.identifiers.workspaceId,
    selectedAccountId: core.identifiers.selectedAccountId,
    contentId: core.identifiers.contentId,
    hasTimelineIngested: Boolean((drafts.timelineIngestResult?.insertedCount ?? 0) > 0),
    hasStyleExtracted: Boolean(drafts.styleExtractResult || drafts.styleProfileResult),
    setActiveView: core.identifiers.setActiveView,
    setWorkspaceId: core.identifiers.setWorkspaceId,
    setSelectedAccountId: core.identifiers.setSelectedAccountId,
    setContentId: core.identifiers.setContentId,
    setTopic: drafts.setTopic,
    setDraftText: drafts.setDraftText,
    setSavedText: drafts.setSavedText
  });

  return { auth, accounts, drafts, series, publish, analytics, onboarding };
}

export function useStudioController() {
  const core = useStudioCore();
  const modules = useStudioModules(core);

  useUnsavedDraftWarning(modules.drafts.hasUnsavedDraft);
  const stats = useStudioStats({
    selectedAccountId: core.identifiers.selectedAccountId,
    contentId: core.identifiers.contentId,
    contentMode: modules.drafts.contentMode,
    jobsLength: modules.publish.jobs.length,
    snapshotsLength: modules.analytics.analytics?.snapshots.length ?? 0
  });

  return {
    apiBaseUrl: API_BASE_URL,
    ...core.identifiers,
    ...modules.auth,
    runAction: core.runAction,
    notifyError: core.notifyError,
    ...core.feedbackState,
    ...core.session,
    ...modules.accounts,
    ...modules.drafts,
    ...modules.series,
    health: core.health,
    ...modules.publish,
    ...modules.analytics,
    ...modules.onboarding,
    stats,
    sections: STUDIO_SECTIONS,
    handleHealthCheck: core.handleHealthCheck
  };
}

export type StudioController = ReturnType<typeof useStudioController>;
