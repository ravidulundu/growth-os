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
import { useEffect, useMemo, useRef, useState } from "react";
import {
  API_BASE_URL,
  type Account,
  type AnalyticsResponse,
  type CreateDraftResponse,
  type HealthResponse,
  type JobRow,
  type MagicLinkRequestResponse,
  type PublishNowResponse,
  type StartConnectResponse,
  type StyleExtractResponse,
  type StyleGetResponse,
  type VersionRow,
  completeXConnect,
  createDraft,
  createVersion,
  extractStyle,
  fetchHealth,
  fetchAuthSession,
  getAnalyticsByContent,
  getStyle,
  ingestTimeline,
  listJobs,
  listVersions,
  listWorkspaceAccounts,
  publishNow,
  requestMagicLink,
  startXConnect
} from "../../lib/api";
import type {
  ActivityEntry,
  ContentMode,
  Notice,
  StudioSection,
  StudioStat,
  StudioView
} from "./types";
import { isStudioView, readPersistedValue, STORAGE, toMessage } from "./utils";

const STUDIO_SECTIONS: StudioSection[] = [
  { id: "dashboard", label: "Dashboard", icon: Rocket },
  { id: "generator", label: "Generator", icon: WandSparkles },
  { id: "library", label: "Library", icon: Library },
  { id: "scheduler", label: "Scheduler", icon: CalendarClock },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings2 }
];

export function useStudioController() {
  const [activeView, setActiveView] = useState<StudioView>("dashboard");

  const [email, setEmail] = useState("founder@example.com");
  const [workspaceId, setWorkspaceId] = useState("");
  const [oauthCode, setOauthCode] = useState("mock-auth-code");
  const [timelineLimit, setTimelineLimit] = useState("8");
  const [sourceLimit, setSourceLimit] = useState("20");
  const [topic, setTopic] = useState("First-hour growth experiments");
  const [promptInput, setPromptInput] = useState("");
  const [contentMode, setContentMode] = useState<ContentMode>("tweet");

  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const activitySequenceRef = useRef(0);

  const [userId, setUserId] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [contentId, setContentId] = useState("");
  const [draftText, setDraftText] = useState("");
  const [savedText, setSavedText] = useState("");

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [magicRequestResult, setMagicRequestResult] = useState<MagicLinkRequestResponse | null>(
    null
  );
  const [connectStartResult, setConnectStartResult] = useState<StartConnectResponse | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [styleExtractResult, setStyleExtractResult] = useState<StyleExtractResponse | null>(null);
  const [styleProfileResult, setStyleProfileResult] = useState<StyleGetResponse | null>(null);
  const [draftResult, setDraftResult] = useState<CreateDraftResponse | null>(null);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [publishResult, setPublishResult] = useState<PublishNowResponse | null>(null);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);

  const hasUnsavedDraft = Boolean(contentId && draftText !== savedText);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queryWorkspace = params.get("workspace") ?? "";
    const queryAccount = params.get("account") ?? "";
    const queryContent = params.get("content") ?? "";
    const queryView = params.get("view");

    setWorkspaceId(queryWorkspace || readPersistedValue(STORAGE.workspaceId));
    setSelectedAccountId(queryAccount || readPersistedValue(STORAGE.accountId));
    setContentId(queryContent || readPersistedValue(STORAGE.contentId));

    if (isStudioView(queryView)) {
      setActiveView(queryView);
    }
  }, []);

  useEffect(() => {
    if (workspaceId) {
      window.localStorage.setItem(STORAGE.workspaceId, workspaceId);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (selectedAccountId) {
      window.localStorage.setItem(STORAGE.accountId, selectedAccountId);
    }
  }, [selectedAccountId]);

  useEffect(() => {
    if (contentId) {
      window.localStorage.setItem(STORAGE.contentId, contentId);
    }
  }, [contentId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (workspaceId) {
      params.set("workspace", workspaceId);
    } else {
      params.delete("workspace");
    }

    if (selectedAccountId) {
      params.set("account", selectedAccountId);
    } else {
      params.delete("account");
    }

    if (contentId) {
      params.set("content", contentId);
    } else {
      params.delete("content");
    }

    params.set("view", activeView);

    const nextQuery = params.toString();
    const nextUrl = nextQuery
      ? `${window.location.pathname}?${nextQuery}`
      : window.location.pathname;
    window.history.replaceState(null, "", nextUrl);
  }, [workspaceId, selectedAccountId, contentId, activeView]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedDraft) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedDraft]);

  const appendActivity = (line: string) => {
    const locale =
      typeof window !== "undefined"
        ? (window.navigator.languages?.[0] ?? window.navigator.language ?? "en-US")
        : "en-US";

    const stamp = new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).format(new Date());

    activitySequenceRef.current += 1;
    const id = `${Date.now()}-${activitySequenceRef.current}`;
    setActivity((previous) => [{ id, text: `${stamp} - ${line}` }, ...previous].slice(0, 12));
  };

  const runAction = async <T>(label: string, action: () => Promise<T>) => {
    setNotice(null);
    setActiveAction(label);

    try {
      const result = await action();
      setNotice({ tone: "success", text: `${label} completed.` });
      appendActivity(`${label} completed.`);
      return result;
    } catch (error) {
      const message = toMessage(error);
      setNotice({ tone: "error", text: `${label}: ${message}` });
      appendActivity(`${label} failed (${message}).`);
      return null;
    } finally {
      setActiveAction(null);
    }
  };

  useEffect(() => {
    void runAction("Health Check", async () => {
      const result = await fetchHealth();
      setHealth(result);
      return result;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadSession = async () => {
      try {
        const result = await fetchAuthSession();
        if (!cancelled) {
          setUserId(result.userId ?? "");
        }
      } catch {
        if (!cancelled) {
          setUserId("");
        }
      }
    };

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleHealthCheck = async () => {
    await runAction("Health Check", async () => {
      const result = await fetchHealth();
      setHealth(result);
      return result;
    });
  };

  const handleRequestMagicLink = async () => {
    await runAction("Request Magic Link", async () => {
      const origin = window.location.origin;
      const result = await requestMagicLink(email.trim(), {
        callbackURL: `${origin}/`,
        newUserCallbackURL: `${origin}/`,
        errorCallbackURL: `${origin}/login?error=magic_link`
      });
      setMagicRequestResult(result);
      return result;
    });
  };

  const handleStartConnect = async () => {
    if (!workspaceId) {
      setNotice({ tone: "error", text: "Workspace ID is required." });
      return;
    }

    await runAction("Start X Connect", async () => {
      const result = await startXConnect(workspaceId);
      setConnectStartResult(result);
      return result;
    });
  };

  const handleCompleteConnect = async () => {
    if (!workspaceId || !connectStartResult?.state || !oauthCode) {
      setNotice({ tone: "error", text: "Workspace, OAuth state and code are required." });
      return;
    }

    await runAction("Complete X Connect", async () => {
      const result = await completeXConnect(workspaceId, connectStartResult.state, oauthCode);
      setSelectedAccountId(result.accountId);
      return result;
    });
  };

  const handleLoadAccounts = async () => {
    if (!workspaceId) {
      setNotice({ tone: "error", text: "Workspace ID is required." });
      return;
    }

    await runAction("Load Accounts", async () => {
      const result = await listWorkspaceAccounts(workspaceId);
      setAccounts(result);
      if (result[0] && !selectedAccountId) {
        setSelectedAccountId(result[0].id);
      }
      return result;
    });
  };

  const handleIngestTimeline = async () => {
    if (!workspaceId || !selectedAccountId) {
      setNotice({ tone: "error", text: "Workspace and account are required." });
      return;
    }

    const parsedLimit = Number(timelineLimit);
    if (!Number.isFinite(parsedLimit) || parsedLimit < 1 || parsedLimit > 20) {
      setNotice({ tone: "error", text: "Timeline limit must be between 1 and 20." });
      return;
    }

    await runAction("Ingest Timeline", async () =>
      ingestTimeline(workspaceId, selectedAccountId, parsedLimit)
    );
  };

  const handleExtractStyle = async () => {
    if (!workspaceId || !selectedAccountId) {
      setNotice({ tone: "error", text: "Workspace and account are required." });
      return;
    }

    const parsedSourceLimit = Number(sourceLimit);
    if (!Number.isFinite(parsedSourceLimit) || parsedSourceLimit < 1 || parsedSourceLimit > 100) {
      setNotice({ tone: "error", text: "Source limit must be between 1 and 100." });
      return;
    }

    await runAction("Extract Style", async () => {
      const result = await extractStyle(workspaceId, selectedAccountId, parsedSourceLimit);
      setStyleExtractResult(result);
      return result;
    });
  };

  const handleGetStyle = async () => {
    if (!workspaceId || !selectedAccountId) {
      setNotice({ tone: "error", text: "Workspace and account are required." });
      return;
    }

    await runAction("Get Style", async () => {
      const result = await getStyle(workspaceId, selectedAccountId, false);
      setStyleProfileResult(result);
      return result;
    });
  };

  const handleGenerateDraft = async () => {
    if (!workspaceId || !selectedAccountId || !topic.trim()) {
      setNotice({ tone: "error", text: "Workspace, account and topic are required." });
      return;
    }

    await runAction("Create Draft", async () => {
      const result = await createDraft({
        workspaceId,
        accountId: selectedAccountId,
        topic: topic.trim(),
        type: contentMode,
        promptInput: promptInput.trim() || undefined
      });

      setDraftResult(result);
      setContentId(result.contentId);
      setDraftText(result.text);
      setSavedText(result.text);
      return result;
    });
  };

  const handleSaveVersion = async () => {
    if (!workspaceId || !contentId || !draftText.trim()) {
      setNotice({ tone: "error", text: "Workspace, content and draft text are required." });
      return;
    }

    await runAction("Create Version", async () => {
      const result = await createVersion(workspaceId, contentId, draftText.trim());
      setSavedText(draftText.trim());
      return result;
    });
  };

  const handleLoadVersions = async () => {
    if (!workspaceId || !contentId) {
      setNotice({ tone: "error", text: "Workspace and content are required." });
      return;
    }

    await runAction("Load Versions", async () => {
      const result = await listVersions(workspaceId, contentId);
      setVersions(result);
      return result;
    });
  };

  const handlePublishNow = async () => {
    if (!workspaceId || !selectedAccountId || !contentId) {
      setNotice({ tone: "error", text: "Workspace, account and content are required." });
      return;
    }

    await runAction("Publish Now", async () => {
      const result = await publishNow({
        workspaceId,
        accountId: selectedAccountId,
        contentId,
        confirmHumanReview: true
      });
      setPublishResult(result);
      return result;
    });
  };

  const handleLoadJobs = async () => {
    if (!workspaceId) {
      setNotice({ tone: "error", text: "Workspace ID is required." });
      return;
    }

    await runAction("Load Jobs", async () => {
      const result = await listJobs(workspaceId);
      setJobs(result);
      return result;
    });
  };

  const handleLoadAnalytics = async () => {
    if (!workspaceId || !contentId) {
      setNotice({ tone: "error", text: "Workspace and content are required." });
      return;
    }

    await runAction("Load Analytics", async () => {
      const result = await getAnalyticsByContent(workspaceId, contentId);
      setAnalytics(result);
      return result;
    });
  };

  const stats = useMemo<StudioStat[]>(
    () => [
      {
        label: "Account",
        value: selectedAccountId ? "Connected" : "Pending",
        icon: Link2,
        tone: selectedAccountId ? "success" : "warning"
      },
      {
        label: "Draft",
        value: contentId ? `Ready (${contentMode})` : "Not created",
        icon: WandSparkles,
        tone: contentId ? "success" : "warning"
      },
      {
        label: "Queue",
        value: `${jobs.length} jobs`,
        icon: Clock3,
        tone: jobs.length > 0 ? "neutral" : "warning"
      },
      {
        label: "Analytics",
        value: analytics?.snapshots.length ? `${analytics.snapshots.length} snapshots` : "No data",
        icon: BarChart3,
        tone: analytics?.snapshots.length ? "success" : "warning"
      }
    ],
    [analytics?.snapshots.length, contentId, contentMode, jobs.length, selectedAccountId]
  );

  return {
    apiBaseUrl: API_BASE_URL,
    activeView,
    setActiveView,

    email,
    setEmail,
    workspaceId,
    setWorkspaceId,
    oauthCode,
    setOauthCode,
    timelineLimit,
    setTimelineLimit,
    sourceLimit,
    setSourceLimit,
    topic,
    setTopic,
    promptInput,
    setPromptInput,
    contentMode,
    setContentMode,

    activeAction,
    notice,
    activity,

    userId,
    selectedAccountId,
    setSelectedAccountId,
    contentId,
    setContentId,
    draftText,
    setDraftText,
    savedText,

    health,
    magicRequestResult,
    connectStartResult,
    accounts,
    styleExtractResult,
    styleProfileResult,
    draftResult,
    versions,
    publishResult,
    jobs,
    analytics,

    hasUnsavedDraft,
    stats,
    sections: STUDIO_SECTIONS,

    handleHealthCheck,
    handleRequestMagicLink,
    handleStartConnect,
    handleCompleteConnect,
    handleLoadAccounts,
    handleIngestTimeline,
    handleExtractStyle,
    handleGetStyle,
    handleGenerateDraft,
    handleSaveVersion,
    handleLoadVersions,
    handlePublishNow,
    handleLoadJobs,
    handleLoadAnalytics
  };
}

export type StudioController = ReturnType<typeof useStudioController>;
