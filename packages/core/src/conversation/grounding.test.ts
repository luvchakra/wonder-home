import { describe, expect, it } from "vitest";

import { personItems } from "../context/builders";
import { converse } from "./engine";
import { groundIntent, type GroundingEnv } from "./grounding";
import type { HouseholdIntent } from "./intent";
import { NO_REFERENCES, type FocusEntity, type ReferenceState } from "./references";

// Wednesday 23 September 2026, 10:00 in Kolkata.
const NOW = new Date("2026-09-23T04:30:00Z");
const HOUSEHOLD = "hh-1";
const PEOPLE = personItems(
  [
    { id: "m-priya", displayName: "Priya", memberType: "adult", relationship: "mother" },
    { id: "m-asmi", displayName: "Asmi", memberType: "child", dateOfBirth: "2014-05-01", relationship: "daughter" },
    { id: "m-manan", displayName: "Manan", memberType: "child", dateOfBirth: "2017-02-11", relationship: "son" },
    { id: "m-sunita", displayName: "Sunita", memberType: "helper" },
  ],
  { householdId: HOUSEHOLD, now: NOW },
);

const env = (references: Partial<ReferenceState> = {}): GroundingEnv => ({
  people: PEOPLE,
  viewerMemberId: "m-priya",
  timezone: "Asia/Kolkata",
  now: NOW,
  references: async () => ({ ...NO_REFERENCES, ...references }),
});

const intent = (overrides: Partial<HouseholdIntent>): HouseholdIntent => ({
  action: "record_absence",
  actorMemberId: "m-priya",
  target: { kind: "member", reference: "sunita" },
  parameters: { when: "tomorrow" },
  confidence: 0.92,
  channel: "text",
  utterance: "",
  ...overrides,
});

const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();

describe("entity grounding (Wave 4 §6): a mention becomes a member, or one question", () => {
  it("resolves a name to the member's id before anything is proposed", async () => {
    const grounded = await groundIntent(intent({}), env());
    expect(grounded.kind).toBe("grounded");
    expect(grounded.kind === "grounded" && grounded.intent.parameters).toMatchObject({ memberId: "m-sunita", memberName: "Sunita" });
    expect(grounded.kind === "grounded" && grounded.focus).toEqual([expect.objectContaining({ entityType: "member", entityId: "m-sunita" })]);
  });

  it("resolves a relationship and an age comparison, not just a name", async () => {
    const daughter = await groundIntent(intent({ target: { kind: "member", reference: "my daughter" } }), env());
    expect(daughter.kind === "grounded" && daughter.intent.parameters.memberId).toBe("m-asmi");
    const younger = await groundIntent(intent({ target: { kind: "member", reference: "the younger one" } }), env());
    expect(younger.kind === "grounded" && younger.intent.parameters.memberId).toBe("m-manan");
  });

  it("an ambiguous child reference is one focused question — Asmi or Manan — never a guess", async () => {
    const grounded = await groundIntent(intent({ target: { kind: "member", reference: "the kid" } }), env());
    expect(grounded.kind).toBe("clarify");
    expect(grounded.kind === "clarify" && grounded.question).toMatch(/Asmi.*Manan|Manan.*Asmi/);
    expect(grounded.kind === "clarify" && grounded.candidates.map((candidate) => candidate.label).sort()).toEqual(["Asmi", "Manan"]);
  });

  it("an unknown name is said so, and asked about", async () => {
    const grounded = await groundIntent(intent({ target: { kind: "member", reference: "zorawar" } }), env());
    expect(grounded.kind === "clarify" && grounded.question).toBe('I do not know anyone called "zorawar" in your household. Who did you mean?');
  });

  it("a model-supplied id is trusted only when it is someone in this household", async () => {
    const forged = await groundIntent(intent({ target: { kind: "member", reference: "sunita" }, parameters: { when: "tomorrow", memberId: "someone-else" } }), env());
    expect(forged.kind === "grounded" && forged.intent.parameters.memberId).toBe("m-sunita");
  });

  it("\"the other one\" is the other of exactly two children", async () => {
    const lastTalkedAbout: FocusEntity = { entityType: "member", entityId: "m-asmi", label: "Asmi", source: "mention", at: minutesAgo(1) };
    const grounded = await groundIntent(intent({ target: { kind: "member", reference: "the other one" } }), env({ conversation: [lastTalkedAbout] }));
    expect(grounded.kind === "grounded" && grounded.intent.parameters.memberId).toBe("m-manan");
  });

  it("\"him\" is the person the conversation was just about", async () => {
    const lastTalkedAbout: FocusEntity = { entityType: "member", entityId: "m-manan", label: "Manan", source: "mention", at: minutesAgo(1) };
    const grounded = await groundIntent(intent({ target: { kind: "member", reference: "him" } }), env({ conversation: [lastTalkedAbout] }));
    expect(grounded.kind === "grounded" && grounded.intent.parameters.memberId).toBe("m-manan");
  });
});

describe("temporal grounding in an intent (Wave 4 §7)", () => {
  it("adds the resolved local day beside the phrase the understanding gave", async () => {
    const grounded = await groundIntent(intent({ parameters: { when: "next friday" } }), env());
    expect(grounded.kind === "grounded" && grounded.intent.parameters.whenResolved).toMatchObject({ date: "2026-10-02", precision: "day" });
  });

  it("an absence needs one day: a range or an unreadable phrase is a question", async () => {
    const range = await groundIntent(intent({ parameters: { when: "next week" } }), env());
    expect(range.kind === "clarify" && range.awaiting).toBe("day");
    const unreadable = await groundIntent(intent({ parameters: { when: "sometime" } }), env());
    expect(unreadable.kind === "clarify" && unreadable.question).toMatch(/Which day/);
  });
});

describe("reference grounding (Wave 4 §4, §8): \"put that on the list\"", () => {
  const listIntent = (item: string) => intent({ action: "add_to_list", target: { kind: "list", reference: "groceries" }, parameters: { item } });

  it("resolves to the thing a school notice just asked for", async () => {
    const grounded = await groundIntent(listIntent("that"), env({ homesend: [{ entityType: "thing", entityId: null, label: "white T-shirt", source: "homesend", at: minutesAgo(2), origin: "the school notice" }] }));
    expect(grounded.kind === "grounded" && grounded.intent.parameters).toMatchObject({ item: "white T-shirt", referred: "that" });
  });

  it("asks when a notice and the conversation both put something in play", async () => {
    const grounded = await groundIntent(
      listIntent("that"),
      env({
        conversation: [{ entityType: "thing", entityId: null, label: "printer paper", source: "mention", at: minutesAgo(4) }],
        homesend: [{ entityType: "thing", entityId: null, label: "white T-shirt", source: "homesend", at: minutesAgo(2), origin: "the school notice" }],
      }),
    );
    expect(grounded.kind === "clarify" && grounded.question).toBe("Do you mean the white T-shirt from the school notice or the printer paper?");
  });

  it("with nothing to point at, it asks what — it never adds an item called \"that\"", async () => {
    const grounded = await groundIntent(listIntent("that"), env());
    expect(grounded.kind === "clarify" && grounded.awaiting).toBe("item");
  });

  it("an item with a real name needs no references read at all", async () => {
    let read = false;
    const grounded = await groundIntent(listIntent("milk"), { ...env(), references: async () => ((read = true), NO_REFERENCES) });
    expect(grounded.kind === "grounded" && grounded.intent.parameters.item).toBe("milk");
    expect(read).toBe(false);
  });
});

describe("the whole turn: grounding sits between understanding and any proposal", () => {
  const base = {
    channel: "text" as const,
    actor: { memberId: "m-priya", roles: ["head" as const] },
    pending: null,
    autonomyFor: () => "execute" as const,
    entitledFor: () => true,
    executable: () => true,
    sessionId: "s-1",
    now: NOW,
  };

  it("an ambiguous person asks one question, and the answer completes the original request", async () => {
    const first = await converse({ ...base, utterance: "the kid is away tomorrow", ground: (understood) => groundIntent(understood, env()), understand: () => intent({ target: { kind: "member", reference: "the kid" }, utterance: "the kid is away tomorrow" }) });
    expect(first.kind === "reply" && first.proposal.kind).toBe("clarify");
    const clarification = first.kind === "reply" ? first.clarification! : null;
    expect(clarification?.parameters.awaiting).toBe("member");

    const second = await converse({ ...base, utterance: "Manan", clarifying: clarification, ground: (understood) => groundIntent(understood, env()) });
    expect(second.kind).toBe("reply");
    expect(second.kind === "reply" && second.intent).toMatchObject({ action: "record_absence", parameters: expect.objectContaining({ memberId: "m-manan", when: "tomorrow" }) });
    expect(second.kind === "reply" && second.proposal.kind).toBe("executed");
  });

  it("what a person approves names the grounded person and day, not the raw words", async () => {
    const turn = await converse({
      ...base,
      autonomyFor: () => "approve",
      utterance: "sunita is away next friday",
      ground: (understood) => groundIntent(understood, env()),
      understand: () => intent({ target: { kind: "member", reference: "sunita" }, parameters: { when: "next friday" } }),
    });
    expect(turn.kind === "reply" && turn.proposal.kind).toBe("needs_approval");
    expect(turn.kind === "reply" && "preview" in turn.proposal && turn.proposal.preview.summary).toBe("Record that Sunita is away on Fri 2 Oct");
  });

  it("a whole new request after a question is read as that request, never swallowed as the answer", async () => {
    const asked = await converse({ ...base, utterance: "zorawar is away tomorrow", ground: (understood) => groundIntent(understood, env()), understand: () => intent({ target: { kind: "member", reference: "zorawar" } }) });
    const next = await converse({ ...base, utterance: "Sunita is away next friday", clarifying: asked.kind === "reply" ? asked.clarification : null, ground: (understood) => groundIntent(understood, env()) });
    expect(next.kind === "reply" && next.intent.parameters).toMatchObject({ memberId: "m-sunita", whenResolved: expect.objectContaining({ date: "2026-10-02" }) });
  });

  it("a model that leaves a reminder's target unspecified is not asked \"which one?\" — a reminder is always the speaker's own", async () => {
    // Live Gemini run, 23 Sep 2026: "Remind me to call the plumber tomorrow at 9am" came back "Which one did you mean?".
    for (const action of ["set_reminder", "raise_service_request"] as const) {
      const turn = await converse({
        ...base,
        utterance: "Remind me to call the plumber tomorrow at 9am",
        ground: (understood) => groundIntent(understood, env()),
        understand: () => intent({ action, target: { kind: "unspecified" }, parameters: { what: "call the plumber", when: "tomorrow", time: "9am", appliance: "sink" } }),
      });
      expect(turn.kind === "reply" && turn.text, action).not.toBe("Which one did you mean?");
      expect(turn.kind === "reply" && turn.intent.target.kind, action).toBe("outcome");
    }
  });

  it("the same grounding question is never asked twice", async () => {
    const first = await converse({ ...base, utterance: "zorawar is away tomorrow", ground: (understood) => groundIntent(understood, env()), understand: () => intent({ target: { kind: "member", reference: "zorawar" } }) });
    const again = await converse({ ...base, utterance: "zoro", clarifying: first.kind === "reply" ? first.clarification : null, ground: (understood) => groundIntent(understood, env()) });
    expect(again.kind === "reply" && again.text).toMatch(/^I still cannot tell who you mean/);
  });

  it("the rules' \"put that on the list\" resolves through the same grounding", async () => {
    const turn = await converse({
      ...base,
      utterance: "put that on the list",
      ground: (understood) => groundIntent(understood, env({ homesend: [{ entityType: "thing", entityId: null, label: "white T-shirt", source: "homesend", at: minutesAgo(2), origin: "the school notice" }] })),
    });
    expect(turn.kind === "reply" && turn.intent).toMatchObject({ action: "add_to_list", parameters: expect.objectContaining({ item: "white T-shirt" }) });
    expect(turn.kind === "reply" && turn.focus).toEqual([expect.objectContaining({ label: "white T-shirt" })]);
  });
});

describe("cross-domain grounding (Wave 4 §10, §11): meals, what they need, and reminders", () => {
  const recipes = async () => [
    { id: "r-pasta", name: "Tomato pasta" },
    { id: "r-dal", name: "Dal tadka" },
  ];
  const ingredients = async (of: { mealId?: string | null; recipeId?: string | null }) =>
    of.mealId === "meal-1" || of.recipeId === "r-pasta" ? ["pasta", "tomatoes", "basil"] : [];
  const mealEnv = (references: Partial<ReferenceState> = {}): GroundingEnv => ({ ...env(references), recipes, ingredients });

  it("\"plan pasta for tonight\" is a meal when the household has a pasta recipe", async () => {
    const grounded = await groundIntent(intent({ action: "plan_event", target: { kind: "event", reference: "pasta" }, parameters: { what: "pasta", window: "tonight" } }), mealEnv());
    expect(grounded.kind === "grounded" && grounded.intent).toMatchObject({
      action: "plan_meal",
      target: { kind: "outcome", reference: "meals" },
      parameters: { mealName: "Tomato pasta", recipeId: "r-pasta", slot: "dinner", windowResolved: expect.objectContaining({ date: "2026-09-23" }) },
    });
  });

  it("naming a meal of the day makes it a meal even with no recipe; anything else stays a calendar plan", async () => {
    const khichdi = await groundIntent(intent({ action: "plan_event", target: { kind: "event" }, parameters: { what: "khichdi for lunch", when: "tomorrow" } }), mealEnv());
    expect(khichdi.kind === "grounded" && khichdi.intent.parameters).toMatchObject({ mealName: "Khichdi", slot: "lunch" });
    const picnic = await groundIntent(intent({ action: "plan_event", target: { kind: "event", reference: "picnic" }, parameters: { what: "a picnic", window: "this weekend" } }), mealEnv());
    expect(picnic.kind === "grounded" && picnic.intent.action).toBe("plan_event");
  });

  it("a meal with no day is one question", async () => {
    const grounded = await groundIntent(intent({ action: "plan_event", target: { kind: "event" }, parameters: { what: "pasta" } }), mealEnv());
    expect(grounded.kind === "clarify" && grounded.question).toBe("Which day should I plan tomato pasta for?");
  });

  it("\"make sure we have everything\" is what the meal just planned needs", async () => {
    const planned: FocusEntity = { entityType: "meal", entityId: "meal-1", label: "Tomato pasta", source: "action_result", at: minutesAgo(0) };
    const grounded = await groundIntent(intent({ action: "add_to_list", target: { kind: "list", reference: "groceries" }, parameters: { ingredientsOf: "that" } }), mealEnv({ conversation: [planned] }));
    expect(grounded.kind === "grounded" && grounded.intent.parameters).toMatchObject({ items: ["pasta", "tomatoes", "basil"], forMeal: "Tomato pasta" });
    expect(grounded.kind === "grounded" && grounded.intent.parameters.ingredientsOf).toBeUndefined();
  });

  it("with no recipe on record it asks what to add, rather than inventing ingredients", async () => {
    const grounded = await groundIntent(intent({ action: "add_to_list", target: { kind: "list", reference: "groceries" }, parameters: { ingredientsOf: "khichdi" } }), mealEnv());
    expect(grounded.kind === "clarify" && grounded.question).toMatch(/^I do not know what goes into khichdi/);
    expect(grounded.kind === "clarify" && grounded.awaiting).toBe("item");
  });

  it("\"remind me to buy them\" names what them was", async () => {
    const at = minutesAgo(0);
    const added: FocusEntity[] = [
      { entityType: "consumable", entityId: "c-1", label: "Milk", source: "action_result", at },
      { entityType: "consumable", entityId: "c-2", label: "Bananas", source: "action_result", at },
    ];
    const grounded = await groundIntent(
      intent({ action: "set_reminder", target: { kind: "outcome", reference: "reminders" }, parameters: { what: "buy them", when: "tomorrow" } }),
      mealEnv({ conversation: added }),
    );
    expect(grounded.kind === "grounded" && grounded.intent.parameters).toMatchObject({ what: "buy milk and bananas", whenResolved: expect.objectContaining({ date: "2026-09-24" }) });
  });

  it("a reminder with no time is one question", async () => {
    const grounded = await groundIntent(intent({ action: "set_reminder", target: { kind: "outcome", reference: "reminders" }, parameters: { what: "call the plumber" } }), mealEnv());
    expect(grounded.kind === "clarify" && grounded.awaiting).toBe("day");
  });
});
