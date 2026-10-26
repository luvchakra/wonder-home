import { describe, expect, it } from "vitest";

import type { IntakeExtraction } from "../ai/classify-intake";
import { ingestSchoolChannelMessage, type IngestDeps } from "./ingest";
import { fakeSupabase } from "./testing";

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const MEMBER = "22222222-2222-4222-8222-222222222222";
const actor = { householdId: HOUSEHOLD, memberId: MEMBER };

function reading(over: Partial<IntakeExtraction>): IntakeExtraction {
  return {
    readable: true, kind: "unknown", title: null, notes: null, billKind: null, payee: null, amount: null, currency: null, dueDate: null,
    schoolKind: null, subject: null, quantity: null, unit: null, category: null, healthRecordType: null, documentDate: null, dateText: null,
    merchant: null, lines: [], subjectMemberName: null, summary: null, people: [], facts: [], needs: [], change: "new", confidence: "high", secondary: null,
    ...over,
  };
}

function model(result: IntakeExtraction | null | "no_provider") {
  const seen: Parameters<NonNullable<IngestDeps["classify"]>>[] = [];
  const classify: NonNullable<IngestDeps["classify"]> = async (...args) => {
    seen.push(args);
    return result;
  };
  return { classify, seen };
}

const PTM = reading({
  kind: "school_item",
  title: "Parent–teacher meeting",
  schoolKind: "notice",
  dueDate: "2026-10-30",
  summary: "A parent–teacher meeting is on Friday 30 October.",
});

describe("ingestSchoolChannelMessage (08-031)", () => {
  it("files a channel message as a school_channel intake, understood and awaiting a person", async () => {
    const db = fakeSupabase();
    const { classify } = model(PTM);

    const outcome = await ingestSchoolChannelMessage(
      db.client,
      actor,
      {
        externalId: "school_channel:loop-learning:2044541:m-1",
        text: "Tulika ma'am: PTM is on Friday.",
        url: "https://www.looplearning.com/channel/2044541",
        from: "Tulika ma'am",
        channelDescription: "a message in a Loop Learning class channel",
      },
      { classify },
    );

    const row = db.tables.home_send_items?.[0];
    expect(row).toMatchObject({
      source: "school_channel",
      created_by_member_id: MEMBER,
      external_id: "school_channel:loop-learning:2044541:m-1",
      sender_address: "Tulika ma'am",
    });
    expect(outcome.item.understanding?.provenance.channel).toBe("school_channel");
    // Untrusted content → it becomes an item awaiting a person, never written on its own.
    expect(["needs_review", "check_transcript"]).not.toContain("routed");
  });

  it("files the same channel message once when a feed re-delivers it (idempotent by message id)", async () => {
    const db = fakeSupabase();
    const { classify } = model(PTM);
    const input = {
      externalId: "school_channel:loop-learning:2044541:m-9",
      text: "Holiday on Monday.",
      url: "https://www.looplearning.com/channel/2044541",
      channelDescription: "a message in a Loop Learning class channel",
    };

    await ingestSchoolChannelMessage(db.client, actor, input, { classify });
    await ingestSchoolChannelMessage(db.client, actor, input, { classify });

    expect(db.tables.home_send_items?.filter((r) => r.external_id === input.externalId)).toHaveLength(1);
  });

  it("refuses an empty message", async () => {
    const db = fakeSupabase();
    const { classify } = model(PTM);
    await expect(
      ingestSchoolChannelMessage(db.client, actor, { externalId: "x", text: "   " }, { classify }),
    ).rejects.toThrow();
  });
});
