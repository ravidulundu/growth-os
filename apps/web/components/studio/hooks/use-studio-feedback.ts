import { useCallback, useRef, useState } from "react";
import type { ActivityEntry, Notice } from "../types";
import { toMessage } from "../utils";
import type { NotifyStudioError } from "./types";

function resolveLocale() {
  if (typeof window === "undefined") {
    return "en-US";
  }

  return window.navigator.languages?.[0] ?? window.navigator.language ?? "en-US";
}

function timestampForActivity(locale: string) {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date());
}

export function useStudioFeedback() {
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const activitySequenceRef = useRef(0);

  const appendActivity = useCallback((line: string) => {
    const stamp = timestampForActivity(resolveLocale());
    activitySequenceRef.current += 1;
    const id = `${Date.now()}-${activitySequenceRef.current}`;
    setActivity((previous) => [{ id, text: `${stamp} - ${line}` }, ...previous].slice(0, 12));
  }, []);

  const runAction = useCallback(
    async <T>(label: string, action: () => Promise<T>): Promise<T | null> => {
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
    },
    [appendActivity]
  );

  const notifyError = useCallback<NotifyStudioError>((message) => {
    setNotice({ tone: "error", text: message });
  }, []);

  return { activeAction, notice, activity, runAction, notifyError };
}
