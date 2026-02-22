export type SchedulerState =
  | "queued"
  | "in_progress"
  | "retry_wait"
  | "completed"
  | "failed_permanent"
  | "cancelled";

type TransitionEvent = "start" | "retry" | "complete" | "fail_permanent" | "cancel";

const transitions: Record<SchedulerState, Partial<Record<TransitionEvent, SchedulerState>>> = {
  queued: {
    start: "in_progress",
    cancel: "cancelled"
  },
  in_progress: {
    retry: "retry_wait",
    complete: "completed",
    fail_permanent: "failed_permanent",
    cancel: "cancelled"
  },
  retry_wait: {
    start: "in_progress",
    cancel: "cancelled"
  },
  completed: {},
  failed_permanent: {},
  cancelled: {}
};

export function nextSchedulerState(
  current: SchedulerState,
  event: TransitionEvent
): SchedulerState {
  return transitions[current][event] ?? current;
}
