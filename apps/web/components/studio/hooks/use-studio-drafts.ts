import { useState } from "react";
import {
  createDraft,
  createVersion,
  extractStyle,
  getStyle,
  ingestTimeline,
  listVersions,
  type CreateDraftResponse,
  type IngestTimelineResponse,
  type StyleExtractResponse,
  type StyleGetResponse,
  type VersionRow
} from "../../../lib/api";
import { trackWebEvent } from "../../../lib/telemetry";
import type { ContentMode } from "../types";
import type { NotifyStudioError, RunStudioAction } from "./types";

type UseStudioDraftsParams = {
  workspaceId: string;
  selectedAccountId: string;
  contentId: string;
  setContentId: (contentId: string) => void;
  runAction: RunStudioAction;
  notifyError: NotifyStudioError;
};

type DraftState = ReturnType<typeof useStudioDraftState>;

type StyleActionParams = {
  workspaceId: string;
  selectedAccountId: string;
  timelineLimit: string;
  sourceLimit: string;
  runAction: RunStudioAction;
  notifyError: NotifyStudioError;
};

type VersionActionParams = {
  workspaceId: string;
  selectedAccountId: string;
  contentId: string;
  setContentId: (contentId: string) => void;
  draftState: DraftState;
  runAction: RunStudioAction;
  notifyError: NotifyStudioError;
};

function parseBoundedLimit(rawValue: string, min: number, max: number) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return null;
  }

  return parsed;
}

function useStudioDraftState(contentId: string) {
  const [timelineLimit, setTimelineLimit] = useState("8");
  const [sourceLimit, setSourceLimit] = useState("20");
  const [topic, setTopic] = useState("First-hour growth experiments");
  const [promptInput, setPromptInput] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [contentMode, setContentMode] = useState<ContentMode>("tweet");
  const [draftText, setDraftText] = useState("");
  const [savedText, setSavedText] = useState("");
  const hasUnsavedDraft = Boolean(contentId && draftText !== savedText);

  return {
    timelineLimit,
    setTimelineLimit,
    sourceLimit,
    setSourceLimit,
    topic,
    setTopic,
    promptInput,
    setPromptInput,
    templateName,
    setTemplateName,
    contentMode,
    setContentMode,
    draftText,
    setDraftText,
    savedText,
    setSavedText,
    hasUnsavedDraft
  };
}

function useStudioStyleActions(params: StyleActionParams) {
  const [timelineIngestResult, setTimelineIngestResult] = useState<IngestTimelineResponse | null>(
    null
  );
  const [styleExtractResult, setStyleExtractResult] = useState<StyleExtractResponse | null>(null);
  const [styleProfileResult, setStyleProfileResult] = useState<StyleGetResponse | null>(null);

  const handleIngestTimeline = async () => {
    if (!params.workspaceId || !params.selectedAccountId) {
      params.notifyError("Workspace and account are required.");
      return;
    }

    const parsedLimit = parseBoundedLimit(params.timelineLimit, 1, 20);
    if (!parsedLimit) {
      params.notifyError("Timeline limit must be between 1 and 20.");
      return;
    }

    await params.runAction("Ingest Timeline", async () => {
      const result = await ingestTimeline(
        params.workspaceId,
        params.selectedAccountId,
        parsedLimit
      );
      setTimelineIngestResult(result);
      return result;
    });
  };

  const handleExtractStyle = async () => {
    if (!params.workspaceId || !params.selectedAccountId) {
      params.notifyError("Workspace and account are required.");
      return;
    }

    const parsedLimit = parseBoundedLimit(params.sourceLimit, 1, 100);
    if (!parsedLimit) {
      params.notifyError("Source limit must be between 1 and 100.");
      return;
    }

    const result = await params.runAction("Extract Style", async () => {
      const result = await extractStyle(params.workspaceId, params.selectedAccountId, parsedLimit);
      setStyleExtractResult(result);
      return result;
    });

    if (result) {
      trackWebEvent(
        "style_extracted",
        { accountId: params.selectedAccountId, sourcePostCount: result.sourcePostCount },
        { workspaceId: params.workspaceId, critical: true }
      );
    }
  };

  const handleGetStyle = async () => {
    if (!params.workspaceId || !params.selectedAccountId) {
      params.notifyError("Workspace and account are required.");
      return;
    }

    await params.runAction("Get Style", async () => {
      const result = await getStyle(params.workspaceId, params.selectedAccountId, false);
      setStyleProfileResult(result);
      return result;
    });
  };

  return {
    timelineIngestResult,
    styleExtractResult,
    styleProfileResult,
    handleIngestTimeline,
    handleExtractStyle,
    handleGetStyle
  };
}

function useStudioVersionActions(params: VersionActionParams) {
  const [draftResult, setDraftResult] = useState<CreateDraftResponse | null>(null);
  const [versions, setVersions] = useState<VersionRow[]>([]);

  const handleGenerateDraft = async () => {
    if (!params.workspaceId || !params.selectedAccountId || !params.draftState.topic.trim()) {
      params.notifyError("Workspace, account and topic are required.");
      return;
    }

    const result = await params.runAction("Create Draft", async () => {
      const result = await createDraft({
        workspaceId: params.workspaceId,
        accountId: params.selectedAccountId,
        topic: params.draftState.topic.trim(),
        type: params.draftState.contentMode,
        promptInput: params.draftState.promptInput.trim() || undefined,
        templateName: params.draftState.templateName.trim() || undefined
      });
      setDraftResult(result);
      params.setContentId(result.contentId);
      params.draftState.setDraftText(result.text);
      params.draftState.setSavedText(result.text);
      return result;
    });

    if (result) {
      trackWebEvent(
        "draft_generated",
        {
          accountId: params.selectedAccountId,
          contentId: result.contentId,
          contentType: params.draftState.contentMode
        },
        { workspaceId: params.workspaceId, critical: true }
      );
    }
  };

  const handleSaveVersion = async () => {
    if (!params.workspaceId || !params.contentId || !params.draftState.draftText.trim()) {
      params.notifyError("Workspace, content and draft text are required.");
      return;
    }

    await params.runAction("Create Version", async () => {
      const trimmedText = params.draftState.draftText.trim();
      const result = await createVersion(params.workspaceId, params.contentId, trimmedText);
      params.draftState.setSavedText(trimmedText);
      return result;
    });
  };

  const handleLoadVersions = async () => {
    if (!params.workspaceId || !params.contentId) {
      params.notifyError("Workspace and content are required.");
      return;
    }

    await params.runAction("Load Versions", async () => {
      const result = await listVersions(params.workspaceId, params.contentId);
      setVersions(result);
      return result;
    });
  };

  return { draftResult, versions, handleGenerateDraft, handleSaveVersion, handleLoadVersions };
}

export function useStudioDrafts(params: UseStudioDraftsParams) {
  const draftState = useStudioDraftState(params.contentId);
  const styleActions = useStudioStyleActions({
    workspaceId: params.workspaceId,
    selectedAccountId: params.selectedAccountId,
    timelineLimit: draftState.timelineLimit,
    sourceLimit: draftState.sourceLimit,
    runAction: params.runAction,
    notifyError: params.notifyError
  });
  const versionActions = useStudioVersionActions({
    workspaceId: params.workspaceId,
    selectedAccountId: params.selectedAccountId,
    contentId: params.contentId,
    setContentId: params.setContentId,
    draftState,
    runAction: params.runAction,
    notifyError: params.notifyError
  });

  return {
    timelineLimit: draftState.timelineLimit,
    setTimelineLimit: draftState.setTimelineLimit,
    sourceLimit: draftState.sourceLimit,
    setSourceLimit: draftState.setSourceLimit,
    topic: draftState.topic,
    setTopic: draftState.setTopic,
    promptInput: draftState.promptInput,
    setPromptInput: draftState.setPromptInput,
    templateName: draftState.templateName,
    setTemplateName: draftState.setTemplateName,
    contentMode: draftState.contentMode,
    setContentMode: draftState.setContentMode,
    draftText: draftState.draftText,
    setDraftText: draftState.setDraftText,
    savedText: draftState.savedText,
    setSavedText: draftState.setSavedText,
    hasUnsavedDraft: draftState.hasUnsavedDraft,
    ...styleActions,
    ...versionActions
  };
}
