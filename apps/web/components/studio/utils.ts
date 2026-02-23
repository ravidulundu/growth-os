import type { StudioView } from "./types";

export const STORAGE = {
  workspaceId: "growth_os_workspace_id",
  accountId: "growth_os_account_id",
  contentId: "growth_os_content_id"
} as const;

export function readPersistedValue(key: string) {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(key) ?? "";
}

export function toMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Unexpected request error";
}

export function toPrettyJson(value: unknown) {
  if (value === null || value === undefined) {
    return "No data yet.";
  }

  return JSON.stringify(value, null, 2);
}

export function isStudioView(value: string | null): value is StudioView {
  return (
    value === "dashboard" ||
    value === "generator" ||
    value === "library" ||
    value === "scheduler" ||
    value === "analytics" ||
    value === "settings"
  );
}
