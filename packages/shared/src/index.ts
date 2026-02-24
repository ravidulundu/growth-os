export const APP_NAME = "Growth OS";

export const DEFAULT_FIRST_HOUR_WINDOWS = [15, 60, 24] as const;

export { calculateBackoffDelayMs } from "./scheduling/backoff";
export { cosineSimilarity, exceedsSimilarityThreshold } from "./scheduling/similarity";
export { nextSchedulerState, type SchedulerState } from "./scheduling/state-machine";
export {
  evaluateFirstHourAlert,
  resolveFirstHourAlertThresholds,
  type FirstHourAlertEvaluation,
  type FirstHourAlertLevel,
  type FirstHourAlertSnapshot,
  type FirstHourAlertThresholds
} from "./analytics/first-hour-alert";
export { createLogger } from "./observability/logger";
export { decryptSecret, encryptSecret, resolveEncryptionKey } from "./security/token-vault";
