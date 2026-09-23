import { describe, expect, it } from "vitest";

import { personItems } from "../context/builders";
import { applyCorrection, readCorrection } from "./corrections";
import { heldBecause, splitRequest } from "./decompose";
import { converse, type TurnInput } from "./engine";
import { confidenceLead, groundIntent, type GroundingEnv } from "./grounding";
import { canExecute } from "./executor";
import { NO_REFERENCES, type FocusEntity, type ReferenceState } from "./references";

/**
 * The Wave 4 evaluation matrix (§22) and the required examples (§21), run
 * through the whole deterministic turn: rules → grounding → gates →
 * proposal. No provider is configured here, which is the point — this is
 * the safety net §18 says a model may augment but never remove.
 *
 * One household throughout: Priya (the head), Asmi (12) and Manan (9), and
 * Sunita, who helps. Wednesday 23 September 2026, 10:00 in Kolkata.
 */

const NOW = new Date("2026-09-23T04:30:00Z");
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();
const PEOPLE = personItems(
  [
    { id: "m-priya", displayName: "Priya", memberType: "adult", relationship: "mother" },
    { id: "m-asmi", displayName: "Asmi", memberType: "child", dateOfBirth: "2014-05-01", relationship: "daughter" },
    { id: "m-manan", displayName: "Manan", memberType: "child", dateOfBirth: "2017-02-11", relationship: "son" },
    { id: "m-sunita", displayName: "Sunita", memberType: "helper" },
  ],
  { householdId: "hh", now: NOW },
);

const SCHOOL = [
  { id: "s-ws", title: "Maths worksheet", childMemberId: "m-asmi", dueAt: "2026-09-24T12:30:00.000Z", status: "pending" },
  { id: "s-sci", title: "Science project", childMemberId: "m-manan", dueAt: "2026-09-29T11:30:00.000Z", status: "pending" },
  { id: "s-eng", title: "English worksheet", childMemberId: "m-manan", dueAt: null, status: "pending" },
];

const env = (references: Partial<ReferenceState> = {}): GroundingEnv => ({
  people: PEOPLE,
  viewerMemberId: "m-priya",
  timezone: "Asia/Kolkata",
  now: NOW,
  references: async () => ({ ...NO_REFERENCES, ...references }),
  recipes: async () => [
    { id: "r-pasta", name: "Tomato pasta" },
    { id: "r-dal", name: "Dal tadka" },
  ],
  ingredients: async (of) => (of.recipeId === "r-pasta" || of.mealId === "meal-1" ? ["pasta", "tomatoes", "basil"] : []),
  schoolItems: async () => SCHOOL,
  assets: async () => [
    { id: "a-wm", name: "Washing machine" },
    { id: "a-fridge", name: "Fridge" },
  ],
});

const HEAD = { memberId: "m-priya", roles: ["head" as const] };
const CHILD = { memberId: "m-asmi", roles: ["child" as const], memberType: "child" as const };

async function turn(utterance: string, over: Partial<TurnInput> & { references?: Partial<ReferenceState> } = {}) {
  const { references, ...rest } = over;
  return converse({
    utterance,
    channel: "text",
    actor: HEAD,
    pending: null,
    autonomyFor: () => "approve",
    entitledFor: () => true,
    executable: canExecute,
    sessionId: "s-1",
    now: NOW,
    ground: (intent) => groundIntent(intent, env(references)),
    ...rest,
  });
}

/** The kind of turn, for a table-driven check: what the household is shown. */
async function kindOf(utterance: string, over: Parameters<typeof turn>[1] = {}) {
  const result = await turn(utterance, over);
  if (result.kind !== "reply") return { kind: result.kind, action: null, text: result.text, intent: null };
  return { kind: result.proposal.kind, action: result.intent.action, text: result.text, intent: result.intent };
}

describe("§21 required examples — each is understood, and nothing is claimed that is not done", () => {
  const cases: { say: string; action: string; kind: string }[] = [
    // School
    { say: "What does Asmi have tomorrow?", action: "ask_status", kind: "answer" },
    { say: "Move Manan's science project to Friday.", action: "adjust_schedule", kind: "needs_approval" },
    { say: "Mark Asmi's worksheet complete.", action: "complete_school_item", kind: "executed" },
    // Groceries
    { say: "We're out of atta.", action: "add_to_list", kind: "executed" },
    { say: "Add the same milk we bought last week.", action: "add_to_list", kind: "executed" },
    { say: "Remove the bananas.", action: "remove_from_list", kind: "executed" },
    // Meals
    { say: "What are we eating tonight?", action: "ask_status", kind: "answer" },
    { say: "Plan something vegetarian for tomorrow.", action: "plan_meal", kind: "clarify" },
    // Finance
    { say: "Which bills are due this week?", action: "ask_status", kind: "answer" },
    { say: "Prepare the electricity payment.", action: "make_payment", kind: "needs_approval" },
    // Home
    { say: "The washing machine is making that noise again.", action: "raise_service_request", kind: "executed" },
    { say: "Raise a service request.", action: "raise_service_request", kind: "clarify" },
    // Family
    { say: "Protect Saturday evening for family time.", action: "plan_event", kind: "needs_approval" },
    // Health
    { say: "When is my next checkup?", action: "ask_status", kind: "answer" },
    { say: "Log my weight as 71.5 kg.", action: "log_vital", kind: "executed" },
  ];

  for (const example of cases) {
    it(`"${example.say}" → ${example.action}, ${example.kind}`, async () => {
      // Autonomy "execute" for the harmless ones, as a household would set
      // it; consequential ones still wait for a yes whatever it says.
      const result = await kindOf(example.say, { autonomyFor: () => (example.kind === "executed" ? "execute" : "approve") });
      expect({ action: result.action, kind: result.kind }).toEqual({ action: example.action, kind: example.kind });
    });
  }

  it("the school examples name the one real item, never a guess", async () => {
    const moved = await kindOf("Move Manan's science project to Friday.");
    expect(moved.intent?.parameters).toMatchObject({ schoolItemId: "s-sci", toResolved: expect.objectContaining({ date: "2026-09-25" }) });
    expect(moved.text).toMatch(/move Manan's Science project to Fri 25 Sep/);
    const done = await kindOf("Mark Asmi's worksheet complete.", { autonomyFor: () => "execute" });
    expect(done.intent?.parameters).toMatchObject({ schoolItemId: "s-ws", childName: "Asmi" });
  });

  it("\"worksheet\" for Manan, who has one — and for someone with none, it says so", async () => {
    const his = await kindOf("Mark Manan's worksheet complete.", { autonomyFor: () => "execute" });
    expect(his.intent?.parameters.schoolItemId).toBe("s-eng");
    const none = await kindOf("Mark Asmi's essay complete.");
    expect(none.kind).toBe("clarify");
    expect(none.text).toMatch(/I cannot find anything called "essay" still open for Asmi/);
  });

  it("the appliance is the household's own, and a vegetarian dinner is chosen from its own recipes", async () => {
    const repair = await kindOf("The washing machine is making that noise again.", { autonomyFor: () => "execute" });
    expect(repair.intent?.parameters).toMatchObject({ assetId: "a-wm", assetName: "Washing machine" });
    const veg = await kindOf("Plan something vegetarian for tomorrow.");
    expect(veg.text).toBe("Which vegetarian dish should I plan for tomorrow? For example Tomato pasta or Dal tadka — or name another.");
  });

  it("protected time is a real window on a real day", async () => {
    const result = await kindOf("Protect Saturday evening for family time.");
    expect(result.intent?.parameters).toMatchObject({ protected: true, windowResolved: expect.objectContaining({ date: "2026-09-26", window: { from: "17:00", to: "21:00" } }) });
  });
});

describe("§22 evaluation matrix", () => {
  it("contextual references: \"put that on the list\" after a school notice", async () => {
    const homesend: FocusEntity[] = [{ entityType: "thing", entityId: null, label: "white T-shirt", source: "homesend", at: minutesAgo(2), origin: "the school notice" }];
    const result = await kindOf("put that on the list", { autonomyFor: () => "execute", references: { homesend } });
    expect(result.intent?.parameters).toMatchObject({ item: "white T-shirt" });
  });

  it("Asmi vs Manan: names, relationships and ages each find one child", async () => {
    for (const [said, id] of [["Asmi is away tomorrow", "m-asmi"], ["Manan is away tomorrow", "m-manan"]] as const) {
      expect((await kindOf(said)).intent?.parameters.memberId).toBe(id);
    }
  });

  it("an ambiguous child reference is one question with both names", async () => {
    const result = await kindOf("the kid is away tomorrow");
    expect(result.kind).toBe("clarify");
    expect(result.text).toBe("I found two possibilities — Asmi or Manan. Which did you mean?");
  });

  it("confidence UX (§20): high goes unsaid, medium says \"I think you mean\"", async () => {
    const high = await kindOf("Asmi is away tomorrow");
    expect(confidenceLead(high.intent!)).toBeNull();
    const medium = await kindOf("the younger one is away tomorrow");
    expect(medium.intent?.parameters.memberId).toBe("m-manan");
    expect(confidenceLead(medium.intent!)).toBe('I think you mean Manan (you said "the younger one") — if not, say who.');
  });

  it("date expressions resolve to the household's own days", async () => {
    const cases: [string, string][] = [
      ["Sunita is away tomorrow", "2026-09-24"],
      ["Sunita is away next friday", "2026-10-02"],
      ["Sunita is away on friday", "2026-09-25"],
    ];
    for (const [said, date] of cases) {
      expect((await kindOf(said)).intent?.parameters.whenResolved).toMatchObject({ date });
    }
  });

  it("corrections: before a write they amend the request; after one they carry what to undo", () => {
    const correction = readCorrection("No, I meant Manan")!;
    const context = { actorMemberId: "m-priya", channel: "text" as const, utterance: "No, I meant Manan", timezone: "Asia/Kolkata", now: NOW };
    const subject = { actionId: "a-1", actionType: "record_absence", outcomeKey: null, parameters: { when: "tomorrow", memberId: "m-asmi", memberName: "Asmi" }, result: null };
    expect(applyCorrection(correction, { ...subject, status: "proposed" }, context)?.parameters.corrects).toBeUndefined();
    expect(applyCorrection(correction, { ...subject, status: "executed", result: { memberId: "m-asmi", onDate: "2026-09-24" } }, context)?.parameters.corrects).toMatchObject({ actionId: "a-1" });
  });

  it("voice confidence: a shaky transcript of something consequential is read back, never acted on", async () => {
    const result = await turn("pay the electricity bill", { channel: "voice", transcriptConfidence: 0.4 });
    expect(result.kind).toBe("confirm_transcript");
    expect(result.text).toMatch(/^I heard "pay the electricity bill" but I am not certain/);
    // The same words, clearly heard, reach the ordinary gates.
    expect((await turn("pay the electricity bill", { channel: "voice", transcriptConfidence: 0.95 })).kind).toBe("reply");
  });

  it("payments, orders and access changes always wait for a person — or are refused outright", async () => {
    expect((await kindOf("pay the electricity bill", { autonomyFor: () => "execute" })).kind).toBe("needs_approval");
    // No shop is connected, so an order is prepared and says so — never "done" (§13).
    expect(["needs_approval", "prepared"]).toContain((await kindOf("order rice", { autonomyFor: () => "execute" })).kind);
    expect((await kindOf("Sunita handles the school run", { autonomyFor: () => "execute" })).kind).toBe("needs_approval");
    // A child asking to pay is refused, whatever they say.
    expect((await kindOf("pay the electricity bill", { actor: CHILD, autonomyFor: () => "execute" })).kind).toBe("refused");
  });

  it("cross-domain plans: a meal, then what it needs — and the second waits for the first", async () => {
    expect(splitRequest("Plan pasta for tonight and make sure we have everything")).toEqual(["Plan pasta for tonight", "make sure we have everything"]);
    const meal = await kindOf("Plan pasta for tonight");
    expect(meal.intent).toMatchObject({ action: "plan_meal", parameters: expect.objectContaining({ recipeId: "r-pasta", mealName: "Tomato pasta" }) });
    expect(heldBecause("make sure we have everything", [{ part: "Plan pasta for tonight", outcome: "waiting" }])).toMatch(/waiting for your yes/);
    const planned: FocusEntity[] = [{ entityType: "meal", entityId: "meal-1", label: "Tomato pasta", source: "action_result", at: minutesAgo(0) }];
    const needs = await kindOf("make sure we have everything", { autonomyFor: () => "execute", references: { conversation: planned } });
    expect(needs.intent?.parameters).toMatchObject({ items: ["pasta", "tomatoes", "basil"], forMeal: "Tomato pasta" });
  });

  it("HomeSend-created context: what a notice asked for is what \"that\" means", async () => {
    const homesend: FocusEntity[] = [{ entityType: "school_item", entityId: "s-sports", label: "Sports Day", source: "homesend", at: minutesAgo(5), origin: "the school notice" }, { entityType: "thing", entityId: null, label: "white T-shirt", source: "homesend", at: minutesAgo(5), origin: "the school notice" }];
    const result = await kindOf("add that to the list", { autonomyFor: () => "execute", references: { homesend } });
    expect(result.intent?.parameters.item).toBe("white T-shirt");
  });

  it("previously executed actions are corrected through the record of what was written", () => {
    const correction = readCorrection("Not milk, almond milk")!;
    const corrected = applyCorrection(
      correction,
      { actionId: "a-9", actionType: "add_to_list", outcomeKey: "groceries", parameters: { items: ["milk", "bananas"] }, status: "executed", result: { items: [{ name: "Milk", consumableId: "c-1", alreadyTracked: false }] } },
      { actorMemberId: "m-priya", channel: "text", utterance: "Not milk, almond milk", timezone: "Asia/Kolkata", now: NOW },
    );
    expect(corrected?.parameters).toMatchObject({ items: ["almond milk", "bananas"], corrects: { actionId: "a-9" } });
  });
});
