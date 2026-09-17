import { afterEach, describe, expect, it, vi } from "vitest";

import { setLogSink, type LogRecord } from "./logger";
import { reportError, setErrorReporter } from "./error-reporter";

afterEach(() => {
  setErrorReporter(null);
  setLogSink(null);
});

describe("error reporting", () => {
  it("still logs when no monitoring provider is configured", () => {
    const records: LogRecord[] = [];
    setLogSink((record) => records.push(record));

    reportError({ message: "Unhandled API failure", requestId: "req-3" });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ level: "error", requestId: "req-3" });
  });

  it("hands a configured adapter a redacted report", () => {
    setLogSink(() => {});
    const adapter = vi.fn();
    setErrorReporter(adapter);

    reportError({
      message: "Unhandled API failure",
      requestId: "req-4",
      context: { path: "/api/v1/bills", authorization: "Bearer secret-token" },
      cause: new Error("boom"),
    });

    expect(adapter).toHaveBeenCalledTimes(1);
    const report = adapter.mock.calls[0]?.[0];
    expect(report.context.path).toBe("/api/v1/bills");
    expect(report.context.authorization).toBe("[redacted]");
  });
});
