import { describe, expect, it } from "vitest";

import { answerClarification } from "../conversation/clarify";
import { canExecute } from "../conversation/executor";
import { fakeSupabase } from "../homesend/testing";
import { answerIntakeQuestion, DETAIL_QUESTIONS, handedBackText, intakeQuestion, memberNamedInReply, openIntakeQuestion } from "./intake-questions";

/** The owner, 2026-10-26: HomeSend reports what is missing; HomeTalk asks, one question at a time, and hands the answers back. */

const HOUSEHOLD = "h1";
const PEOPLE = [
  { id: "kid-asmi", displayName: "Asmi Chakraborty", nickname: null, memberType: "child" },
  { id: "kid-manan", displayName: "Manan", nickname: "Mannu", memberType: "child" },
  { id: "adult-kunal", displayName: "Kunal Chakraborty", nickname: null, memberType: "adult" },
  { id: "helper-sunita", displayName: "Sunita", nickname: null, memberType: "helper" },
];
// Monday 26 October 2026, 10:30 in Kolkata.
const NOW = new Date("2026-10-26T05:00:00Z");

describe("the question HomeTalk asks next", () => {
  it("asks who a child's thing is for with the household's children as the choices", () => {
    const next = intakeQuestion({ itemId: "i1", kind: "school_item", extracted: { title: "Exam" }, asked: [], people: PEOPLE });
    expect(next?.question).toBe("Who is it for — Asmi or Manan?");
    expect(next?.clarify).toMatchObject({ action: "complete_homesend_item", parameters: { itemId: "i1", kind: "school_item", field: "child", asked: ["child"] } });
    expect((next?.clarify.parameters.choices as { id: string }[]).map((choice) => choice.id)).toEqual(["kid-asmi", "kid-manan"]);
  });

  it("asks whose a health record is from the household's people, never a helper", () => {
    const next = intakeQuestion({ itemId: "i1", kind: "health_document", extracted: { title: "Report" }, asked: [], people: PEOPLE });
    expect(next?.question).toBe("Whose record is it — Asmi, Manan or Kunal?");
  });

  it("asks between the people a name could be, when the content's name fits two", () => {
    const next = intakeQuestion({ itemId: "i1", kind: "school_item", extracted: { title: "Exam", people: ["A"] }, asked: [], people: PEOPLE, ambiguous: ["Asmi", "Manan"] });
    expect(next?.question).toBe("Who is it for — Asmi or Manan?");
  });

  it("leaves who it is for to the review when only one person fits, and asks the next thing", () => {
    const next = intakeQuestion({ itemId: "i1", kind: "school_item", extracted: { title: "Exam" }, asked: [], people: PEOPLE.filter((person) => person.id !== "kid-manan") });
    expect(next?.field).toBe("dueDate");
    expect(next?.question).toBe("When is it due?");
  });

  it("words each detail in HomeTalk's own short questions", () => {
    expect(intakeQuestion({ itemId: "i", kind: "grocery_item", extracted: { title: "Coconut oil" }, asked: [], people: [] })?.question).toBe(DETAIL_QUESTIONS.quantity);
    expect(intakeQuestion({ itemId: "i", kind: "event", extracted: { title: "Dinner" }, asked: [], people: [] })?.question).toBe("Which day is it?");
    expect(intakeQuestion({ itemId: "i", kind: "bill", extracted: { title: "Water" }, asked: [], people: [] })?.question).toBe("Who is the bill from?");
    expect(intakeQuestion({ itemId: "i", kind: "receipt", extracted: { title: "Groceries", merchant: "More" }, asked: [], people: [] })?.question).toBe("What day was it bought?");
    expect(intakeQuestion({ itemId: "i", kind: "health_document", extracted: { title: "Report", subjectMemberName: "Kunal", healthRecordType: "lab_result" }, asked: [], people: PEOPLE })?.question).toBe("What date is on it?");
  });

  it("asks nothing for a complete item, and nothing after three", () => {
    expect(intakeQuestion({ itemId: "i", kind: "grocery_item", extracted: { title: "Milk", quantity: 1 }, asked: [], people: [] })).toBeNull();
    expect(intakeQuestion({ itemId: "i", kind: "event", extracted: { title: "Dinner" }, asked: ["date", "time", "where"], people: [] })).toBeNull();
  });
});

describe("a reply that names someone", () => {
  const members = [
    { id: "a", displayName: "Asmi Chakraborty", nickname: null },
    { id: "m", displayName: "Manan", nickname: "Mannu" },
    { id: "k", displayName: "Kunal Chakraborty", nickname: null },
  ];
  it.each([["asmi", "a"], ["Asmi Chakraborty", "a"], ["for Manan", "m"], ["mannu", "m"], ["It's for Kunal.", "k"]])("%s", (text, expected) => {
    expect(memberNamedInReply(text, members)?.id).toBe(expected);
  });

  it("names nobody when it fits nobody or more than one", () => {
    expect(memberNamedInReply("thanks", members)).toBeNull();
    expect(memberNamedInReply("asmi", [...members, { id: "b", displayName: "Asmi Rao", nickname: null }])).toBeNull();
  });
});

describe("HomeTalk's clarify machinery reads the answer", () => {
  const pending = (field: string, kind = "event") => ({ action: "complete_homesend_item" as const, target: { kind: "unspecified" as const }, parameters: { itemId: "i1", kind, field, asked: [field] }, question: "q", utterance: "", asked: 1 });
  const ctx = { actorMemberId: "adult-kunal", channel: "text" as const };

  it("takes an answer of the kind asked, as the action that fills in the item", () => {
    const intent = answerClarification(pending("date"), "Saturday 7 November", ctx);
    expect(intent).toMatchObject({ action: "complete_homesend_item", parameters: { itemId: "i1", field: "date", answer: "Saturday 7 November" } });
    expect(canExecute(intent!)).toBe(true);
    expect(answerClarification(pending("quantity", "grocery_item"), "2 litres", ctx)?.action).toBe("complete_homesend_item");
    expect(answerClarification(pending("amount", "bill"), "₹2,140", ctx)?.action).toBe("complete_homesend_item");
    expect(answerClarification(pending("child", "school_item"), "Asmi", ctx)?.action).toBe("complete_homesend_item");
    expect(answerClarification(pending("where"), "the Kapoors'", ctx)?.action).toBe("complete_homesend_item");
    expect(answerClarification(pending("time"), "skip", ctx)?.action).toBe("complete_homesend_item");
  });

  // Design §5: an attempt that can't be read is still an attempt, so it gets one polite second ask.
  it("takes a short reply it can't read as an attempt at the answer", () => {
    expect(answerClarification(pending("quantity", "grocery_item"), "lots", ctx)).toMatchObject({ action: "complete_homesend_item", parameters: { answer: "lots" } });
  });

  it("reads a new request as that request, never as the answer", () => {
    expect(answerClarification(pending("date"), "add milk to the list", ctx)).toBeNull();
    expect(answerClarification(pending("where"), "what's on tomorrow?", ctx)).toBeNull();
    expect(answerClarification(pending("child", "school_item"), "remind me to call the school at 5", ctx)).toBeNull();
  });
});

describe("the answer goes back onto the HomeSend item", () => {
  const seeded = (item: Record<string, unknown>) =>
    fakeSupabase({ home_send_items: [{ id: "i1", household_id: HOUSEHOLD, status: "classified", understanding: { references: [] }, ...item }] });
  const answer = (client: ReturnType<typeof seeded>["client"], parameters: Record<string, unknown>, text: string) =>
    answerIntakeQuestion(client, { householdId: HOUSEHOLD, parameters: { itemId: "i1", ...parameters }, answer: text, people: PEOPLE, timezone: "Asia/Kolkata", now: NOW });

  it("fills a quantity and hands it back with nothing left to ask", async () => {
    const h = seeded({ classified_kind: "grocery_item", extracted: { title: "Coconut oil", quantity: null, unit: null } });
    const result = await answer(h.client, { kind: "grocery_item", field: "quantity", asked: ["quantity"] }, "2 litres");
    expect(h.tables.home_send_items![0]!.extracted).toMatchObject({ quantity: 2, unit: "l" });
    expect(result).toMatchObject({ text: "Got it, thanks.", clarify: null, handBack: true, stillNeeded: [] });
  });

  it("ask → answer → next question, then hand back", async () => {
    const h = seeded({ classified_kind: "event", extracted: { title: "Diwali dinner" } });
    const first = await answer(h.client, { kind: "event", field: "date", asked: ["date"] }, "Saturday 7 November");
    expect(h.tables.home_send_items![0]!.extracted).toMatchObject({ dueDate: "2026-11-07" });
    expect(first.text).toBe("Got it, thanks. What time does it start?");
    expect(first.clarify?.parameters).toMatchObject({ field: "time", asked: ["date", "time"] });
    const second = await answer(h.client, first.clarify!.parameters, "8 pm");
    expect(second.text).toBe("Got it, thanks. Where is it?");
    const third = await answer(h.client, second.clarify!.parameters, "skip");
    expect(third).toMatchObject({ text: "No problem.", handBack: true, clarify: null });
    expect(h.tables.home_send_items![0]!.extracted).toMatchObject({ dueDate: "2026-11-07", dueTime: "20:00" });
  });

  it("sets who it is for from a name, where the review reads it, then asks what is still missing", async () => {
    const h = seeded({ classified_kind: "school_item", extracted: { title: "Worksheet", people: [] } });
    const result = await answer(h.client, { kind: "school_item", field: "child", asked: ["child"], choices: PEOPLE.slice(0, 2) }, "asmi");
    expect(h.tables.home_send_items![0]!.extracted).toMatchObject({ subjectMemberName: "Asmi Chakraborty", people: ["Asmi Chakraborty"] });
    expect(h.tables.home_send_items![0]!.understanding).toMatchObject({ references: [{ text: "Asmi Chakraborty" }] });
    expect(result.text).toBe("Got it — that's for Asmi Chakraborty. When is it due?");
  });

  it("never says an amount back, and names what is left for HomeSend after three", async () => {
    const h = seeded({ classified_kind: "bill", extracted: { title: "Electricity", payee: null, amount: null, dueDate: null } });
    const result = await answer(h.client, { kind: "bill", field: "amount", asked: ["payee", "dueDate", "amount"] }, "₹2,140");
    expect(h.tables.home_send_items![0]!.extracted).toMatchObject({ amount: 2140 });
    expect(result).toMatchObject({ handBack: true, stillNeeded: ["who it's from", "due date"] });
    const said = handedBackText(result.text, { added: null, stillNeeded: result.stillNeeded });
    expect(said).toBe("Got it, thanks. It's waiting in HomeSend — the who it's from and due date can be filled in there.");
    expect(said).not.toMatch(/2,?140|₹/);
  });

  it("asks once more, politely and with ways to say it, when it can't read an answer", async () => {
    const h = seeded({ classified_kind: "school_item", extracted: { title: "Worksheet", people: ["Asmi"] } });
    const result = await answer(h.client, { kind: "school_item", field: "dueDate", asked: ["dueDate"] }, "whenever");
    expect(h.tables.home_send_items![0]!.extracted).not.toHaveProperty("dueDate");
    expect(result.text).toBe(['Sorry, I couldn\'t make that out. Could you say it one of these ways?', '- "tomorrow" or "next Friday"', '- a date, like "7 Nov"', 'Or say "skip" and I\'ll leave it for you in HomeSend.'].join("\n"));
    expect(result.clarify).toMatchObject({ action: "complete_homesend_item", parameters: { field: "dueDate", asked: ["dueDate"], retried: true } });
    expect(result.clarify!.parameters).not.toHaveProperty("answer");
    expect(result.handBack).toBe(false);
  });

  it("leaves a second answer it can't read for HomeSend, and moves on", async () => {
    const h = seeded({ classified_kind: "school_item", extracted: { title: "Worksheet", people: ["Asmi"] } });
    const result = await answer(h.client, { kind: "school_item", field: "dueDate", asked: ["dueDate"], retried: true }, "whenever");
    expect(result.text).toMatch(/^Sorry, I couldn't make that out, so I've left it for you to fill in in HomeSend/);
    expect(result.handBack).toBe(true);
    expect(result.stillNeeded).toEqual(["due date"]);
  });

  it("asks who again with the names as a list", async () => {
    const h = seeded({ classified_kind: "school_item", extracted: { title: "Worksheet", people: [] } });
    const result = await answer(h.client, { kind: "school_item", field: "child", asked: ["child"], choices: PEOPLE.slice(0, 2) }, "the older one");
    expect(result.text.split("\n")[0]).toBe("Sorry, I couldn't tell who from that. Could you pick one?");
    expect(result.text).toContain("- Asmi");
    expect(result.clarify?.parameters).toMatchObject({ field: "child", retried: true });
  });

  it("names the useful details it never got to ask, as well as the required ones", async () => {
    const h = seeded({ classified_kind: "event", extracted: { title: "Diwali dinner", dueDate: null } });
    const result = await answer(h.client, { kind: "event", field: "date", asked: ["title", "where", "date"] }, "Saturday 7 November");
    expect(result).toMatchObject({ handBack: true });
    expect(result.stillNeeded).toEqual(["start time"]);
    expect(handedBackText(result.text, { added: null, stillNeeded: result.stillNeeded })).toBe("Got it, thanks. It's waiting in HomeSend — the start time can be filled in there.");
  });

  it("says plainly when the item no longer waits in HomeSend", async () => {
    const h = seeded({ classified_kind: "event", status: "routed", extracted: { title: "x" } });
    expect((await answer(h.client, { kind: "event", field: "date", asked: ["date"] }, "tomorrow")).text).toBe("That one isn't waiting in HomeSend any more, so there's nothing to fill in.");
  });

  it("says what was added when HomeSend added it on its own", () => {
    expect(handedBackText("Got it, thanks.", { added: { title: "Coconut oil", where: "Groceries" }, stillNeeded: [] })).toBe(
      "Got it, thanks. Added **Coconut oil** to Groceries — your household lets WonderHome add these on its own. You can undo it in HomeSend.",
    );
  });
});

describe("opening the question in the member's conversation", () => {
  it("records it as HomeTalk's own open question on that surface", async () => {
    const h = fakeSupabase({
      home_send_items: [{ id: "i1", household_id: HOUSEHOLD, status: "classified", classified_kind: "event", extracted: { title: "Dinner" }, understanding: { references: [] } }],
      household_members: PEOPLE.map((person) => ({ id: person.id, household_id: HOUSEHOLD, display_name: person.displayName, nickname: person.nickname, member_type: person.memberType, status: "active" })),
      conversation_sessions: [],
      conversation_messages: [],
    });
    expect(await openIntakeQuestion(h.client, { householdId: HOUSEHOLD, memberId: "adult-kunal", itemId: "i1", surface: "whatsapp" })).toBe("Which day is it?");
    expect(h.tables.conversation_sessions![0]).toMatchObject({ member_id: "adult-kunal", surface: "whatsapp", status: "open" });
    expect(h.tables.conversation_messages![0]).toMatchObject({ role: "assistant", content: "Which day is it?", metadata: { mode: "clarify", clarify: { action: "complete_homesend_item", parameters: { itemId: "i1", field: "date" } } } });
  });
});
