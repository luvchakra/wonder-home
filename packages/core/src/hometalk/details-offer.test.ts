import { describe, expect, it } from "vitest";

import { answerClarification } from "../conversation/clarify";
import { canExecute, executeIntent } from "../conversation/executor";
import { fakeSupabase } from "../homesend/testing";
import { translatorFor } from "../i18n/translate";
import { mayOffer, offerToFillDetails, OFFER_EVERY_MS } from "./details-offer";
import { titlesFor, waitingForDetails } from "./intake-questions";

/**
 * Story 14-050 (the owner said yes, 2026-10-26): HomeTalk offers, on its own,
 * to fill in what waits in HomeSend. Expected results written first.
 */

const HOUSEHOLD = "h-1";
const NOW = new Date("2026-10-26T10:00:00Z");
const PEOPLE = [
  { id: "kid-asmi", displayName: "Asmi Chakraborty", nickname: null, memberType: "child" },
  { id: "kid-manan", displayName: "Manan", nickname: null, memberType: "child" },
  { id: "adult-kunal", displayName: "Kunal Chakraborty", nickname: null, memberType: "adult" },
];
const recent = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

/** A worksheet with no due date, a dinner with no day, a complete grocery line, an old one, and one already added. */
function household() {
  return fakeSupabase({
    home_send_items: [
      { id: "i-worksheet", household_id: HOUSEHOLD, status: "classified", classified_kind: "school_item", extracted: { title: "Maths worksheet", people: ["Asmi"], dueDate: null }, understanding: { references: [] }, created_at: recent(1) },
      { id: "i-dinner", household_id: HOUSEHOLD, status: "classified", classified_kind: "event", extracted: { title: "Diwali dinner", dueDate: null }, understanding: { references: [] }, created_at: recent(2) },
      { id: "i-oil", household_id: HOUSEHOLD, status: "classified", classified_kind: "grocery_item", extracted: { title: "Mustard oil", quantity: 2, unit: "l" }, understanding: { references: [] }, created_at: recent(1) },
      { id: "i-old", household_id: HOUSEHOLD, status: "classified", classified_kind: "event", extracted: { title: "Old party", dueDate: null }, understanding: { references: [] }, created_at: recent(30) },
      { id: "i-done", household_id: HOUSEHOLD, status: "routed", classified_kind: "event", extracted: { title: "Done", dueDate: null }, understanding: { references: [] }, created_at: recent(1) },
    ],
    conversation_sessions: [],
    conversation_messages: [],
  });
}

describe("14-050: which waiting items HomeTalk can help fill in", () => {
  it("OF-01 only items still waiting, from the last two weeks, that miss something HomeTalk can ask", async () => {
    const h = household();
    const waiting = await waitingForDetails(h.client, { householdId: HOUSEHOLD, people: PEOPLE, now: NOW });
    expect(waiting.map((item) => item.itemId).sort()).toEqual(["i-dinner", "i-worksheet"]);
  });

  it("OF-02 names at most three titles", () => {
    expect(titlesFor([{ itemId: "a", title: "A" }, { itemId: "b", title: "B" }])).toBe("A and B");
    expect(titlesFor([{ itemId: "a", title: "A" }, { itemId: "b", title: "B" }, { itemId: "c", title: "C" }, { itemId: "d", title: "D" }])).toBe("A, B and C");
  });
});

describe("14-050: when the offer is made", () => {
  const said = (role: string, minutesAgo: number, metadata: Record<string, unknown> = {}) => ({ role, created_at: new Date(NOW.getTime() - minutesAgo * 60_000).toISOString(), metadata });
  it("OF-03 offered in a quiet conversation", () => {
    expect(mayOffer([], NOW)).toBe(true);
    expect(mayOffer([said("assistant", 5, { mode: "answer" })], NOW)).toBe(true);
  });
  it("OF-04 never over a question HomeTalk is still waiting on", () => {
    expect(mayOffer([said("assistant", 1, { mode: "clarify" })], NOW)).toBe(false);
  });
  it("OF-05 at most once every twelve hours", () => {
    expect(mayOffer([said("member", 1), said("assistant", 60, { intent: "fill_homesend_details", mode: "clarify" })], NOW)).toBe(false);
    expect(mayOffer([said("member", 1), said("assistant", OFFER_EVERY_MS / 60_000 + 1, { intent: "fill_homesend_details", mode: "clarify" })], NOW)).toBe(true);
  });

  it("OF-06 recorded as HomeTalk's own open question, in the member's language", async () => {
    const h = household();
    const t = await translatorFor("en");
    const words = await offerToFillDetails(h.client, h.client, { householdId: HOUSEHOLD, memberId: "adult-kunal", people: PEOPLE, t, now: NOW });
    expect(words?.text).toMatch(/^2 things in HomeSend need a detail — (Maths worksheet and Diwali dinner|Diwali dinner and Maths worksheet)\. Shall we fill them in now\? Say yes, or no to leave them\.$/);
    const message = h.tables.conversation_messages![0]!;
    expect(words).toMatchObject({ sessionId: message.session_id, messageId: message.id });
    expect(message).toMatchObject({ role: "assistant", content: words!.text, metadata: { intent: "fill_homesend_details", mode: "clarify", clarify: { action: "fill_homesend_details" } } });
    expect(((message.metadata as { clarify: { parameters: { itemIds: string[] } } }).clarify.parameters.itemIds).sort()).toEqual(["i-dinner", "i-worksheet"]);
    // Opening HomeTalk again straight away says nothing more.
    expect(await offerToFillDetails(h.client, h.client, { householdId: HOUSEHOLD, memberId: "adult-kunal", people: PEOPLE, t, now: NOW })).toBeNull();
    expect(h.tables.conversation_messages).toHaveLength(1);
  });

  it("OF-07 says nothing when nothing is missing", async () => {
    const h = fakeSupabase({ home_send_items: [{ id: "i-oil", household_id: HOUSEHOLD, status: "classified", classified_kind: "grocery_item", extracted: { title: "Mustard oil", quantity: 2, unit: "l" }, understanding: { references: [] }, created_at: recent(1) }], conversation_sessions: [], conversation_messages: [] });
    expect(await offerToFillDetails(h.client, h.client, { householdId: HOUSEHOLD, memberId: "adult-kunal", people: PEOPLE, t: await translatorFor("en"), now: NOW })).toBeNull();
  });

  it("OF-08 in Hindi for a Hindi-speaking member, one item", async () => {
    const h = fakeSupabase({ home_send_items: [household().tables.home_send_items![1]!], conversation_sessions: [], conversation_messages: [] });
    const words = await offerToFillDetails(h.client, h.client, { householdId: HOUSEHOLD, memberId: "adult-kunal", people: PEOPLE, t: await translatorFor("hi"), now: NOW });
    expect(words?.text).toBe("HomeSend में 1 चीज़ में एक जानकारी बाकी है — Diwali dinner। क्या अभी भर दें? हाँ कहें, या छोड़ने के लिए ना।");
  });
});

describe("14-050: yes, no, or something else", () => {
  const offer = { action: "fill_homesend_details" as const, target: { kind: "unspecified" as const }, parameters: { itemIds: ["i-worksheet", "i-dinner"] }, question: "2 things…", utterance: "", asked: 1 };
  const ctx = { actorMemberId: "adult-kunal", channel: "text" as const };
  for (const [id, said, expected] of [
    ["OF-09", "yes", "fill"],
    ["OF-10", "Sure, let's do it", "fill"],
    ["OF-11", "ok", "fill"],
    ["OF-12", "haan", "fill"],
    ["OF-13", "no", "decline"],
    ["OF-14", "not now", "decline"],
    ["OF-15", "add milk to the list", "new request"],
    ["OF-16", "what's for dinner?", "new request"],
  ] as const) {
    it(`${id} "${said}" → ${expected}`, () => {
      const intent = answerClarification(offer, said, ctx);
      if (expected === "new request") expect(intent).toBeNull();
      else {
        expect(intent).toMatchObject({ action: "fill_homesend_details", parameters: { itemIds: ["i-worksheet", "i-dinner"] } });
        expect(intent!.parameters.decline === true).toBe(expected === "decline");
        expect(canExecute(intent!)).toBe(true);
      }
    });
  }
});

describe("14-050: filling them in, one item after another", () => {
  const context = (client: ReturnType<typeof household>["client"]) => ({ supabase: client, householdId: HOUSEHOLD, actorMemberId: "adult-kunal", members: PEOPLE, timezone: "Asia/Kolkata", now: NOW, addFromHomeSend: async () => null });
  const yes = { action: "fill_homesend_details" as const, actorMemberId: "adult-kunal", channel: "text" as const, utterance: "yes", target: { kind: "unspecified" as const }, parameters: { itemIds: ["i-worksheet", "i-dinner"] }, confidence: 0.95 };

  it("OF-17 yes asks the first item's first question, with the next queued", async () => {
    const h = household();
    const result = await executeIntent(yes, context(h.client) as never);
    expect(result).toMatchObject({ ok: true, text: 'First, **Maths worksheet**: When is it due? (Say "skip" to leave one for later.)' });
    expect(result.ok && result.result.clarify).toMatchObject({ action: "complete_homesend_item", parameters: { itemId: "i-worksheet", field: "dueDate", queue: ["i-dinner"] } });
  });

  it("OF-18 answering it moves on to the next item", async () => {
    const h = household();
    const first = await executeIntent(yes, context(h.client) as never);
    const clarify = (first.ok ? first.result.clarify : null) as { parameters: Record<string, unknown> };
    const answered = await executeIntent({ ...yes, action: "complete_homesend_item", utterance: "Friday", parameters: { ...clarify.parameters, answer: "Friday" } }, context(h.client) as never);
    expect(h.tables.home_send_items!.find((row) => row.id === "i-worksheet")!.extracted).toMatchObject({ dueDate: expect.stringMatching(/^2026-10-30$/) });
    expect(answered.ok && answered.text).toMatch(/^Got it, thanks\. It's waiting in HomeSend for you to check\. Next, \*\*Diwali dinner\*\*: Which day is it\?$/);
    expect(answered.ok && answered.result.clarify).toMatchObject({ parameters: { itemId: "i-dinner", field: "date", queue: [] } });
  });

  it("OF-19 no leaves them all waiting", async () => {
    const h = household();
    const result = await executeIntent({ ...yes, parameters: { ...yes.parameters, decline: true } }, context(h.client) as never);
    expect(result).toEqual({ ok: true, text: "No problem — they'll wait in HomeSend for you.", result: {} });
  });

  it("OF-20 says so when everything was filled in elsewhere meanwhile", async () => {
    const h = household();
    for (const row of h.tables.home_send_items!) row.status = "routed";
    const result = await executeIntent(yes, context(h.client) as never);
    expect(result.ok && result.text).toBe("Everything waiting in HomeSend already has what it needs — nothing to fill in.");
  });
});

describe("14-050: a whole HomeTalk turn answering the offer", () => {
  it("OF-21 \"yes\" with no proposal pending answers the offer, never \"nothing waiting for a yes\"", async () => {
    const { converse } = await import("../conversation/engine");
    const offer = { action: "fill_homesend_details" as const, target: { kind: "unspecified" as const }, parameters: { itemIds: ["i-dinner"] }, question: "1 thing…", utterance: "", asked: 1 };
    const turn = await converse({
      utterance: "yes", channel: "text", actor: { memberId: "adult-kunal", roles: ["head"], memberType: "adult" }, pending: null, clarifying: offer,
      autonomyFor: () => "prepare", entitledFor: () => true, executable: canExecute, sessionId: "s-1", now: NOW,
    });
    expect(turn.kind).toBe("reply");
    expect(turn.kind === "reply" && turn.intent.action).toBe("fill_homesend_details");
    expect(turn.kind === "reply" && turn.proposal.kind).toBe("executed");
  });
});
