import { useState } from "react";
import {
  createSeries,
  listSeries,
  repurposeContent,
  type ContentSeries,
  type RepurposeResponse,
  type SeriesCadence
} from "../../../lib/api";
import { trackWebEvent } from "../../../lib/telemetry";
import type { ContentMode } from "../types";
import type { NotifyStudioError, RunStudioAction } from "./types";

type UseStudioSeriesParams = {
  workspaceId: string;
  selectedAccountId: string;
  contentId: string;
  templateName: string;
  runAction: RunStudioAction;
  notifyError: NotifyStudioError;
  setContentId: (contentId: string) => void;
  setDraftText: (value: string) => void;
  setSavedText: (value: string) => void;
};

function ensureSeriesScope(params: UseStudioSeriesParams) {
  if (!params.workspaceId || !params.selectedAccountId) {
    params.notifyError("Workspace and account are required.");
    return false;
  }
  return true;
}

function useSeriesState() {
  const [seriesName, setSeriesName] = useState("Evergreen Series");
  const [seriesCadence, setSeriesCadence] = useState<SeriesCadence>("weekly");
  const [seriesActive, setSeriesActive] = useState(false);
  const [seriesEvergreen, setSeriesEvergreen] = useState(false);
  const [seriesList, setSeriesList] = useState<ContentSeries[]>([]);
  const [repurposeTargetType, setRepurposeTargetType] = useState<ContentMode>("thread");
  const [repurposeResult, setRepurposeResult] = useState<RepurposeResponse | null>(null);

  return {
    seriesName,
    setSeriesName,
    seriesCadence,
    setSeriesCadence,
    seriesActive,
    setSeriesActive,
    seriesEvergreen,
    setSeriesEvergreen,
    seriesList,
    setSeriesList,
    repurposeTargetType,
    setRepurposeTargetType,
    repurposeResult,
    setRepurposeResult
  };
}

type SeriesState = ReturnType<typeof useSeriesState>;

function buildSeriesActions(params: UseStudioSeriesParams, state: SeriesState) {
  const resolveSeriesName = () => state.seriesName.trim() || "Evergreen Series";
  const resolveTemplateName = () => params.templateName.trim() || undefined;

  const handleLoadSeries = async () => {
    if (!ensureSeriesScope(params)) {
      return;
    }

    await params.runAction("Load Series", async () => {
      const result = await listSeries(params.workspaceId, params.selectedAccountId);
      state.setSeriesList(result);
      return result;
    });
  };

  const handleCreateSeriesFromCurrentContent = async () => {
    if (!ensureSeriesScope(params) || !params.contentId) {
      params.notifyError("Current content is required.");
      return;
    }

    const result = await params.runAction("Create Series", async () => {
      return createSeries({
        workspaceId: params.workspaceId,
        accountId: params.selectedAccountId,
        name: resolveSeriesName(),
        cadence: state.seriesCadence,
        isActive: state.seriesActive,
        enqueueNextOnPublish: state.seriesEvergreen,
        contentIds: [params.contentId]
      });
    });

    if (result) {
      await handleLoadSeries();
    }
  };

  const handleRepurposeCurrentContent = async () => {
    if (!params.workspaceId || !params.contentId) {
      params.notifyError("Workspace and source content are required.");
      return;
    }

    const result = await params.runAction("Repurpose Draft", async () => {
      return repurposeContent({
        workspaceId: params.workspaceId,
        sourceContentId: params.contentId,
        targetType: state.repurposeTargetType,
        accountId: params.selectedAccountId || undefined,
        templateName: resolveTemplateName()
      });
    });

    if (!result) {
      return;
    }

    state.setRepurposeResult(result);
    params.setContentId(result.contentId);
    params.setDraftText(result.text);
    params.setSavedText(result.text);
    trackWebEvent(
      "draft_generated",
      {
        source: "repurpose",
        sourceContentId: params.contentId,
        targetType: state.repurposeTargetType,
        repurposeRunId: result.repurposeRunId
      },
      { workspaceId: params.workspaceId, critical: true }
    );
  };

  return {
    handleLoadSeries,
    handleCreateSeriesFromCurrentContent,
    handleRepurposeCurrentContent
  };
}

export function useStudioSeries(params: UseStudioSeriesParams) {
  const state = useSeriesState();
  const actions = buildSeriesActions(params, state);

  return {
    seriesName: state.seriesName,
    setSeriesName: state.setSeriesName,
    seriesCadence: state.seriesCadence,
    setSeriesCadence: state.setSeriesCadence,
    seriesActive: state.seriesActive,
    setSeriesActive: state.setSeriesActive,
    seriesEvergreen: state.seriesEvergreen,
    setSeriesEvergreen: state.setSeriesEvergreen,
    seriesList: state.seriesList,
    repurposeTargetType: state.repurposeTargetType,
    setRepurposeTargetType: state.setRepurposeTargetType,
    repurposeResult: state.repurposeResult,
    ...actions
  };
}
