import { useEffect, useState } from "react";
import { fetchAuthSession } from "../../../lib/api";

export function useStudioSession() {
  const [userId, setUserId] = useState("");

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

  return { userId };
}
