import { describe, expect, it } from "vitest";

import { consentTier, decideForRequest, isUndo } from "./consent";
import { replyFor } from "./engine";
import type { HouseholdIntent } from "./intent";
import { proposeFromIntent } from "./proposal";
import { readPlan } from "./rules";

const adult = { memberId: "k", roles: ["head" as const], memberType: "adult" as const };
const child = { memberId: "a", roles: ["child" as const], memberType: "child" as const };

function intent(action: HouseholdIntent["action"], parameters: Record<string, unknown> = {}, target: HouseholdIntent["target"] = { kind: "unspecified" }): HouseholdIntent {
  return { action, actorMemberId: "k", target, parameters, confidence: 0.9, channel: "voice", utterance: "" };
}

describe("conversational consent (HomeBrain 4.0 §3.9)", () => {
  it("an adult's everyday request is the consent", () => {
    for (const action of ["add_to_list", "set_reminder", "plan_event", "plan_meal", "set_stock", "mark_bought", "complete_school_item"] as const) {
      expect(consentTier(intent(action), adult), action).toBe("act");
    }
  });

  it("asks once in the conversation when other people are involved", () => {
    expect(consentTier(intent("plan_event", { guests: ["Sharmas"] }), adult)).toBe("confirm");
    expect(consentTier(intent("record_absence", {}, { kind: "member", reference: "u" }), adult)).toBe("confirm");
    expect(consentTier(intent("record_absence", {}, { kind: "member", reference: "k" }), adult)).toBe("act");
    expect(consentTier(intent("adjust_schedule"), adult)).toBe("confirm");
    expect(consentTier(intent("plan_event", { groundedConfidence: "medium" }), adult)).toBe("confirm");
  });

  it("paying and ordering are never done because someone asked", () => {
    expect(consentTier(intent("make_payment"), adult)).toBe("step_up");
    expect(consentTier(intent("order_items"), adult)).toBe("step_up");
    const paid = proposeFromIntent(intent("make_payment", { amount: 100, payee: "BSES" }, { kind: "bill", reference: "electricity" }), { actor: { ...adult, roles: ["head"] }, autonomy: "execute", entitled: true, requestedBy: "person" });
    expect(paid.kind).not.toBe("executed");
  });

  it("a child's request follows the household's autonomy, as before", () => {
    expect(consentTier(intent("plan_event"), child)).toBeNull();
    const asked = proposeFromIntent(intent("plan_event", { what: "sleepover" }), { actor: child, autonomy: "prepare", entitled: true, requestedBy: "person" });
    expect(asked.kind).not.toBe("executed");
  });

  it("a child's request never writes on its own: an adult gives the final OK, even where the outcome would execute", () => {
    const asked = proposeFromIntent(intent("add_to_list", { items: ["eggs"] }, { kind: "list", reference: "groceries" }), { actor: child, autonomy: "execute", entitled: true, requestedBy: "person" });
    expect(asked.kind).toBe("needs_approval");
    expect(replyFor(asked, true)).toMatch(/grown-up/);
    expect(replyFor(asked)).toMatch(/Shall I go ahead\?/);
  });

  it("a plan the person asked for runs, whatever the outcome's autonomy says", () => {
    const planned = proposeFromIntent(intent("plan_event", { what: "movie night" }, { kind: "event", reference: "movie_night" }), { actor: adult, autonomy: "prepare", entitled: true, requestedBy: "person" });
    expect(planned.kind).toBe("executed");
  });

  it("an agent's step still follows autonomy alone: on prepare it waits for a yes", () => {
    const step = proposeFromIntent(intent("plan_event", { what: "movie night" }, { kind: "event", reference: "movie_night" }), { actor: adult, autonomy: "prepare", entitled: true });
    expect(step.kind).toBe("needs_approval");
  });

  it("'Ask before acting on what I say' turns every act into one question", () => {
    expect(decideForRequest({ tier: "act", mode: "prepare", action: { outcomeKey: "x", kind: "schedule", reversible: true }, confirmRequested: true }).outcome).toBe("needs_approval");
    expect(decideForRequest({ tier: "act", mode: "prepare", action: { outcomeKey: "x", kind: "schedule", reversible: true }, confirmRequested: false }).outcome).toBe("execute");
    // The floor stays: a payment always needs a person.
    expect(decideForRequest({ tier: "act", mode: "execute", action: { outcomeKey: "x", kind: "payment", reversible: false }, confirmRequested: false }).outcome).toBe("needs_approval");
  });

  it("hears undo, and nothing that merely contains the word", () => {
    for (const said of ["undo", "Undo that", "take it back", "scratch that", "cancel that"]) expect(isUndo(said), said).toBe(true);
    for (const said of ["undo the milk order and add bread", "cancel the dentist", "can you undo"]) expect(isUndo(said), said).toBe(false);
  });
});

describe("reading a plan (the owner's report, 2026-10-18)", () => {
  it("keeps the day out of the name, and the time of day comes from the name", () => {
    expect(readPlan("a movie night on Friday this week")).toEqual({ what: "a movie night", window: "this friday night", guests: [] });
    expect(readPlan("dinner party Saturday and invite the Sharmas")).toEqual({ what: "dinner party", window: "saturday night", guests: ["Sharmas"] });
    expect(readPlan("something for saturday evening")).toEqual({ what: "something", window: "saturday evening", guests: [] });
    expect(readPlan("a picnic")).toEqual({ what: "a picnic", window: null, guests: [] });
    expect(readPlan("lunch tomorrow")).toEqual({ what: "lunch", window: "tomorrow afternoon", guests: [] });
  });
});
