type LogLevel = "info" | "warn" | "error";

type LogMeta = Record<string, unknown>;

type SerializedError = {
  name: string;
  message: string;
  stack?: string;
};

type LogPayload = {
  timestamp: string;
  level: LogLevel;
  scope: string;
  message: string;
  metadata?: LogMeta;
  error?: SerializedError;
};

function serializeError(error: unknown): SerializedError | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }

  return {
    name: error.name,
    message: error.message,
    stack: error.stack
  };
}

function writePayload(payload: LogPayload) {
  const line = `${JSON.stringify(payload)}\n`;
  if (payload.level === "error" || payload.level === "warn") {
    process.stderr.write(line);
    return;
  }
  process.stdout.write(line);
}

function log(level: LogLevel, scope: string, message: string, metadata?: LogMeta, error?: unknown) {
  writePayload({
    timestamp: new Date().toISOString(),
    level,
    scope,
    message,
    metadata,
    error: serializeError(error)
  });
}

export function createLogger(scope: string) {
  return {
    info(message: string, metadata?: LogMeta) {
      log("info", scope, message, metadata);
    },
    warn(message: string, metadata?: LogMeta, error?: unknown) {
      log("warn", scope, message, metadata, error);
    },
    error(message: string, error?: unknown, metadata?: LogMeta) {
      log("error", scope, message, metadata, error);
    }
  };
}
