import { useEffect, useState } from "react";
import type { StudioView } from "../types";
import { isStudioView, readPersistedValue, STORAGE } from "../utils";

function persistStudioValue(key: string, value: string) {
  if (!value) {
    return;
  }

  window.localStorage.setItem(key, value);
}

function updateQueryParam(params: URLSearchParams, key: string, value: string) {
  if (value) {
    params.set(key, value);
    return;
  }

  params.delete(key);
}

export function useStudioIdentifiers() {
  const [activeView, setActiveView] = useState<StudioView>("dashboard");
  const [workspaceId, setWorkspaceId] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [contentId, setContentId] = useState("");

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

  useEffect(() => persistStudioValue(STORAGE.workspaceId, workspaceId), [workspaceId]);
  useEffect(() => persistStudioValue(STORAGE.accountId, selectedAccountId), [selectedAccountId]);
  useEffect(() => persistStudioValue(STORAGE.contentId, contentId), [contentId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    updateQueryParam(params, "workspace", workspaceId);
    updateQueryParam(params, "account", selectedAccountId);
    updateQueryParam(params, "content", contentId);
    params.set("view", activeView);

    const nextQuery = params.toString();
    const nextUrl = nextQuery
      ? `${window.location.pathname}?${nextQuery}`
      : window.location.pathname;
    window.history.replaceState(null, "", nextUrl);
  }, [workspaceId, selectedAccountId, contentId, activeView]);

  return {
    activeView,
    setActiveView,
    workspaceId,
    setWorkspaceId,
    selectedAccountId,
    setSelectedAccountId,
    contentId,
    setContentId
  };
}
