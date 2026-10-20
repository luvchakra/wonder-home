import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { pauseEmailIfRejected, REJECTIONS_BEFORE_PAUSE, shouldPauseEmail, turnEmailOff } from "./email-health";

const refused = { event_type: "delivery_failed", metadata: { code: "rejected" } };
const sent = { event_type: "sent", metadata: {} };
const unreachable = { event_type: "delivery_failed", metadata: { code: "unavailable" } };

describe("shouldPauseEmail (story 27-009)", () => {
  it("pauses after three refusals in a row", () => {
    expect(REJECTIONS_BEFORE_PAUSE).toBe(3);
    expect(shouldPauseEmail([refused, refused, refused])).toBe(true);
  });
  it("does not pause on fewer, or when anything else came between", () => {
    expect(shouldPauseEmail([refused, refused])).toBe(false);
    expect(shouldPauseEmail([refused, sent, refused])).toBe(false);
    expect(shouldPauseEmail([refused, unreachable, refused])).toBe(false);
    expect(shouldPauseEmail([])).toBe(false);
  });
  it("only looks at the latest three", () => {
    expect(shouldPauseEmail([refused, refused, refused, sent])).toBe(true);
    expect(shouldPauseEmail([sent, refused, refused, refused])).toBe(false);
  });
});

function fakeAdmin(events: unknown[]) {
  const updates: { table: string; values: unknown }[] = [];
  const client = {
    from(table: string) {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        order: () => chain,
        limit: () => chain,
        update: (values: unknown) => {
          updates.push({ table, values });
          return chain;
        },
        then: (resolve: (value: unknown) => void) => resolve({ data: table === "notification_events" ? events : [], error: null }),
      };
      return chain;
    },
  };
  return { client: client as unknown as SupabaseClient, updates };
}

describe("pauseEmailIfRejected", () => {
  it("switches the channel off with the closed reason, and says it did", async () => {
    const { client, updates } = fakeAdmin([refused, refused, refused]);
    expect(await pauseEmailIfRejected(client, "m1", new Date("2026-10-20T10:00:00Z"))).toBe(true);
    expect(updates).toEqual([{ table: "notification_preferences", values: { enabled: false, paused_reason: "address_rejected", paused_at: "2026-10-20T10:00:00.000Z" } }]);
  });
  it("leaves the channel alone when the attempts are not all refusals", async () => {
    const { client, updates } = fakeAdmin([refused, sent, refused]);
    expect(await pauseEmailIfRejected(client, "m1")).toBe(false);
    expect(updates).toEqual([]);
  });
});

describe("turnEmailOff", () => {
  it("only switches email off, and leaves any pause reason as it was", async () => {
    const { client, updates } = fakeAdmin([]);
    expect(await turnEmailOff(client, "m1")).toBe(true);
    expect(updates).toEqual([{ table: "notification_preferences", values: { enabled: false } }]);
  });
});
