import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { partialSummary } from "../conversation/decompose";
import { hitRateLimit, RATE_LIMITS, rateLimitMessage } from "../security/rate-limit";
import { EMAIL_ALERT_THRESHOLDS, summarizeEmail, type EmailEventRow } from "./email-monitoring";
import { audioDurationSeconds, MAX_AUDIO_SECONDS, MAX_PDF_PAGES, pdfPageCount } from "./normalize";
import { drainJobs } from "./retry-queue";

/**
 * Wave 5 part 3 (§14–§17): rate limits, payload limits, email monitoring
 * and alerts, retries through the job queue, and partial success said
 * plainly.
 */

const NOW = new Date("2026-09-23T12:00:00Z");
const at = (minutesAgo: number) => new Date(NOW.getTime() - minutesAgo * 60_000).toISOString();
const events = (kind: EmailEventRow["kind"], n: number, minutesAgo = 5, latency: number | null = null): EmailEventRow[] =>
  Array.from({ length: n }, () => ({ kind, latency_ms: latency, created_at: at(minutesAgo) }));

describe("rate limits (§15)", () => {
  it("every bucket has a positive limit and window", () => {
    for (const { max, windowSeconds } of Object.values(RATE_LIMITS)) {
      expect(max).toBeGreaterThan(0);
      expect(windowSeconds).toBeGreaterThan(0);
    }
  });

  it("says it is temporary and nothing was lost", () => {
    expect(rateLimitMessage("hometalk.turn")).toMatch(/a minute/);
    expect(rateLimitMessage("homesend.intake")).toMatch(/Nothing was lost/);
  });

  it("follows the counter, and lets the request through when the counter cannot be reached", async () => {
    const counter = (answer: { data: unknown; error: unknown }) => ({ rpc: async () => answer }) as unknown as SupabaseClient;
    expect(await hitRateLimit(counter({ data: true, error: null }), "hometalk.turn", "m-1")).toBe(true);
    expect(await hitRateLimit(counter({ data: false, error: null }), "hometalk.turn", "m-1")).toBe(false);
    expect(await hitRateLimit(counter({ data: null, error: { code: "PGRST202" } }), "hometalk.turn", "m-1")).toBe(true);
    const throwing = { rpc: async () => { throw new Error("down"); } } as unknown as SupabaseClient;
    expect(await hitRateLimit(throwing, "ai.model", "h-1")).toBe(true);
  });
});

describe("payload limits (§15)", () => {
  it("counts PDF pages from page objects, never the page tree", () => {
    const pdf = (pages: number) =>
      new TextEncoder().encode(`%PDF-1.7\n1 0 obj << /Type /Pages /Count ${pages} >> endobj\n${Array.from({ length: pages }, (_, i) => `${i + 2} 0 obj << /Type /Page /Parent 1 0 R >> endobj`).join("\n")}`);
    expect(pdfPageCount(pdf(3))).toBe(3);
    expect(pdfPageCount(pdf(MAX_PDF_PAGES + 1))).toBeGreaterThan(MAX_PDF_PAGES);
  });

  it("reads a WAV's length from its header, and leaves compressed audio to the byte limit", () => {
    const wav = (seconds: number) => {
      const byteRate = 16_000 * 2;
      const dataSize = seconds * byteRate;
      const bytes = new Uint8Array(44);
      const view = new DataView(bytes.buffer);
      bytes.set([0x52, 0x49, 0x46, 0x46], 0);
      view.setUint32(4, 36 + dataSize, true);
      bytes.set([0x57, 0x41, 0x56, 0x45], 8);
      bytes.set([0x66, 0x6d, 0x74, 0x20], 12);
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, 16_000, true);
      view.setUint32(28, byteRate, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      bytes.set([0x64, 0x61, 0x74, 0x61], 36);
      view.setUint32(40, dataSize, true);
      return bytes;
    };
    expect(audioDurationSeconds(wav(30), "audio/wav")).toBe(30);
    expect(audioDurationSeconds(wav(MAX_AUDIO_SECONDS + 60), "audio/wav")!).toBeGreaterThan(MAX_AUDIO_SECONDS);
    expect(audioDurationSeconds(new Uint8Array([0xff, 0xfb, 0x90]), "audio/mpeg")).toBeNull();
  });
});

describe("email forwarding monitoring (§14)", () => {
  it("counts every kind of event and measures processing latency", () => {
    const summary = summarizeEmail(
      [...events("delivered", 4), ...events("processed", 3, 5, 800), ...events("processed", 1, 5, 2400), ...events("signature_failed", 2)],
      [{ status: "routed" }, { status: "classified" }, { status: "failed" }],
      { windowHours: 24, reviewQueueDepth: 1, now: NOW },
    );
    expect(summary.counts.delivered).toBe(4);
    expect(summary.counts.signature_failed).toBe(2);
    expect(summary.counts.duplicate).toBe(0);
    expect(summary.latencyMs).toEqual({ median: 800, p90: 2400, of: 4 });
    expect(summary.routed).toEqual({ count: 1, of: 3 });
    expect(summary.rejected).toEqual({ count: 1, of: 3 });
    expect(summary.alerts).toEqual([]);
  });

  it("alerts on repeated provider failure, a backlog, a duplicate spike and attachment failures", () => {
    const summary = summarizeEmail(
      [
        ...events("fetch_failed", EMAIL_ALERT_THRESHOLDS.providerFailures),
        ...events("delivered", 10),
        ...events("duplicate", 6),
        ...events("attachment_failed", 3),
        ...events("attachment_too_large", 2),
      ],
      [],
      { windowHours: 24, reviewQueueDepth: EMAIL_ALERT_THRESHOLDS.queueBacklog, now: NOW },
    );
    expect(summary.alerts.map((alert) => alert.condition).sort()).toEqual(["attachment_failures", "duplicate_spike", "provider_failures", "queue_backlog"]);
  });

  it("only the last hour counts toward an alert, so an old bad minute does not page anyone", () => {
    const summary = summarizeEmail(events("fetch_failed", 10, 120), [], { windowHours: 24, reviewQueueDepth: 0, now: NOW });
    expect(summary.counts.fetch_failed).toBe(10);
    expect(summary.alerts).toEqual([]);
  });
});

describe("retries through the job queue (§15, §16)", () => {
  function fakeQueue(jobs: { id: string; household_id: string | null; kind: string; payload: unknown; attempts: number }[], item: Record<string, unknown> | null) {
    const completed: { id: string; error: string | null }[] = [];
    const admin = {
      async rpc(name: string, args: Record<string, unknown>) {
        if (name === "claim_jobs") return { data: jobs, error: null };
        if (name === "complete_job") {
          completed.push({ id: args.p_job_id as string, error: (args.p_error as string | null) ?? null });
          return { data: null, error: null };
        }
        throw new Error(`unexpected rpc ${name}`);
      },
      from() {
        const chain = {
          select: () => chain,
          eq: () => chain,
          update: () => chain,
          maybeSingle: async () => ({ data: item, error: null }),
          then: (resolve: (value: unknown) => void) => resolve({ data: null, error: null }),
        };
        return chain;
      },
    } as unknown as SupabaseClient;
    return { admin, completed };
  }

  it("completes a job for an item someone already acted on, without reading it again", async () => {
    const { admin, completed } = fakeQueue([{ id: "j1", household_id: "h1", kind: "homesend.classify", payload: { itemId: "i1" }, attempts: 1 }], null);
    expect(await drainJobs(admin)).toEqual({ claimed: 1, succeeded: 1, retried: 0, skipped: 1 });
    expect(completed).toEqual([{ id: "j1", error: null }]);
  });

  it("backs off a job this worker does not know, so it parks as dead rather than vanishing", async () => {
    const { admin, completed } = fakeQueue([{ id: "j2", household_id: "h1", kind: "something.else", payload: {}, attempts: 1 }], null);
    expect(await drainJobs(admin)).toEqual({ claimed: 1, succeeded: 0, retried: 1, skipped: 0 });
    expect(completed).toEqual([{ id: "j2", error: "unknown job kind" }]);
  });
});

describe("partial success, said plainly (§16)", () => {
  it("names what happened and what did not", () => {
    expect(
      partialSummary([
        { part: "add milk", outcome: "done" },
        { part: "pay the electricity bill", outcome: "waiting" },
        { part: "remind me to buy them", outcome: "failed" },
      ]),
    ).toBe('Done: "add milk". Waiting for your OK: "pay the electricity bill". Not done: "remind me to buy them".');
  });

  it("says nothing extra when everything went the same way, or when a question must stay last", () => {
    expect(partialSummary([{ part: "a", outcome: "done" }, { part: "b", outcome: "done" }])).toBeNull();
    expect(partialSummary([{ part: "a", outcome: "failed" }, { part: "b", outcome: "held" }])).toBeNull();
    expect(partialSummary([{ part: "a", outcome: "failed" }, { part: "b", outcome: "asked" }])).toBeNull();
  });
});
