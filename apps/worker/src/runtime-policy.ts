export function resolveXClientMode(mode: string | undefined) {
  return (mode ?? "mock").trim().toLowerCase();
}

export function assertSupportedXClientMode(input: { nodeEnv?: string; mode?: string }) {
  const normalizedMode = resolveXClientMode(input.mode);
  const nodeEnv = input.nodeEnv?.trim().toLowerCase();

  if (nodeEnv === "production" && normalizedMode === "mock") {
    throw new Error("X_CLIENT_MODE=mock is not allowed in production worker.");
  }

  if (normalizedMode !== "mock" && normalizedMode !== "real") {
    throw new Error(`Unsupported worker X client mode: ${normalizedMode}`);
  }
}
