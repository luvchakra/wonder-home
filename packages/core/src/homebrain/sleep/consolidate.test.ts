import { describe, expect, it } from "vitest";

import { clausesOf, pairKey, planSleep, resolvePerson, validUntilOf, type SleepMemory, type SleepPerson } from "./consolidate";
import { salienceOf } from "./salience";
import { partsOfThing } from "./similarity";

const people: SleepPerson[] = [
  { id: "kunal", displayName: "Kunal Mehta", memberType: "adult" },
  { id: "upasana", displayName: "Upasana", memberType: "adult" },
  { id: "asmi", displayName: "Asmi Mehta", memberType: "child" },
  { id: "manan", displayName: "Manan", memberType: "child" },
];

let next = 0;
function memory(statement: string | null, overrides: Partial<SleepMemory> = {}): SleepMemory {
  next += 1;
  return {
    id: `m${String(next).padStart(2, "0")}`,
    scope: "member",
    memberId: null,
    category: "preference",
    key: `pref.k${next}`,
    value: statement === null ? {} : { statement },
    status: "confirmed",
    tier: "active",
    salience: 1,
    validUntil: null,
    sourceType: "conversation",
    sourceId: null,
    confidence: 0.8,
    createdAt: "2026-10-18T06:00:00Z",
    updatedAt: "2026-10-18T06:00:00Z",
    recallCount: 0,
    lastRecalledAt: null,
    ...overrides,
  };
}

const options = { today: "2026-10-20", localDate: (iso: string) => iso.slice(0, 10) };

describe("a night's sleep over the owner's own pattern of notes", () => {
  const legacy = memory("Asmi likes pink pasta", { key: "asmi", memberId: "asmi", updatedAt: "2026-10-17T06:00:00Z" });
  const pink = memory("Asmi likes pink pasta", { key: "pref.asmi.pink.pasta", memberId: "asmi" });
  const empty = memory(null, { key: "asmita", scope: "household" });
  const compound = memory("Kunal likes North Indian food; Upasna likes Italian and French food", { key: "kunal", memberId: "kunal" });
  const northIndian = memory("Kunal likes North Indian food", { key: "pref.kunal.north.indian.food", memberId: "kunal" });
  const italian = memory("Upasana likes Italian food", { key: "pref.upasana.italian.food", memberId: "upasana" });
  const french = memory("Upasana likes French food", { key: "pref.upasana.french.food", memberId: "upasana" });
  const pastaAndPizza = memory("Asmi likes pasta and pizza", { key: "pref.asmi.pasta.and.pizza", memberId: "asmi" });
  const pasta = memory("Asmi likes pasta", { key: "pref.asmi.pasta", memberId: "asmi" });
  const pizza = memory("Asmi likes pizza", { key: "pref.asmi.pizza", memberId: "asmi" });
  const plan = planSleep([legacy, pink, empty, compound, northIndian, italian, french, pastaAndPizza, pasta, pizza], people, options);
  const of = (kind: string) => plan.operations.filter((operation) => operation.kind === kind);

  it("folds the old-style note into the one keyed as a preference", () => {
    expect(of("merged")).toContainEqual(expect.objectContaining({ keep: pink.id, drop: [legacy.id] }));
  });

  it("lets go of a note that says nothing", () => {
    expect(of("expired")).toContainEqual(expect.objectContaining({ id: empty.id, reason: "empty" }));
  });

  it("reads a sentence about two people as three facts, all already known, and writes nothing again", () => {
    const split = of("split").find((operation) => operation.kind === "split" && operation.drop === compound.id);
    expect(split).toMatchObject({ create: [], known: ["Kunal likes North Indian food", "Upasana likes Italian food", "Upasana likes French food"] });
  });

  it("folds 'pasta and pizza' into the two notes that already say it", () => {
    expect(of("split")).toContainEqual(expect.objectContaining({ drop: pastaAndPizza.id, create: [], known: ["Asmi likes pasta", "Asmi likes pizza"] }));
  });

  it("keeps pasta and pink pasta apart: one is more particular than the other", () => {
    const touched = plan.operations.flatMap((operation) => (operation.kind === "merged" ? [operation.keep, ...operation.drop] : []));
    expect(touched).not.toContain(pasta.id);
  });

  it("never touches a memory twice", () => {
    const dropped = plan.operations.flatMap((operation) => (operation.kind === "merged" ? operation.drop : operation.kind === "split" ? [operation.drop] : operation.kind === "expired" ? [operation.id] : []));
    expect(new Set(dropped).size).toBe(dropped.length);
  });
});

describe("splitting, creating and resolving", () => {
  it("writes the parts not yet known, under the right person", () => {
    const plan = planSleep([memory("Kunal likes dosa; Upasna likes sushi", { memberId: "kunal" })], people, options);
    const split = plan.operations.find((operation) => operation.kind === "split");
    expect(split).toMatchObject({
      create: [
        { memberId: "kunal", statement: "Kunal likes dosa", key: "pref.kunal.dosa" },
        { memberId: "upasana", statement: "Upasana likes sushi", key: "pref.upasana.sushi" },
      ],
    });
  });

  it("reads a name said one letter off as the one member it can mean, and never guesses between two", () => {
    expect(resolvePerson("Upasna", people)?.id).toBe("upasana");
    expect(resolvePerson("Mana", [...people, { id: "maya", displayName: "Maya", memberType: "child" }])).toBeNull();
    expect(resolvePerson("Bob", people)).toBeNull();
  });

  it("gives a household note about a family member to that member", () => {
    const note = memory("Manan likes cricket", { scope: "household", memberId: null, key: "pref.manan.cricket" });
    const plan = planSleep([note], people, options);
    expect(plan.operations).toContainEqual({ kind: "reattributed", id: note.id, memberId: "manan", statement: "Manan likes cricket" });
  });

  it("leaves a sentence it cannot read untouched and asks a model about the clause", () => {
    const odd = memory("Weekends are for the farmhouse; Asmi likes swimming", { memberId: "asmi" });
    const plan = planSleep([odd], people, options);
    expect(plan.operations.filter((operation) => operation.kind === "split")).toEqual([]);
    expect(plan.unread).toEqual([{ memoryId: odd.id, clause: "Weekends are for the farmhouse" }]);
  });

  it("uses a model's reading of that clause on the next pass", () => {
    const odd = memory("Kunal is a fan of dal makhani; Asmi likes swimming", { memberId: "asmi" });
    const plan = planSleep([odd], people, { ...options, readByModel: new Map([["Kunal is a fan of dal makhani", [{ subject: "Kunal", stance: "likes" as const, object: "dal makhani" }]]]) });
    expect(plan.operations.find((operation) => operation.kind === "split")).toMatchObject({ byModel: true, create: [{ statement: "Kunal likes dal makhani" }, { statement: "Asmi likes swimming" }] });
  });

  it("keeps a dish named with 'and' whole unless its parts are already known", () => {
    const dish = memory("Asmi likes mac and cheese", { memberId: "asmi", key: "pref.asmi.mac.and.cheese" });
    expect(planSleep([dish], people, options).operations.filter((operation) => operation.kind === "split")).toEqual([]);
  });

  it("splits clauses and carries a shared last word to each part", () => {
    expect(clausesOf("Kunal likes North Indian food; Upasna likes Italian and French food")).toEqual(["Kunal likes North Indian food", "Upasna likes Italian and French food"]);
    expect(clausesOf("Asmi likes pasta and Manan likes rice")).toEqual(["Asmi likes pasta", "Manan likes rice"]);
    expect(partsOfThing("Italian and French food")).toEqual(["Italian food", "French food"]);
    expect(partsOfThing("pasta and pizza")).toEqual(["pasta", "pizza"]);
    expect(partsOfThing("mac and cheese")).toEqual(["mac", "cheese"]);
  });
});

describe("conflicts, meaning, time and rest", () => {
  it("puts the same thing liked and disliked by one person to a person, and changes neither", () => {
    const likes = memory("Asmi likes mushrooms", { memberId: "asmi", key: "pref.asmi.mushroom" });
    const dislikes = memory("Asmi doesn't like mushroom", { memberId: "asmi", key: "pref.asmi.mushroom.x" });
    const plan = planSleep([likes, dislikes], people, options);
    expect(plan.operations).toContainEqual(expect.objectContaining({ kind: "conflict", ids: [likes.id, dislikes.id].sort() }));
    expect(plan.operations.some((operation) => operation.kind === "merged")).toBe(false);
  });

  it("merges by meaning only when near-certain, and asks a model when close", () => {
    const a = memory("Asmi likes pink sauce pasta", { memberId: "asmi", key: "pref.asmi.pink.sauce.pasta" });
    const b = memory("Asmi likes pasta in pink sauce", { memberId: "asmi", key: "pref.asmi.pasta.in.pink", updatedAt: "2026-10-19T06:00:00Z" });
    const close = planSleep([a, b], people, { ...options, similarity: () => 0.9 });
    expect(close.borderline).toEqual([{ a: a.id, b: b.id, similarity: 0.9 }]);
    expect(close.operations.some((operation) => operation.kind === "merged")).toBe(false);
    const judged = planSleep([a, b], people, { ...options, similarity: () => 0.9, judged: new Map([[pairKey(a.id, b.id), true]]) });
    expect(judged.operations).toContainEqual(expect.objectContaining({ kind: "merged", keep: b.id, drop: [a.id], byModel: true }));
    // A real night scored "sushi" and "sushi rolls" above 0.95: that is still the model's call.
    const related = planSleep([a, b], people, { ...options, similarity: () => 0.96 });
    expect(related.borderline).toHaveLength(1);
    expect(related.operations.some((operation) => operation.kind === "merged")).toBe(false);
    const certain = planSleep([a, b], people, { ...options, similarity: () => 0.99 });
    expect(certain.operations).toContainEqual(expect.objectContaining({ kind: "merged", byModel: false }));
  });

  it("lets a note about a day that has passed expire, but never one that matters for health", () => {
    const away = memory("Rekha is away this week", { category: "fact", key: "rekha.away", createdAt: "2026-10-05T06:00:00Z" });
    const allergy = memory("Asmi is allergic to peanuts this week", { memberId: "asmi", key: "pref.asmi.peanut", createdAt: "2026-10-05T06:00:00Z" });
    const plan = planSleep([away, allergy], people, options);
    expect(plan.operations).toContainEqual({ kind: "expired", id: away.id, reason: "past", statement: "Rekha is away this week" });
    expect(plan.operations.some((operation) => operation.kind === "expired" && operation.id === allergy.id)).toBe(false);
    expect(validUntilOf("Back tomorrow", "2026-10-19")).toBe("2026-10-20");
    expect(validUntilOf("Asmi likes pasta", "2026-10-19")).toBeNull();
  });

  it("rests what nobody has used in months, never a vital fact, and wakes what is used again", () => {
    const old = memory("Kunal likes jazz", { memberId: "kunal", key: "pref.kunal.jazz", updatedAt: "2026-06-01T06:00:00Z" });
    const vital = memory("Manan is allergic to cashews", { memberId: "manan", key: "pref.manan.cashew", updatedAt: "2026-06-01T06:00:00Z" });
    const resting = memory("Kunal likes blues", { memberId: "kunal", key: "pref.kunal.blue", tier: "resting", updatedAt: "2026-09-01T06:00:00Z", lastRecalledAt: "2026-10-19T06:00:00Z" });
    const plan = planSleep([old, vital, resting], people, options);
    expect(plan.operations).toContainEqual({ kind: "rested", id: old.id, statement: "Kunal likes jazz" });
    expect(plan.operations.some((operation) => operation.kind === "rested" && operation.id === vital.id)).toBe(false);
    expect(plan.operations).toContainEqual({ kind: "woke", id: resting.id });
  });

  it("tags what matters most", () => {
    expect(salienceOf({ value: { statement: "Asmi is allergic to peanuts", stance: "allergic" } })).toBe(3);
    expect(salienceOf({ value: { statement: "Manan takes his inhaler before football" } })).toBe(3);
    expect(salienceOf({ value: { statement: "We never eat after 9pm" } })).toBe(2);
    expect(salienceOf({ value: { statement: "Asmi likes pasta" } })).toBe(1);
    expect(salienceOf({ value: {} })).toBe(0);
  });
});
