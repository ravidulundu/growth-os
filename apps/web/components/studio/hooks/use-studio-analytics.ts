import { useState } from "react";
import {
  addCompetitorAccount,
  createBillingCheckoutSession,
  createBillingPortalSession,
  getCompetitorOverview,
  getAnalyticsByContent,
  getAnalyticsKpi,
  getBillingMetering,
  getFirstHourAlert,
  type AddCompetitorResponse,
  type AnalyticsKpiRange,
  type AnalyticsKpiSnapshotResponse,
  type AnalyticsResponse,
  type BillingCheckoutPlanKey,
  type BillingMeteringResponse,
  type CompetitorOverviewResponse,
  type FirstHourAlertResponse
} from "../../../lib/api";
import { trackWebEvent } from "../../../lib/telemetry";
import type { NotifyStudioError, RunStudioAction } from "./types";

type UseStudioAnalyticsParams = {
  workspaceId: string;
  contentId: string;
  runAction: RunStudioAction;
  notifyError: NotifyStudioError;
};

type BillingActionsState = {
  metering: BillingMeteringResponse | null;
  checkoutPlanInFlight: BillingCheckoutPlanKey | null;
  portalSessionPending: boolean;
  handleLoadMetering: () => Promise<void>;
  handleCreateCheckoutSession: (planKey: BillingCheckoutPlanKey) => Promise<void>;
  handleCreatePortalSession: () => Promise<void>;
};

type CompetitorActionsState = {
  competitorOverview: CompetitorOverviewResponse | null;
  lastCompetitorAdd: AddCompetitorResponse | null;
  handleAddCompetitor: (handle: string, limit?: number) => Promise<void>;
  handleLoadCompetitorOverview: () => Promise<void>;
};

function requireWorkspaceId(params: UseStudioAnalyticsParams) {
  if (!params.workspaceId) {
    params.notifyError("Workspace ID is required.");
    return null;
  }
  return params.workspaceId;
}

function useStudioBillingActions(params: UseStudioAnalyticsParams): BillingActionsState {
  const [metering, setMetering] = useState<BillingMeteringResponse | null>(null);
  const [checkoutPlanInFlight, setCheckoutPlanInFlight] = useState<BillingCheckoutPlanKey | null>(
    null
  );
  const [portalSessionPending, setPortalSessionPending] = useState(false);

  const handleLoadMetering = async () => {
    const workspaceId = requireWorkspaceId(params);
    if (!workspaceId) {
      return;
    }

    await params.runAction("Load Metering", async () => {
      const result = await getBillingMetering(workspaceId);
      setMetering(result);
      return result;
    });
  };

  const handleCreateCheckoutSession = async (planKey: BillingCheckoutPlanKey) => {
    const workspaceId = requireWorkspaceId(params);
    if (!workspaceId) {
      return;
    }

    setCheckoutPlanInFlight(planKey);
    try {
      const result = await params.runAction("Create Checkout Session", async () => {
        return createBillingCheckoutSession({ workspaceId, planKey });
      });
      if (result?.url) {
        window.location.assign(result.url);
        return;
      }
      if (result) {
        params.notifyError("Checkout URL is missing.");
      }
    } finally {
      setCheckoutPlanInFlight(null);
    }
  };

  const handleCreatePortalSession = async () => {
    const workspaceId = requireWorkspaceId(params);
    if (!workspaceId) {
      return;
    }

    setPortalSessionPending(true);
    try {
      const result = await params.runAction("Create Portal Session", async () => {
        return createBillingPortalSession(workspaceId);
      });
      if (result?.url) {
        window.location.assign(result.url);
        return;
      }
      if (result) {
        params.notifyError("Billing portal URL is missing.");
      }
    } finally {
      setPortalSessionPending(false);
    }
  };

  return {
    metering,
    checkoutPlanInFlight,
    portalSessionPending,
    handleLoadMetering,
    handleCreateCheckoutSession,
    handleCreatePortalSession
  };
}

function shouldEmitFirstHourAlertEvent(level: FirstHourAlertResponse["level"]) {
  return level === "watch" || level === "critical";
}

function useStudioCompetitorActions(params: UseStudioAnalyticsParams): CompetitorActionsState {
  const [competitorOverview, setCompetitorOverview] = useState<CompetitorOverviewResponse | null>(
    null
  );
  const [lastCompetitorAdd, setLastCompetitorAdd] = useState<AddCompetitorResponse | null>(null);

  const handleLoadCompetitorOverview = async () => {
    const workspaceId = requireWorkspaceId(params);
    if (!workspaceId) {
      return;
    }

    await params.runAction("Load Competitor Overview", async () => {
      const result = await getCompetitorOverview(workspaceId);
      setCompetitorOverview(result);
      return result;
    });
  };

  const handleAddCompetitor = async (handle: string, limit = 12) => {
    const workspaceId = requireWorkspaceId(params);
    if (!workspaceId) {
      return;
    }
    const normalized = handle.trim();
    if (!normalized) {
      params.notifyError("Competitor handle is required.");
      return;
    }

    const result = await params.runAction("Add Competitor", async () => {
      return addCompetitorAccount({
        workspaceId,
        handle: normalized,
        platform: "x",
        limit
      });
    });
    if (!result) {
      return;
    }

    setLastCompetitorAdd(result);
    await handleLoadCompetitorOverview();
  };

  return {
    competitorOverview,
    lastCompetitorAdd,
    handleAddCompetitor,
    handleLoadCompetitorOverview
  };
}

export function useStudioAnalytics(params: UseStudioAnalyticsParams) {
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [firstHourAlert, setFirstHourAlert] = useState<FirstHourAlertResponse | null>(null);
  const [kpiSnapshot, setKpiSnapshot] = useState<AnalyticsKpiSnapshotResponse | null>(null);
  const billingActions = useStudioBillingActions(params);
  const competitorActions = useStudioCompetitorActions(params);

  const handleLoadAnalytics = async () => {
    if (!params.workspaceId || !params.contentId) {
      params.notifyError("Workspace and content are required.");
      return;
    }

    const result = await params.runAction("Load Analytics", async () => {
      const result = await getAnalyticsByContent(params.workspaceId, params.contentId);
      setAnalytics(result);
      return result;
    });

    if (result?.snapshots.length) {
      trackWebEvent(
        "published",
        {
          contentId: params.contentId,
          publishedPostId: result.publishedPostId,
          snapshotCount: result.snapshots.length
        },
        { workspaceId: params.workspaceId, sampleRate: 0.1 }
      );
    }
  };

  const handleLoadFirstHourAlert = async () => {
    if (!params.workspaceId || !params.contentId) {
      params.notifyError("Workspace and content are required.");
      return;
    }

    const result = await params.runAction("Load First-Hour Alert", async () => {
      const result = await getFirstHourAlert(params.workspaceId, params.contentId);
      setFirstHourAlert(result);
      return result;
    });

    if (result && shouldEmitFirstHourAlertEvent(result.level)) {
      trackWebEvent(
        "first_hour_alert_triggered",
        {
          contentId: params.contentId,
          level: result.level,
          reasonCount: result.reasons.length
        },
        { workspaceId: params.workspaceId, critical: true }
      );
    }
  };

  const handleLoadKpi = async (range: AnalyticsKpiRange = "7d") => {
    if (!params.workspaceId) {
      params.notifyError("Workspace ID is required.");
      return;
    }

    await params.runAction("Load KPI Snapshot", async () => {
      const result = await getAnalyticsKpi(params.workspaceId, range);
      setKpiSnapshot(result);
      return result;
    });
  };

  return {
    analytics,
    firstHourAlert,
    kpiSnapshot,
    ...billingActions,
    ...competitorActions,
    handleLoadAnalytics,
    handleLoadFirstHourAlert,
    handleLoadKpi
  };
}
