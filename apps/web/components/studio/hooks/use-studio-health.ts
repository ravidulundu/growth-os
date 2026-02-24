import { useEffect, useState } from "react";
import { fetchHealth, type HealthResponse } from "../../../lib/api";
import type { RunStudioAction } from "./types";

export function useStudioHealth(runAction: RunStudioAction) {
  const [health, setHealth] = useState<HealthResponse | null>(null);

  const loadHealth = async () => {
    const result = await fetchHealth();
    setHealth(result);
    return result;
  };

  useEffect(() => {
    void runAction("Health Check", loadHealth);
  }, [runAction]);

  const handleHealthCheck = async () => {
    await runAction("Health Check", loadHealth);
  };

  return { health, handleHealthCheck };
}
