import { describe, expect, it } from "vitest";

import { resolveFixtureIntent } from "./fixtures";
import { attributeMemory, claimFor, extractMemory, isCorrection, isReviewable, parsePreference, reconcileMemory, reviewPlacementFor, type Memory } from "./memory";

const intentFor = (utterance: string) =>
  resolveFixtureIntent(utterance, { actorMemberId: "m-1", channel: "text" });

const memory = (over: Partial<Memory> = {}): Memory => ({
  scope: "household",
  memberId: null,
  category: "preference",
  key: "meals.dinner",
  value: { time: "20:00" },
  sourceType: "conversation",
  sourceId: "s-1",
  confidence: 0.9,
  status: "learned",
  ...over,
});

describe("extracting memory from what was said", () => {
  it("turns an explicit preference into a structured memory", () => {
    const extracted = extractMemory(intentFor("We prefer dinner at 8."), { sessionId: "s-1" });

    expect(extracted).toMatchObject({
      scope: "household",
      category: "preference",
      key: "meals.dinner",
      value: { time: "20:00" },
      sourceType: "conversation",
      status: "learned",
    });
  });

  it("records where it came from, so it can be reviewed later", () => {
    expect(extractMemory(intentFor("We prefer dinner at 8."), { sessionId: "s-42" })?.sourceId).toBe(
      "s-42",
    );
  });

  it("never records a statement as already confirmed", () => {
    const extracted = extractMemory(intentFor("We prefer dinner at 8."), { sessionId: "s-1" });
    // Saying something is strong evidence; certifying it is a separate act (module 05).
    expect(extracted?.status).toBe("learned");
    expect(extracted?.confidence).toBeLessThan(1);
  });

  it("extracts nothing from a request that is not a statement of preference", () => {
    expect(extractMemory(intentFor("Pay the electricity bill."), { sessionId: "s-1" })).toBeNull();
    expect(extractMemory(intentFor("How is Anaya's project coming along?"), { sessionId: "s-1" })).toBeNull();
  });

  it("scopes a memory to one member when asked to", () => {
    const extracted = extractMemory(intentFor("We prefer dinner at 8."), {
      sessionId: "s-1",
      householdScope: false,
    });
    expect(extracted?.scope).toBe("member");
    expect(extracted?.memberId).toBe("m-1");
  });

  it("does not store the correction flag as part of the value", () => {
    const extracted = extractMemory(intentFor("Actually, dinner is at 7:30."), { sessionId: "s-1" });
    expect(extracted?.value).toEqual({ time: "19:30" });
  });
});

describe("reconciling a new reading with what is already believed", () => {
  it("creates a memory when there is nothing yet", () => {
    expect(reconcileMemory(null, memory(), { statedByMember: true }).kind).toBe("create");
  });

  it("does nothing when the reading agrees", () => {
    expect(reconcileMemory(memory(), memory(), { statedByMember: true }).kind).toBe("unchanged");
  });

  it("lets a person correct themselves", () => {
    const update = reconcileMemory(memory(), memory({ value: { time: "19:30" } }), {
      statedByMember: true,
    });

    expect(update.kind).toBe("supersede");
    expect(update.kind === "supersede" && update.previous.status).toBe("superseded");
  });

  it("never lets an inference overwrite a confirmed fact", () => {
    const update = reconcileMemory(
      memory({ status: "confirmed" }),
      memory({ value: { time: "19:00" }, sourceType: "observed", confidence: 0.99 }),
      { statedByMember: false },
    );

    // Even at higher confidence, a pattern does not get to quietly disagree
    // with something the household certified.
    expect(update.kind).toBe("needs_review");
    expect(update.kind === "needs_review" && update.reason).toMatch(/confirmed/i);
  });

  it("lets a person override a confirmed fact, because they are the authority", () => {
    const update = reconcileMemory(
      memory({ status: "confirmed" }),
      memory({ value: { time: "19:30" } }),
      { statedByMember: true },
    );
    expect(update.kind).toBe("supersede");
  });

  it("lets a more confident inference replace a merely learned belief", () => {
    const update = reconcileMemory(
      memory({ confidence: 0.4 }),
      memory({ value: { time: "19:00" }, sourceType: "observed", confidence: 0.8 }),
      { statedByMember: false },
    );
    expect(update.kind).toBe("supersede");
  });

  it("keeps the existing belief when a weaker inference disagrees", () => {
    const update = reconcileMemory(
      memory({ confidence: 0.85 }),
      memory({ value: { time: "19:00" }, sourceType: "observed", confidence: 0.3 }),
      { statedByMember: false },
    );
    expect(update.kind).toBe("unchanged");
  });

  it("does not lose confidence when a person restates something more vaguely", () => {
    const update = reconcileMemory(
      memory({ confidence: 0.9 }),
      memory({ value: { time: "19:30" }, confidence: 0.6 }),
      { statedByMember: true },
    );
    expect(update.kind === "supersede" && update.memory.confidence).toBe(0.9);
  });
});

describe("corrections", () => {
  it("recognises a correction from the utterance itself", () => {
    expect(isCorrection(intentFor("Actually, dinner is at 7:30."))).toBe(true);
    expect(isCorrection(intentFor("We prefer dinner at 8."))).toBe(false);
  });
});

describe("someone's likes and dislikes (Wave 2 §8)", () => {
  it("keys every way of saying it to the same belief", () => {
    const first = parsePreference("Asmi doesn't like mushrooms");
    const later = parsePreference("Actually Asmi is okay with mushrooms now");
    expect(first).toMatchObject({ subject: "Asmi", object: "mushrooms", stance: "dislikes", key: "pref.asmi.mushroom", corrects: false });
    expect(later).toMatchObject({ subject: "Asmi", stance: "okay_with", key: "pref.asmi.mushroom", corrects: true });
  });

  it.each([
    ["Dad is allergic to peanuts", "allergic", "pref.dad.peanut"],
    ["Manan loves pasta", "likes", "pref.manan.pasta"],
    ["Asmi really likes the spicy chicken", "likes", "pref.asmi.spicy.chicken"],
    ["Mum can't eat gluten", "avoids", "pref.mum.gluten"],
    ["Asmi no longer likes broccoli", "dislikes", "pref.asmi.broccoli"],
    ["Kunal prefers tea", "prefers", "pref.kunal.tea"],
  ])("reads %j", (statement, stance, key) => {
    expect(parsePreference(statement)).toMatchObject({ stance, key });
  });

  it.each(["We like pasta", "It doesn't like the rain", "What does Asmi like?", "Add milk"])("leaves %j alone", (statement) => {
    expect(parsePreference(statement)).toBeNull();
  });

  it("puts a named person's preference on that person, and an allergy under safety", () => {
    const memory = extractMemory(
      { action: "set_preference", actorMemberId: "kunal", target: { kind: "outcome", reference: "pref.asmi.peanut" }, parameters: { statement: "Asmi is allergic to peanuts" }, confidence: 0.88, channel: "text", utterance: "Asmi is allergic to peanuts" },
      { sessionId: "s-1" },
    )!;
    expect(memory.key).toBe("pref.asmi.peanut");
    const attributed = attributeMemory(memory, [{ id: "asmi", displayName: "Asmi" }, { id: "kunal", displayName: "Kunal Mehta" }]);
    expect(attributed).toMatchObject({ scope: "member", memberId: "asmi" });
    expect(claimFor(attributed)).toBe("Asmi is allergic to peanuts.");
    expect(reviewPlacementFor(attributed)).toEqual({ category: "safety", risk: "high" });
  });

  it("keys a model's reading of the same sentence the same way as the rules'", () => {
    const fromModel = extractMemory(
      { action: "set_preference", actorMemberId: "kunal", target: { kind: "outcome", reference: "asmi_food_likes" }, parameters: { statement: "Asmi doesn't like mushrooms" }, confidence: 0.8, channel: "text", utterance: "Asmi doesn't like mushrooms" },
      { sessionId: "s-1" },
    )!;
    expect(fromModel.key).toBe("pref.asmi.mushroom");
  });
});

describe("what is worth putting up for review", () => {
  it("skips a memory with nothing in it", () => {
    expect(isReviewable({ value: {} })).toBe(false);
    expect(isReviewable({ value: { statement: "" } })).toBe(false);
    expect(isReviewable({ value: { statement: "dinner at 8" } })).toBe(true);
  });
});
