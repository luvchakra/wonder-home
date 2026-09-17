import { redact } from "../security/redact";

/**
 * Structured logging (story 00-009).
 *
 * One line of JSON per event, every line carrying the request id that the API
 * returned to the caller, so a support question quotes one id and the search
 * finds the exact request without anyone pasting household content anywhere.
 *
 * Everything is redacted on the way out. A call site cannot opt out — it can
 * only name fields that are already safe via `allow`.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type LogFields = Record<string, unknown> & {
  requestId?: string;
  /** Field names that are known-safe and should survive redaction. */
  allow?: readonly string[];
};

export type LogRecord = {
  level: LogLevel;
  message: string;
  timestamp: string;
  [key: string]: unknown;
};

export type LogSink = (record: LogRecord) => void;

const defaultSink: LogSink = (record) => {
  const line = JSON.stringify(record);
  if (record.level === "error" || record.level === "warn") console.error(line);
  else console.log(line);
};

let sink: LogSink = defaultSink;
let minLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) ?? "info";

/** Swappable for tests and for a hosted log drain. */
export function setLogSink(next: LogSink | null): void {
  sink = next ?? defaultSink;
}

export function setLogLevel(level: LogLevel): void {
  minLevel = level;
}

export function buildRecord(level: LogLevel, message: string, fields: LogFields = {}): LogRecord {
  const { allow, ...rest } = fields;
  const safe = redact(rest, { allow: allow ?? [] }) as Record<string, unknown>;
  return { level, message, timestamp: new Date().toISOString(), ...safe };
}

function emit(level: LogLevel, message: string, fields?: LogFields): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
  sink(buildRecord(level, message, fields));
}

export const log = {
  debug: (message: string, fields?: LogFields) => emit("debug", message, fields),
  info: (message: string, fields?: LogFields) => emit("info", message, fields),
  warn: (message: string, fields?: LogFields) => emit("warn", message, fields),
  error: (message: string, fields?: LogFields) => emit("error", message, fields),
};
