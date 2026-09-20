import { describe, expect, it } from "vitest";

import { proposeFromIntent } from "./proposal";
import { RULE_ACTIONS, resolveRuleIntent } from "./rules";

/**
 * The rules answer the ordinary ways people ask, not only the sentences the
 * fixtures were taught — and still never guess about money.
 */
const read = (utterance: string) => resolveRuleIntent(utterance, { actorMemberId: "m-1", channel: "text" });

describe("what's going on", () => {
  it.each([
    "okay tell me what's going on in my home",
    "What's going on?",
    "what is happening at home",
    "What needs my attention?",
    "what are you handling",
    "catch me up",
    "how are things",
    "anything I need to do today",
  ])("reads %j as a status question", (utterance) => {
    const intent = read(utterance);
    expect(intent.action).toBe("ask_status");
    expect(intent.target.kind).toBe("unspecified");
    expect(intent.understanding).toEqual({ source: "rules" });
  });

  it("keeps the day when one was named", () => {
    expect(read("what's on tomorrow").parameters).toMatchObject({ when: "tomorrow" });
    expect(read("show me tomorrow's schedule").parameters).toMatchObject({ when: "tomorrow", scope: "schedule" });
    expect(read("what's the plan for today").parameters).toMatchObject({ when: "today" });
  });

  it("reads a question about a person", () => {
    const intent = read("how is Anaya's homework going");
    expect(intent.action).toBe("ask_status");
    expect(intent.target).toEqual({ kind: "member", reference: "anaya" });
    expect(intent.parameters.subject).toBe("homework");
  });
});

describe("adding to the groceries", () => {
  it.each([
    ["add a grocery item of milk", "milk"],
    ["Add milk to the grocery list.", "milk"],
    ["put coriander on the shopping list", "coriander"],
    ["add eggs to groceries", "eggs"],
    ["we're out of milk", "milk"],
    ["we need bread", "bread"],
    ["please add rice to the list", "rice"],
    ["Can you add some tomatoes to the groceries please", "tomatoes"],
    ["add basmati rice to the grocery list too", "basmati rice"],
  ])("reads %j as adding %j", (utterance, item) => {
    const intent = read(utterance);
    expect(intent.action).toBe("add_to_list");
    expect(intent.target).toEqual({ kind: "list", reference: "groceries" });
    expect(intent.parameters.item).toBe(item);
  });

  it("does not mistake 'get ready for tomorrow' for shopping", () => {
    expect(read("get ready for tomorrow").action).toBe("unknown");
  });
});

describe("someone is away", () => {
  it.each([
    ["Sunita is away tomorrow", "sunita", "tomorrow"],
    ["Ravi won't be here on Friday", "ravi", "friday"],
    ["mark Priya as off today", "priya", "today"],
    ["Sunita is sick", "sunita", "today"],
  ])("reads %j", (utterance, who, when) => {
    const intent = read(utterance);
    expect(intent.action).toBe("record_absence");
    expect(intent.target).toEqual({ kind: "member", reference: who });
    expect(intent.parameters.when).toBe(when);
  });
});

describe("money still asks", () => {
  it("names the bill when one was named", () => {
    const intent = read("pay the electricity bill");
    expect(intent.action).toBe("make_payment");
    expect(intent.target).toEqual({ kind: "bill", reference: "electricity" });
    expect(intent.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it("stays below the threshold for 'pay it', so the engine asks", () => {
    const intent = read("pay it");
    expect(intent.action).toBe("make_payment");
    const proposal = proposeFromIntent(intent, { actor: { roles: ["head"] }, autonomy: "execute", entitled: true });
    expect(proposal.kind).toBe("clarify");
  });

  it("asks what 'the usual' means before ordering", () => {
    const proposal = proposeFromIntent(read("order the usual"), { actor: { roles: ["head"] }, autonomy: "execute", entitled: true });
    expect(proposal.kind).toBe("clarify");
  });
});

describe("plans, moves and who does what", () => {
  it("plans something for a window", () => {
    const intent = read("plan a family outing this weekend");
    expect(intent.action).toBe("plan_event");
    expect(intent.parameters.window).toBe("this weekend");
  });

  it("moves something to a new time", () => {
    const intent = read("move Aarav's karate class to Thursday");
    expect(intent.action).toBe("adjust_schedule");
    expect(intent.parameters.to).toBe("thursday");
  });

  it("assigns an outcome to a person", () => {
    const intent = read("Priya handles the school run from now on");
    expect(intent.action).toBe("assign_responsibility");
    expect(intent.target).toEqual({ kind: "member", reference: "priya" });
    expect(intent.parameters.outcomeKey).toBe("school.run");
  });
});

describe("preferences", () => {
  it("turns 'we prefer dinner at 8' into a meal-time memory", () => {
    const intent = read("we prefer dinner at 8");
    expect(intent.action).toBe("set_preference");
    expect(intent.target).toEqual({ kind: "outcome", reference: "meals.dinner" });
    expect(intent.parameters.time).toBe("20:00");
  });

  it("marks 'actually' as a correction", () => {
    const intent = read("Actually, dinner is at 7:30");
    expect(intent.action).toBe("set_preference");
    expect(intent.parameters).toMatchObject({ time: "19:30", corrects: true });
  });
});

describe("greetings", () => {
  it("answers hello warmly rather than as a misunderstanding", () => {
    const intent = read("hi");
    expect(intent.action).toBe("greet");
    const proposal = proposeFromIntent(intent, { actor: { roles: ["adult"] }, autonomy: "approve", entitled: true });
    expect(proposal.kind).toBe("answer");
    if (proposal.kind === "answer") expect(proposal.summary).toMatch(/hello/i);
  });

  it("says what it can do when asked", () => {
    const proposal = proposeFromIntent(read("what can you do?"), { actor: { roles: ["adult"] }, autonomy: "approve", entitled: true });
    if (proposal.kind === "answer") expect(proposal.summary).toMatch(/groceries/);
  });
});

describe("what it does not know", () => {
  it("returns unknown rather than guessing", () => {
    expect(read("Do the thing with the stuff.").action).toBe("unknown");
    expect(read("Reticulate the household splines").action).toBe("unknown");
  });

  it("covers every action it claims to", () => {
    const seen = new Set(
      [
        "hi",
        "what's going on",
        "add milk to the list",
        "Sunita is away tomorrow",
        "pay the water bill",
        "order rice",
        "plan a picnic this weekend",
        "move dinner to 8pm",
        "Ravi handles the bins",
        "we prefer lunch at 1",
      ].map((utterance) => read(utterance).action),
    );
    for (const action of RULE_ACTIONS) expect(seen.has(action)).toBe(true);
  });
});
