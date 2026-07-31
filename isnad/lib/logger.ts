type LogMetadata = Record<string, unknown>;

const REDACTED_KEYS = new Set([
  "authorization",
  "content",
  "initData",
  "message",
  "prompt",
  "telegramBotToken",
  "token",
]);

function sanitize(metadata: LogMetadata): LogMetadata {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      REDACTED_KEYS.has(key) ? "[redacted]" : value,
    ])
  );
}

function write(level: "info" | "warn" | "error", event: string, metadata: LogMetadata = {}) {
  const payload = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...sanitize(metadata),
  });

  if (level === "error") console.error(payload);
  else if (level === "warn") console.warn(payload);
  else console.info(payload);
}

export const logger = {
  info(event: string, metadata?: LogMetadata) {
    write("info", event, metadata);
  },
  warn(event: string, metadata?: LogMetadata) {
    write("warn", event, metadata);
  },
  error(event: string, metadata?: LogMetadata) {
    write("error", event, metadata);
  },
};
