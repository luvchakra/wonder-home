import { describe, expect, it } from "vitest";

import {
  answerClarification,
  clarificationFrom,
  escalatedQuestion,
  extractItems,
  stripFiller,
  type PendingClarification,
} from "./clarify";
import { converse } from "./engine";
import type { HouseholdIntent } from "./intent";

const context = { actorMemberId: "member-1", channel: "voice" as const };

const pending = (overrides: Partial<PendingClarification> = {}): PendingClarification => ({
  action: "order_items",
  target: { kind: "unspecified" },
  parameters: {},
  question: "What would you like me to order?",
  utterance: "I want you to add 3 eggs for order and packet of milk for order",
  asked: 1,
  ...overrides,
});

describe("hearing past the words people use when they are frustrated", () => {
  it("drops the phrase somebody only says because we failed them", () => {
    expect(stripFiller("I just said 3 eggs and packet of milk")).toBe("3 eggs and packet of milk");
    expect(stripFiller("I already told you order 3 eggs")).toBe("order 3 eggs");
    expect(stripFiller("no, I just said milk")).toBe("milk");
  });

  it("leaves an ordinary request alone", () => {
    expect(stripFiller("order 3 eggs")).toBe("order 3 eggs");
  });
});

describe("pulling the items out of however somebody said it", () => {
  it("reads the sentence from the screenshot that started this", () => {
    expect(extractItems("I want you to add 3 egg for order and packet of milk for order")).toEqual([
      "3 egg",
      "packet of milk",
    ]);
  });

  it("reads the frustrated repeat of it too", () => {
    expect(extractItems("I just said 3 eggs and packet of milk for order")).toEqual(["3 eggs", "packet of milk"]);
  });

  it("does not turn where it goes into what it is", () => {
    // "milk for order" must never become an item called "milk for order".
    expect(extractItems("add milk to the shopping list")).toEqual(["milk"]);
    expect(extractItems("put bread and jam on the grocery list")).toEqual(["bread", "jam"]);
  });

  it("handles a plain comma-separated list with no verb at all", () => {
    expect(extractItems("3 eggs, 1 packet of milk, bread")).toEqual(["3 eggs", "1 packet of milk", "bread"]);
  });

  it("strips the article a person naturally puts in front", () => {
    expect(extractItems("order a packet of milk and some bread")).toEqual(["packet of milk", "bread"]);
  });

  it("refuses a bare number, which is a quantity that lost its noun", () => {
    expect(extractItems("3")).toEqual([]);
  });

  it("refuses an answer that names nothing new", () => {
    expect(extractItems("the usual")).toEqual([]);
    expect(extractItems("that")).toEqual([]);
  });
});

describe("answering the question that was asked", () => {
  it("completes the order from the answer, and is confident about it", () => {
    const intent = answerClarification(pending(), "I just said 3 eggs and packet of milk", context);

    expect(intent).not.toBeNull();
    expect(intent!.action).toBe("order_items");
    expect(intent!.parameters.items).toEqual(["3 eggs", "packet of milk"]);
    // Low confidence here is what made it ask again. Somebody who has now
    // said the same thing twice has been clear.
    expect(intent!.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it("inherits the list the question was about", () => {
    const intent = answerClarification(pending(), "eggs", context);
    expect(intent!.target).toEqual({ kind: "list", reference: "groceries" });
  });

  it("keeps a list the question had already settled on", () => {
    const intent = answerClarification(
      pending({ target: { kind: "list", reference: "pet-supplies" } }),
      "dog food",
      context,
    );
    expect(intent!.target).toEqual({ kind: "list", reference: "pet-supplies" });
  });

  it("lets somebody change the subject instead of answering", () => {
    // Swallowing this as an answer would add "what needs attention" to the
    // groceries, which is worse than asking again.
    expect(answerClarification(pending(), "the usual", context)).toBeNull();
  });

  it("does not try to answer a question it has no way to answer", () => {
    expect(answerClarification(pending({ action: "make_payment" }), "the electricity one", context)).toBeNull();
  });
});

describe("never asking the same thing twice", () => {
  it("says what is missing and shows an answer that would work", () => {
    const second = escalatedQuestion(pending());

    expect(second).not.toBe(pending().question);
    expect(second).toContain("3 eggs");
    // A way out that does not involve talking to it again.
    expect(second).toContain("Groceries");
  });

  it("has a different second question for every consequential thing it asks about", () => {
    const actions = ["order_items", "make_payment", "assign_responsibility", "adjust_schedule"] as const;
    const questions = actions.map((action) => escalatedQuestion(pending({ action })));
    expect(new Set(questions).size).toBe(actions.length);
  });

  it("stops short of promising anything was paid", () => {
    expect(escalatedQuestion(pending({ action: "make_payment" }))).toContain("until you confirm");
  });
});

describe("counting how many times we have asked", () => {
  const intent = (action: HouseholdIntent["action"]): HouseholdIntent => ({
    actorMemberId: "member-1",
    channel: "voice",
    utterance: "...",
    action,
    target: { kind: "unspecified" },
    parameters: {},
    confidence: 0.4,
  });

  it("counts up while the subject stays the same", () => {
    const first = clarificationFrom({
      intent: intent("order_items"),
      question: "What would you like me to order?",
      utterance: "order something",
      previous: null,
    });
    expect(first.asked).toBe(1);

    const second = clarificationFrom({
      intent: intent("order_items"),
      question: "What would you like me to order?",
      utterance: "I just said",
      previous: first,
    });
    expect(second.asked).toBe(2);
  });

  it("starts again when the subject changes", () => {
    const first = clarificationFrom({
      intent: intent("order_items"),
      question: "What would you like me to order?",
      utterance: "order something",
      previous: null,
    });
    const other = clarificationFrom({
      intent: intent("make_payment"),
      question: "Which bill?",
      utterance: "pay it",
      previous: first,
    });
    expect(other.asked).toBe(1);
  });
});

describe("the conversation from the screenshot, end to end", () => {
  const turn = async (utterance: string, clarifying: PendingClarification | null) =>
    converse({
      utterance,
      channel: "voice",
      actor: { memberId: "member-1", roles: ["head"], memberType: "adult" },
      pending: null,
      autonomyFor: () => "approve",
      entitledFor: () => true,
      executable: () => false,
      sessionId: "session-1",
      clarifying,
    });

  it("understands the first ask, instead of asking what to order", async () => {
    const first = await turn("I want you to add 3 egg for order and packet of milk for order", null);

    expect(first.kind).toBe("reply");
    if (first.kind !== "reply") return;
    expect(first.intent.action).toBe("order_items");
    expect(first.intent.parameters.items).toEqual(["3 egg", "packet of milk"]);
    expect(first.text).not.toContain("What would you like me to order?");
  });

  it("uses the answer when it did have to ask", async () => {
    const asked = await turn("order the usual", null);
    expect(asked.kind).toBe("reply");
    if (asked.kind !== "reply") return;
    expect(asked.proposal.kind).toBe("clarify");
    expect(asked.clarification).not.toBeNull();

    const answered = await turn("I just said 3 eggs and packet of milk", asked.clarification!);
    expect(answered.kind).toBe("reply");
    if (answered.kind !== "reply") return;

    // The whole point: the answer is used, not re-asked.
    expect(answered.proposal.kind).not.toBe("clarify");
    expect(answered.intent.parameters.items).toEqual(["3 eggs", "packet of milk"]);
  });

  it("never repeats itself when the answer still does not resolve it", async () => {
    const asked = await turn("order the usual", null);
    if (asked.kind !== "reply") return;
    const question = asked.text;

    const again = await turn("the usual", asked.clarification!);
    if (again.kind !== "reply") return;

    expect(again.text).not.toBe(question);
    expect(again.text).toContain("Groceries");
  });

  it("closes the question once it has been answered", async () => {
    const asked = await turn("order the usual", null);
    if (asked.kind !== "reply") return;

    const answered = await turn("3 eggs", asked.clarification!);
    if (answered.kind !== "reply") return;

    // Nothing is left open, so a later unrelated turn is not read as an
    // answer to a question nobody is asking any more.
    expect(answered.clarification).toBeNull();
  });
});
