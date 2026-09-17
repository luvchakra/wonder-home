// lint-secrets: fixtures — the credential-shaped values below are fakes,
// present precisely to prove they are redacted rather than logged.
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildRecord, log, setLogLevel, setLogSink, type LogRecord } from "./logger";

afterEach(() => {
  setLogSink(null);
  setLogLevel("info");
});

describe("structured logging", () => {
  it("emits one structured record carrying the request id", () => {
    const records: LogRecord[] = [];
    setLogSink((record) => records.push(record));

    log.info("outcome replanned", { requestId: "req-1", outcomeId: "o-9" });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      level: "info",
      message: "outcome replanned",
      requestId: "req-1",
      outcomeId: "o-9",
    });
    expect(records[0]?.timestamp).toEqual(expect.any(String));
  });

  it("redacts credentials and household content that a call site passes in", () => {
    const record = buildRecord("info", "sync finished", {
      requestId: "req-2",
      service_role_key: "sb_secret_abcdefghijklmnop",
      transcript: "Sunita won't be here tomorrow",
    });

    expect(record.service_role_key).toBe("[redacted]");
    expect(record.transcript).toBe("[redacted]");
    expect(record.requestId).toBe("req-2");
  });

  it("lets a call site keep a field it knows is safe", () => {
    const record = buildRecord("info", "invite sent", {
      email: "kunal@example.test",
      allow: ["email"],
    });
    expect(record.email).toBe("kunal@example.test");
    expect(record).not.toHaveProperty("allow");
  });

  it("drops records below the configured level", () => {
    const sink = vi.fn();
    setLogSink(sink);
    setLogLevel("warn");

    log.info("routine on track");
    expect(sink).not.toHaveBeenCalled();

    log.error("payment provider unreachable");
    expect(sink).toHaveBeenCalledTimes(1);
  });
});
