export function calculateBackoffDelayMs(input: {
  attempt: number;
  baseMs?: number;
  capMs?: number;
  jitterMs?: number;
}) {
  const baseMs = input.baseMs ?? 5_000;
  const capMs = input.capMs ?? 15 * 60_000;
  const jitterMs = input.jitterMs ?? 1_000;
  const boundedAttempt = Math.max(1, input.attempt);
  const exponential = Math.min(baseMs * 2 ** (boundedAttempt - 1), capMs);
  const jitter = Math.floor(Math.random() * (jitterMs + 1));
  return exponential + jitter;
}
