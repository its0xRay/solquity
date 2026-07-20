type LogLevel = "info" | "warn" | "error";

const REDACTED_KEYS = /key|token|authorization|secret|password/i;

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, REDACTED_KEYS.test(key) ? "[redacted]" : sanitize(item)]));
  }
  return value;
}

export function log(level: LogLevel, event: string, context: Record<string, unknown> = {}) {
  const safeContext = sanitize(context) as Record<string, unknown>;
  const entry = JSON.stringify({ level, event, at: new Date().toISOString(), ...safeContext });
  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.info(entry);
}
