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

type LogParams = {
  level: LogLevel;
  scope: string;
  message: string;
  metadata?: LogMeta;
  error?: unknown;
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

function log({ level, scope, message, metadata, error }: LogParams) {
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
      log({ level: "info", scope, message, metadata });
    },
    warn(message: string, metadata?: LogMeta, error?: unknown) {
      log({ level: "warn", scope, message, metadata, error });
    },
    error(message: string, error?: unknown, metadata?: LogMeta) {
      log({ level: "error", scope, message, metadata, error });
    }
  };
}
