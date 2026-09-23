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

  it.each([
    "what needs attention right now",
    "what is the current situation",
    "what is going on in my family right now",
    "What's the situation at home?",
    "anything I should know about today",
    "give me an overview of the house",
    "how's everything at home these days",
    "is there anything urgent",
    "what's on my to-do",
  ])("reads the wider phrasing %j as a status question too", (utterance) => {
    const intent = read(utterance);
    expect(intent.action).toBe("ask_status");
    expect(intent.understanding).toEqual({ source: "rules" });
  });

  it("keeps a request a request even when it mentions the home", () => {
    expect(read("add milk to the list").action).toBe("add_to_list");
    expect(read("put eggs on the shopping list for tomorrow").action).not.toBe("ask_status");
    expect(read("we need bread today").action).toBe("add_to_list");
    expect(read("pay the electricity bill now").action).toBe("make_payment");
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

describe("checking on the agents", () => {
  it.each([
    "check on things",
    "Check my household",
    "run my agents",
    "run a check",
    "what do my agents see",
    "run agents check",
  ])("reads %j as check_agents", (utterance) => {
    const intent = read(utterance);
    expect(intent.action).toBe("check_agents");
    expect(intent.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("always proposes execute — what each step may actually do is gated per step", () => {
    const intent = read("check on things");
    const proposal = proposeFromIntent(intent, { actor: { roles: ["adult"] }, autonomy: "observe", entitled: true });
    expect(proposal.kind).toBe("executed");
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
        "check on things",
        "add milk to the list",
        "remind me to buy milk tomorrow",
        "remove the bananas",
        "mark Asmi's worksheet complete",
        "the washing machine is leaking",
        "Sunita is away tomorrow",
        "pay the water bill",
        "order rice",
        "plan a picnic this weekend",
        "move dinner to 8pm",
        "Ravi handles the bins",
        "we prefer lunch at 1",
        "I have a dentist appointment next Tuesday at 4",
        "My BP was 128 over 82 this morning",
        "I've had a headache since yesterday",
        "My headache is gone",
        "I want to walk three times a week",
      ].map((utterance) => read(utterance).action),
    );
    for (const action of RULE_ACTIONS) expect(seen.has(action)).toBe(true);
  });
});

describe("changing a meal", () => {
  it("asks for the dish when the Meals screen's link says only which meal", () => {
    const intent = read("Change dinner on 2026-09-20");
    expect(intent.action).toBe("unknown");
    expect(intent.target).toEqual({ kind: "outcome", reference: "meals.dinner" });
    expect(intent.parameters.clarify).toBe("What would you like for dinner on Sun 20 Sep? Tell me the dish and I will note the change.");
    expect(proposeFromIntent(intent, { actor: { roles: ["adult"] }, autonomy: "approve", entitled: true })).toEqual({
      kind: "clarify",
      question: "What would you like for dinner on Sun 20 Sep? Tell me the dish and I will note the change.",
    });
  });

  it("remembers the plan when the dish was said", () => {
    const intent = read("change dinner on friday to paneer pulao");
    expect(intent.action).toBe("set_preference");
    expect(intent.target).toEqual({ kind: "outcome", reference: "meals.dinner" });
    expect(intent.parameters).toMatchObject({ statement: "dinner friday: paneer pulao" });
  });
});

describe("health (story 21-006)", () => {
  it("books an appointment from 'I have a <type> appointment <when> at <time>'", () => {
    const intent = read("I have a dentist appointment next Tuesday at 4");
    expect(intent.action).toBe("record_health_appointment");
    expect(intent.target).toEqual({ kind: "member", reference: "self" });
    expect(intent.parameters).toMatchObject({ appointmentType: "dentist", when: "next tuesday", time: "4" });
  });

  it("prepares a vital reading from 'My BP was <reading>'", () => {
    const intent = read("My BP was 128 over 82 this morning");
    expect(intent.action).toBe("log_vital");
    expect(intent.parameters).toMatchObject({ vital: "bp", reading: "128 over 82 this morning" });
  });

  it("prepares a vital reading from 'Log my <vital> as <reading>' (story 21-007)", () => {
    const intent = read("Log my weight as 71.5 kg");
    expect(intent.action).toBe("log_vital");
    expect(intent.parameters).toMatchObject({ vital: "weight", reading: "71.5 kg" });

    const recorded = read("Record my blood pressure as 128/82");
    expect(recorded.action).toBe("log_vital");
    expect(recorded.parameters).toMatchObject({ vital: "blood pressure", reading: "128/82" });
  });

  it("logs an issue from 'I've had a <symptom> since <when>'", () => {
    const intent = read("I've had a headache since yesterday");
    expect(intent.action).toBe("log_health_issue");
    expect(intent.parameters).toMatchObject({ label: "headache", since: "yesterday" });
  });

  it("resolves an issue from 'My <symptom> is gone'", () => {
    const intent = read("My headache is gone");
    expect(intent.action).toBe("resolve_health_issue");
    expect(intent.parameters).toMatchObject({ label: "headache" });
  });

  it("prepares a fitness goal from 'I want to <activity> <count> times a <period>' — words and digits alike", () => {
    const intent = read("I want to walk three times a week");
    expect(intent.action).toBe("set_fitness_goal");
    expect(intent.parameters).toMatchObject({ activity: "walk", count: 3, timesPer: "week" });

    const digitIntent = read("I want to run 5 times a week");
    expect(digitIntent.parameters).toMatchObject({ activity: "run", count: 5, timesPer: "week" });
  });

  it("reads 'What health appointments do I have this month?' as a health-scoped status question", () => {
    const intent = read("What health appointments do I have this month?");
    expect(intent.action).toBe("ask_status");
    expect(intent.parameters).toMatchObject({ scope: "health", when: "this month" });
  });

  it("does not mistake an ordinary preference for a health issue", () => {
    // "I have X" is a symptom shape only when X reads like a short noun, not
    // a sentence about something else that happens to start with "I have".
    expect(read("I have a meeting at 3").action).not.toBe("log_health_issue");
  });
});

describe("'why?' questions (HomeBrain 2.0, Wave 2 §10)", () => {
  it.each([
    ["Why are you asking for approval?", "why_approval"],
    ["why do you need my ok", "why_approval"],
    ["Why are you asking me this?", "why_question"],
    ["Why didn't you add that?", "why_not_done"],
    ["Why do you think this is for Asmi?", "why_person"],
    ["Where did this date come from?", "source"],
    ["How do you know that?", "source"],
    ["What did I just send you?", "sent"],
    ["What did WonderHome change after I sent it?", "changed_after_send"],
    ["What changed since yesterday?", "recent_changes"],
  ])("reads %j as an explanation request, answered from evidence", (utterance, topic) => {
    const intent = read(utterance);
    expect(intent.action).toBe("ask_status");
    expect(intent.parameters).toMatchObject({ scope: "explain", explain: topic });
    // An explanation is a read: proposing it can never become a change.
    expect(proposeFromIntent(intent, { actor: { roles: ["adult"], memberType: "adult" }, autonomy: "execute", entitled: true }).kind).toBe("answer");
  });

  it("leaves ordinary questions and requests alone", () => {
    expect(read("What's going on?").parameters.explain).toBeUndefined();
    expect(read("Add milk to the list").action).not.toBe("ask_status");
  });
});

describe("a person's stance on a thing (Wave 2 §8)", () => {
  it("reads the spec's own example as one belief, corrected", () => {
    const first = read("Asmi doesn't like mushrooms");
    const later = read("Actually Asmi is okay with mushrooms now");
    expect(first.action).toBe("set_preference");
    expect(later.action).toBe("set_preference");
    expect(first.target.reference).toBe("pref.asmi.mushroom");
    expect(later.target.reference).toBe(first.target.reference);
    expect(first.parameters.corrects).toBeUndefined();
    expect(later.parameters.corrects).toBe(true);
  });

  it("does not take requests or questions for preferences", () => {
    expect(read("Add mushrooms to the list").action).toBe("add_to_list");
    expect(read("What does Asmi like?").action).not.toBe("set_preference");
  });
});

describe("Wave 4: several things, reminders and what a meal needs", () => {
  it("\"add milk and bananas\" is two things to add, each on its own", () => {
    expect(read("Add milk and bananas")).toMatchObject({ action: "add_to_list", parameters: { items: ["milk", "bananas"] } });
    expect(read("we need milk, eggs and bread")).toMatchObject({ action: "add_to_list", parameters: { items: ["milk", "eggs", "bread"] } });
    expect(read("add almond milk")).toMatchObject({ action: "add_to_list", parameters: { item: "almond milk" } });
  });

  it("\"add\" with a destination or a time in it is not read as a grocery", () => {
    expect(read("add Asmi to swimming").action).not.toBe("add_to_list");
    expect(read("add a dentist appointment tomorrow").action).not.toBe("add_to_list");
  });

  it("reads a reminder's what, day and time, whichever order they come in", () => {
    expect(read("remind me to buy them tomorrow")).toMatchObject({ action: "set_reminder", parameters: { what: "buy them", when: "tomorrow" } });
    expect(read("Remind me tomorrow at 6pm to call the plumber")).toMatchObject({ action: "set_reminder", parameters: { what: "call the plumber", when: "tomorrow", time: "6pm" } });
    expect(read("remind me to pack the kit bag after school")).toMatchObject({ action: "set_reminder", parameters: { what: "pack the kit bag", when: "after school" } });
    expect(read("Remind me to call the plumber tomorrow evening")).toMatchObject({ action: "set_reminder", parameters: { what: "call the plumber", when: "tomorrow evening" } });
  });

  it("\"make sure we have everything\" asks for what a meal needs", () => {
    expect(read("make sure we have everything")).toMatchObject({ action: "add_to_list", parameters: { ingredientsOf: "that" } });
    expect(read("add everything we need for pasta")).toMatchObject({ action: "add_to_list", parameters: { ingredientsOf: "pasta" } });
  });
});
