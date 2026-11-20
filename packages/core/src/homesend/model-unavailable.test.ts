import { describe, expect, it } from "vitest";

import { acknowledgementFor } from "../whatsapp/intake";
import { endingFor } from "./deadlines";
import { ingestText } from "./ingest";
import { readByRulesOnly } from "./model-unavailable";
import { fakeSupabase } from "./testing";

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const MEMBER = "22222222-2222-4222-8222-222222222222";
const actor = { householdId: HOUSEHOLD, memberId: MEMBER };

describe("the assistant never quietly runs without its model (2026-11-21)", () => {
  it("keeps something sent while the provider refused the key as model_unavailable, not as unknown content", async () => {
    const db = fakeSupabase();
    const outcome = await ingestText(db.client, actor, { text: "We request parents to encourage their children to read every day." }, { classify: async () => null });
    expect(outcome).toMatchObject({ state: "failed", failureReason: "model_unavailable", classifyFailed: true });
    expect(db.tables.home_send_items![0]).toMatchObject({ status: "failed", failure_reason: "model_unavailable" });
  });

  it("with no provider at all, keeps the old honest answer (nothing to retry)", async () => {
    const db = fakeSupabase();
    const outcome = await ingestText(db.client, actor, { text: "PTM on Friday" }, { classify: async () => "no_provider" });
    expect(outcome.failureReason).toBeUndefined();
    expect(outcome.state).toBe("needs_review");
  });

  it("tells the sender the truth on WhatsApp, never 'couldn't tell what it's about'", async () => {
    const db = fakeSupabase();
    const outcome = await ingestText(db.client, actor, { text: "Exam timetable" }, { classify: async () => null });
    const reply = acknowledgementFor(outcome).text;
    expect(reply).toBe("Got it 👍 I've kept it. I can't read it right now, and I'll read it as soon as I can and tell you what I did.");
    expect(reply).not.toMatch(/couldn't tell what it's about|waiting in HomeSend/);
  });

  it("starts no deadline and asks nothing while it waits for a model", () => {
    const ending = endingFor({
      status: "failed",
      failureReason: "model_unavailable",
      readable: false,
      kind: "unknown",
      rawText: "Exam timetable",
      retryCount: 0,
      retryRequestedAt: null,
      canReadAgain: true,
      minutesSinceTouched: 3000,
      asked: new Set(),
      senderMemberId: MEMBER,
      senderActive: true,
    } as unknown as Parameters<typeof endingFor>[0]);
    expect(ending).toEqual({ action: "wait" });
  });

  it("recognises a reading the rules alone gave, and never a model's own verdict", () => {
    const rulesOnly = { status: "classified", classified_kind: "unknown", understanding: { readable: false, contentSummary: "", facts: [] } };
    expect(readByRulesOnly(rulesOnly)).toBe(true);
    expect(readByRulesOnly({ ...rulesOnly, understanding: { readable: true, contentSummary: "A school notice", facts: [] } })).toBe(false);
    expect(readByRulesOnly({ ...rulesOnly, classified_kind: "school_item" })).toBe(false);
  });
});
