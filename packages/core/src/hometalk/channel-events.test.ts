import { describe, expect, it } from "vitest";

import { recordChannelEvent, summarizeChannels, type ChannelEventRow } from "./channel-events";

const row = (channel: ChannelEventRow["channel"], outcome: ChannelEventRow["outcome"], latency: number | null = 100, replayed = false): ChannelEventRow => ({ channel, outcome, latency_ms: latency, replayed });

describe("HomeTalk by channel: the spec's metrics, each a count out of a count", () => {
  it("counts every rate against first deliveries, and replays as duplicates", () => {
    const rows = [
      row("gemini_voice", "answered", 900),
      row("gemini_voice", "completed", 1200),
      row("gemini_voice", "completed", 1200, true),
      row("gemini_voice", "failed", 3000),
      row("gemini_voice", "clarification_required", 800),
      row("gemini_voice", "approval_required", 700),
      row("gemini_voice", "not_authorized", 50),
      row("gemini_voice", "session_opened", 400),
      row("gemini_voice", "provider_error", null),
      row("alexa", "unlinked", null),
      row("alexa", "rate_limited", null),
      row("web", "answered", 2000),
    ];
    const metrics = summarizeChannels(rows);
    const gemini = metrics.gemini_voice;
    expect(gemini.requests).toBe(7);
    expect(gemini.success).toEqual({ count: 2, of: 6 });
    expect(gemini.failure).toEqual({ count: 1, of: 6 });
    expect(gemini.clarification).toEqual({ count: 1, of: 6 });
    expect(gemini.approval).toEqual({ count: 1, of: 6 });
    expect(gemini.notAuthorized).toEqual({ count: 1, of: 6 });
    expect(gemini.actionSuccess).toEqual({ count: 1, of: 2 });
    expect(gemini.actionFailure).toEqual({ count: 1, of: 2 });
    expect(gemini.duplicate).toEqual({ count: 1, of: 7 });
    expect(gemini.sessionsOpened).toBe(1);
    expect(gemini.providerErrors).toBe(1);
    expect(gemini.latencyMs).toEqual({ p50: 800, p95: 3000, of: 6 });
    expect(metrics.alexa).toMatchObject({ requests: 0, unlinked: 1, rateLimited: 1, success: { count: 0, of: 0 } });
    expect(metrics.web.success).toEqual({ count: 1, of: 1 });
    expect(metrics.mobile.requests).toBe(0);
  });
});

describe("recording never costs a household its answer", () => {
  it("writes closed words and numbers only", async () => {
    const inserted: unknown[] = [];
    await recordChannelEvent({ from: () => ({ insert: async (value: unknown) => (inserted.push(value), { error: null }) }) } as never, { channel: "alexa", outcome: "completed", householdId: "h-1", latencyMs: 12.6 });
    expect(inserted).toEqual([{ channel: "alexa", outcome: "completed", household_id: "h-1", latency_ms: 13, replayed: false }]);
  });

  it("a database error or a throw is swallowed and logged", async () => {
    await expect(recordChannelEvent({ from: () => ({ insert: async () => ({ error: { code: "42501" } }) }) } as never, { channel: "web", outcome: "answered" })).resolves.toBeUndefined();
    await expect(
      recordChannelEvent({ from: () => { throw new Error("down"); } } as never, { channel: "web", outcome: "answered" }),
    ).resolves.toBeUndefined();
  });
});
