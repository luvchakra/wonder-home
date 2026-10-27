import { describe, expect, it } from "vitest";

import { answerClarification, leavesQuestion, type PendingClarification } from "../conversation/clarify";
import { normaliseUtterance } from "../conversation/normalise";
import { en } from "../i18n/messages/en";
import { hi } from "../i18n/messages/hi";
import { translator } from "../i18n/translate";
import { choicesFor, combinedSay, onlyAsked, readChoices, suggestedAmounts, type ChoiceContext, type HomeTalkChoices } from "./choices";
import { readDetailAnswer } from "./detail-answers";
import { memberNamedInReply } from "./intake-questions";

/**
 * The answers HomeTalk offers to pick (principle 20, the owner 2026-10-26).
 * Expected results are written first, then each `say` is read back through
 * the engine's own clarify step: picking a choice must be the same answer as
 * typing those words.
 */

const t = translator("en", en);
// Monday 26 Oct 2026, 10:00 in Kolkata.
const MONDAY = new Date("2026-10-26T04:30:00Z");
const context: ChoiceContext = {
  t,
  now: MONDAY,
  timezone: "Asia/Kolkata",
  people: ["Asmi", "Manan", "Kunal"],
  amounts: { "coconut oil": [{ quantity: 500, unit: "ml" }, { quantity: 1, unit: "l" }, { quantity: 2, unit: "l" }] },
};
const actor = { actorMemberId: "m-1", channel: "text" as const };

function pending(over: Partial<PendingClarification> & Pick<PendingClarification, "action" | "parameters">): PendingClarification {
  return { target: { kind: "unspecified" }, question: "?", utterance: "", asked: 1, ...over };
}

const quantity = pending({
  action: "add_to_list",
  target: { kind: "list", reference: "groceries" },
  parameters: { item: "coconut oil", items: ["coconut oil"], awaiting: "quantity", quantityFor: ["coconut oil"] },
  question: "How much coconut oil should I add? For example 1 litre or 500 ml.",
});
const intake = (field: string, kind = "grocery_item", extra: Record<string, unknown> = {}) =>
  pending({ action: "complete_homesend_item", parameters: { itemId: "hs-1", kind, field, asked: [field], ...extra } });

const labels = (set: HomeTalkChoices | null) => set?.choices.map((choice) => choice.label) ?? [];
const says = (set: HomeTalkChoices | null) => set?.choices.map((choice) => choice.say) ?? [];

describe("the choice set for each kind of question", () => {
  it("an amount: the item's practical amounts from the catalog, then Skip", () => {
    const set = choicesFor(quantity, context);
    expect(set?.mode).toBe("single");
    expect(labels(set)).toEqual(["500 ml", "1 litre", "2 litres", "Skip"]);
    expect(says(set)).toEqual(["500 ml", "1 litre", "2 litres", "skip"]);
  });

  it("an amount for something already on the list: That's enough instead of Skip", () => {
    const set = choicesFor({ ...quantity, question: 'Coconut oil is already on your shopping list (1 L). How much more should I add? Or say "that\'s enough" to leave it.' }, context);
    expect(labels(set).at(-1)).toBe("That's enough");
    expect(says(set).at(-1)).toBe("that's enough");
  });

  it("a unit question (1 litre of something kept in bottles, 25-038): grounding's choices, the switch labelled in the person's language", () => {
    const asked = pending({ action: "add_to_list", parameters: { item: "coconut oil", awaiting: "quantity", quantityFor: ["coconut oil"], unitAsk: { itemId: "c", unit: "l", said: "1 litre coconut oil" }, choices: ["1 bottle", "2 bottles", "Count it in litres instead"] } });
    expect(choicesFor(asked, context)?.choices).toEqual([{ label: "1 bottle", say: "1 bottle" }, { label: "2 bottles", say: "2 bottles" }, { label: "Count it in litres instead", say: "Count it in litres instead" }]);
    expect(labels(choicesFor(asked, { ...context, t: translator("hi", hi) }))).toEqual(["1 बोतल", "2 बोतल", "इसे लीटर में गिनें"]);
  });

  it("several amounts at once: 1 of each, 2 of each", () => {
    const set = choicesFor(pending({ action: "add_to_list", parameters: { items: ["milk", "eggs"], awaiting: "quantity", quantityFor: ["milk", "eggs"] } }), context);
    expect(says(set)).toEqual(["1 of each", "2 of each", "skip"]);
  });

  it("an amount HomeSend needs, from the item's title", () => {
    const set = choicesFor(intake("quantity", "grocery_item", { title: "Coconut oil" }), context);
    expect(says(set)).toEqual(["500 ml", "1 litre", "2 litres", "skip"]);
  });

  it("an amount with nothing known about the item: just Skip, and the text box", () => {
    expect(says(choicesFor(intake("quantity", "grocery_item", { title: "Mystery thing" }), context))).toEqual(["skip"]);
  });

  it("who it is for: the household's names (the candidates when grounding narrowed them)", () => {
    expect(says(choicesFor(pending({ action: "assign_responsibility", parameters: { awaiting: "member" } }), context))).toEqual(["Asmi", "Manan", "Kunal"]);
    const narrowed = pending({
      action: "assign_responsibility",
      parameters: {
        awaiting: "member",
        candidates: [
          { entityType: "member", entityId: "a", label: "Asmi Sharma", source: "clarification", at: "2026-10-26T00:00:00Z" },
          { entityType: "member", entityId: "b", label: "Asmi Rao", source: "clarification", at: "2026-10-26T00:00:00Z" },
        ],
      },
    });
    expect(says(choicesFor(narrowed, context))).toEqual(["Asmi Sharma", "Asmi Rao"]);
    expect(says(choicesFor(intake("child", "school_item", { choices: [{ id: "c1", displayName: "Asmi Sharma" }, { id: "c2", displayName: "Manan Sharma" }] }), context))).toEqual(["Asmi", "Manan", "skip"]);
  });

  it("a day ahead: Today, Tomorrow, the next weekend day, Another day…", () => {
    const set = choicesFor(pending({ action: "set_reminder", parameters: { awaiting: "day", what: "call the plumber" } }), context);
    expect(labels(set)).toEqual(["Today", "Tomorrow", "Saturday", "Another day…"]);
    expect(says(set)).toEqual(["today", "tomorrow", "saturday", null]);
    // Friday's tomorrow is Saturday already, so Sunday; Saturday's tomorrow is Sunday, so no third day.
    expect(says(choicesFor(pending({ action: "set_reminder", parameters: { awaiting: "day" } }), { ...context, now: new Date("2026-10-30T04:30:00Z") }))).toEqual(["today", "tomorrow", "sunday", null]);
    expect(says(choicesFor(pending({ action: "set_reminder", parameters: { awaiting: "day" } }), { ...context, now: new Date("2026-10-31T04:30:00Z") }))).toEqual(["today", "tomorrow", null]);
  });

  it("a date already gone (a receipt): Today, Yesterday, Another day…, Skip", () => {
    expect(says(choicesFor(intake("date", "receipt"), context))).toEqual(["today", "yesterday", null, "skip"]);
  });

  it("a time: a few common times, Another time…, Skip", () => {
    const set = choicesFor(intake("time", "event"), context);
    expect(labels(set)).toEqual(["9 am", "12 pm", "4 pm", "6 pm", "Another time…", "Skip"]);
  });

  it("a record type: prescription, lab report, scan, vaccination, something else — marked health", () => {
    const set = choicesFor(intake("recordType", "health_document"), context);
    expect(labels(set)).toEqual(["Prescription", "Lab report", "Scan", "Vaccination", "Something else", "Skip"]);
    expect(set?.health).toBe(true);
    expect(choicesFor(intake("person", "health_document", { choices: [{ id: "a", displayName: "Asmi" }, { id: "b", displayName: "Kunal" }] }), context)?.health).toBe(true);
  });

  it("a yes-or-no offer: Yes, Not now", () => {
    expect(labels(choicesFor(pending({ action: "fill_homesend_details", parameters: { itemIds: ["hs-1"] } }), context))).toEqual(["Yes", "Not now"]);
  });

  it("which item: the candidates", () => {
    const set = choicesFor(
      pending({
        action: "add_to_list",
        parameters: {
          awaiting: "referent",
          candidates: [
            { entityType: "consumable", entityId: "1", label: "Coconut oil", source: "clarification", at: "2026-10-26T00:00:00Z" },
            { entityType: "consumable", entityId: "2", label: "Mustard oil", source: "clarification", at: "2026-10-26T00:00:00Z" },
          ],
        },
      }),
      context,
    );
    expect(says(set)).toEqual(["Coconut oil", "Mustard oil"]);
  });

  it("several waiting items: checkboxes for which to fill in, with Not now beside Send", () => {
    const set = choicesFor(pending({ action: "fill_homesend_details", parameters: { itemIds: ["a", "b"], titles: [{ id: "a", title: "Maths worksheet" }, { id: "b", title: "Diwali dinner" }] } }), context);
    expect(set).toEqual({ mode: "multi", choices: [{ label: "Maths worksheet", say: "Maths worksheet" }, { label: "Diwali dinner", say: "Diwali dinner" }], also: [{ label: "Not now", say: "not now" }] });
  });

  it("a free-text question (a title, an amount of money) offers nothing", () => {
    expect(choicesFor(intake("title", "school_item"), context)).toBeNull();
    expect(choicesFor(intake("amount", "bill"), context)).toBeNull();
  });

  it("labels are in the person's language; what a pick sends stays HomeTalk's English", () => {
    const set = choicesFor(pending({ action: "set_reminder", parameters: { awaiting: "day" } }), { ...context, t: translator("hi", hi) });
    expect(labels(set)).toEqual(["आज", "कल", "शनिवार", "कोई और दिन…"]);
    expect(says(set)).toEqual(["today", "tomorrow", "saturday", null]);
  });
});

describe("every choice reads back as the same answer (answerClarification)", () => {
  it("an amount puts the amount in front of the item; Skip and That's enough leave it", () => {
    expect(answerClarification(quantity, "1 litre", actor)?.parameters).toMatchObject({ item: "1 litre coconut oil", items: ["1 litre coconut oil"] });
    expect(answerClarification(quantity, "500 ml", actor)?.parameters).toMatchObject({ item: "500 ml coconut oil" });
    expect(answerClarification(quantity, "skip", actor)?.parameters).toMatchObject({ keepAsIs: true });
    expect(answerClarification(quantity, "that's enough", actor)?.parameters).toMatchObject({ keepAsIs: true });
  });

  it("N of each gives every item its amount", () => {
    const several = pending({ action: "add_to_list", target: { kind: "list", reference: "groceries" }, parameters: { items: ["milk", "eggs"], awaiting: "quantity", quantityFor: ["milk", "eggs"] } });
    expect(answerClarification(several, "2 of each", actor)?.parameters.items).toEqual(["2 milk", "2 eggs"]);
  });

  it("a name, a day and a candidate are each taken as that answer", () => {
    const who = pending({ action: "assign_responsibility", parameters: { awaiting: "member" } });
    expect(answerClarification(who, "Manan", actor)?.target).toEqual({ kind: "member", reference: "manan" });
    const when = pending({ action: "set_reminder", parameters: { awaiting: "day", what: "call the plumber" } });
    for (const say of ["today", "tomorrow", "saturday", "sunday"]) expect(answerClarification(when, say, actor)?.parameters.when).toBe(say);
    const which = pending({
      action: "add_to_list",
      parameters: { awaiting: "referent", candidates: [{ entityType: "consumable", entityId: "1", label: "Coconut oil", source: "clarification", at: "2026-10-26T00:00:00Z" }, { entityType: "consumable", entityId: "2", label: "Mustard oil", source: "clarification", at: "2026-10-26T00:00:00Z" }] },
    });
    expect(answerClarification(which, "Mustard oil", actor)?.parameters.item).toBe("Mustard oil");
  });

  it("every HomeSend detail choice is read as that detail, or as skip", () => {
    const now = MONDAY;
    const read = (kind: Parameters<typeof readDetailAnswer>[0], field: Parameters<typeof readDetailAnswer>[1], say: string) => readDetailAnswer(kind, field, say, { timezone: "Asia/Kolkata", now });
    const sets: [Parameters<typeof readDetailAnswer>[0], Parameters<typeof readDetailAnswer>[1], Record<string, unknown>][] = [
      ["grocery_item", "quantity", { title: "Coconut oil" }],
      ["school_item", "dueDate", {}],
      ["receipt", "date", {}],
      ["event", "time", {}],
      ["health_document", "recordType", {}],
    ];
    for (const [kind, field, extra] of sets) {
      const asked = intake(field, kind, extra);
      for (const choice of choicesFor(asked, context)!.choices) {
        if (choice.say === null) continue;
        const intent = answerClarification(asked, choice.say, actor);
        expect(intent, `${field}: ${choice.say}`).toMatchObject({ action: "complete_homesend_item", parameters: { answer: choice.say } });
        expect(read(kind, field, choice.say), `${field}: ${choice.say}`).not.toBeNull();
        if (choice.say === "skip") expect(read(kind, field, choice.say)).toBe("skip");
      }
    }
    expect(read("health_document", "recordType", "lab report")).toEqual({ healthRecordType: "lab_result" });
    expect(read("receipt", "date", "yesterday")).toEqual({ documentDate: "2026-10-25" });
    expect(read("event", "time", "6 pm")).toMatchObject({ dueTime: "18:00" });
  });

  it("a name picked for who an item is for is that person", () => {
    const people = [{ id: "c1", displayName: "Asmi Sharma" }, { id: "c2", displayName: "Manan Sharma" }];
    const asked = intake("child", "school_item", { choices: people });
    for (const choice of choicesFor(asked, context)!.choices) {
      if (choice.say === "skip") continue;
      expect(answerClarification(asked, choice.say!, actor)?.parameters.answer).toBe(choice.say);
      expect(memberNamedInReply(choice.say!, people)?.displayName).toContain(choice.say!);
    }
  });

  it("the offer: Yes fills them all in, Not now leaves them, ticked titles fill in just those", () => {
    const offer = pending({ action: "fill_homesend_details", parameters: { itemIds: ["a", "b", "c"], titles: [{ id: "a", title: "Maths worksheet" }, { id: "b", title: "Diwali dinner" }, { id: "c", title: "Dentist bill" }] } });
    expect(answerClarification(offer, "yes", actor)?.parameters).toEqual({ itemIds: ["a", "b", "c"] });
    expect(answerClarification(offer, "not now", actor)?.parameters).toEqual({ itemIds: ["a", "b", "c"], decline: true });
    expect(answerClarification(offer, combinedSay(["Maths worksheet", "Dentist bill"]), actor)?.parameters).toEqual({ itemIds: ["a", "c"] });
    expect(answerClarification(offer, "Diwali dinner", actor)?.parameters).toEqual({ itemIds: ["b"] });
    // A title with "and" in it is one title.
    const bread = pending({ action: "fill_homesend_details", parameters: { itemIds: ["a", "b"], titles: [{ id: "a", title: "Bread and butter" }, { id: "b", title: "Milk" }] } });
    expect(answerClarification(bread, "Bread and butter", actor)?.parameters).toEqual({ itemIds: ["a"] });
    expect(answerClarification(bread, combinedSay(["Bread and butter", "Milk"]), actor)?.parameters).toEqual({ itemIds: ["a", "b"] });
    // Something that isn't one of them is a new request, not a pick.
    expect(answerClarification(offer, "Maths worksheet and the car", actor)).toBeNull();
  });
});

describe("what a pick sends reaches the engine as it is", () => {
  // The engine reads a turn after `normaliseUtterance` (HT-167: "not now" lost its "now" and was not read as an answer).
  it("normalising never changes a choice's words", () => {
    const sets = [
      choicesFor(quantity, context),
      choicesFor({ ...quantity, question: 'How much more should I add? Or say "that\'s enough" to leave it.' }, context),
      choicesFor(pending({ action: "add_to_list", parameters: { items: ["milk", "eggs"], awaiting: "quantity", quantityFor: ["milk", "eggs"] } }), context),
      choicesFor(pending({ action: "set_reminder", parameters: { awaiting: "day" } }), context),
      choicesFor(intake("date", "receipt"), context),
      choicesFor(intake("time", "event"), context),
      choicesFor(intake("recordType", "health_document"), context),
      choicesFor(pending({ action: "fill_homesend_details", parameters: { itemIds: ["a"] } }), context),
      choicesFor(pending({ action: "fill_homesend_details", parameters: { itemIds: ["a", "b"], titles: [{ id: "a", title: "Maths worksheet" }, { id: "b", title: "Diwali dinner" }] } }), context),
    ];
    const said = sets.flatMap((set) => [...(set?.choices ?? []), ...(set?.also ?? [])]).flatMap((choice) => (choice.say ? [choice.say] : []));
    expect(said.length).toBeGreaterThan(20);
    for (const say of said) expect(normaliseUtterance(say).canonical, say).toBe(say);
    expect(normaliseUtterance(combinedSay(["Maths worksheet", "Diwali dinner"])).canonical).toBe("Maths worksheet and Diwali dinner");
  });
});

describe("a multi-select sends one combined answer", () => {
  it("joins the ticked answers in HomeTalk's English", () => {
    expect(combinedSay(["Maths worksheet"])).toBe("Maths worksheet");
    expect(combinedSay(["Maths worksheet", "Diwali dinner"])).toBe("Maths worksheet and Diwali dinner");
    expect(combinedSay(["A", "B", "C"])).toBe("A, B and C");
    expect(combinedSay([])).toBe("");
  });
});

describe("practical amounts from the catalog (the one rule for amounts, 25-037)", () => {
  it("a liquid in litres, a staple in kilos, counted things by the pack or one by one, a small pack by the pack", () => {
    expect(suggestedAmounts("Coconut oil", { catalogId: "x", unit: "l", category: "Oils & ghee", pack: null })).toEqual([{ quantity: 500, unit: "ml" }, { quantity: 1, unit: "l" }, { quantity: 2, unit: "l" }]);
    expect(suggestedAmounts("Atta", { catalogId: "x", unit: "kg", category: "Atta & flours", pack: null })).toEqual([{ quantity: 500, unit: "g" }, { quantity: 1, unit: "kg" }, { quantity: 2, unit: "kg" }]);
    expect(suggestedAmounts("Eggs", { catalogId: "x", unit: "pcs", category: "Dairy", pack: { quantity: 6, unit: "pcs" } })).toEqual([{ quantity: 6, unit: "pcs" }, { quantity: 12, unit: "pcs" }]);
    expect(suggestedAmounts("Coconut", { catalogId: "x", unit: "pcs", category: "Fruits", pack: null })).toEqual([1, 2, 3].map((quantity) => ({ quantity, unit: "pcs" })));
    expect(suggestedAmounts("Paneer", { catalogId: "x", unit: "g", category: "Dairy", pack: { quantity: 200, unit: "g" } })).toEqual([{ quantity: 200, unit: "g" }, { quantity: 400, unit: "g" }, { quantity: 800, unit: "g" }]);
    expect(suggestedAmounts("Anything", null)).toEqual([]);
  });

  it("each amount's say reads back as that amount of the item", () => {
    const asked = pending({ action: "add_to_list", target: { kind: "list", reference: "groceries" }, parameters: { item: "eggs", items: ["eggs"], awaiting: "quantity", quantityFor: ["eggs"] } });
    const set = choicesFor(asked, { ...context, amounts: { eggs: [{ quantity: 6, unit: "pcs" }, { quantity: 12, unit: "pcs" }] } });
    expect(labels(set)).toEqual(["6", "12", "Skip"]);
    expect(answerClarification(asked, "6", actor)?.parameters.item).toBe("6 eggs");
  });
});

describe("choices stored on a message", () => {
  it("are read back field by field; anything else is no choices", () => {
    const set = choicesFor(quantity, context)!;
    expect(readChoices(JSON.parse(JSON.stringify(set)))).toEqual(set);
    expect(readChoices({ mode: "single", choices: [] })).toBeNull();
    expect(readChoices({ mode: "dropdown", choices: [{ label: "x", say: "x" }] })).toBeNull();
    expect(readChoices({ mode: "single", choices: [{ label: "x", say: 3 }] })).toBeNull();
    expect(readChoices("yes")).toBeNull();
  });
});

describe("a turn that only asked shows no preview card", () => {
  it("filling in HomeSend details, and an answer that only led to the next question, are only asking", () => {
    expect(onlyAsked({ action: "fill_homesend_details", proposal: "executed", askedNext: true })).toBe(true);
    expect(onlyAsked({ action: "fill_homesend_details", proposal: "executed", askedNext: false })).toBe(true);
    expect(onlyAsked({ action: "complete_homesend_item", proposal: "executed", askedNext: true })).toBe(true);
    // The last answer hands the item back to HomeSend, which may add it: that is an effect.
    expect(onlyAsked({ action: "complete_homesend_item", proposal: "executed", askedNext: false })).toBe(false);
    expect(onlyAsked({ action: "add_to_list", proposal: "executed", askedNext: false })).toBe(false);
    expect(onlyAsked({ action: "fill_homesend_details", proposal: "clarify", askedNext: false })).toBe(false);
  });
});

// The owner, 2026-10-27: "How much maps link should I add?" offered only "Skip"; the tapped "Skip" became a
// HomeSend item and failed safely. Every pick, in every set, must be read by the question it belongs to.
describe("every choice set's say round-trips through its own question", () => {
  const candidates = [
    { entityType: "consumable", entityId: "1", label: "Coconut oil", source: "clarification", at: "2026-10-26T00:00:00Z" },
    { entityType: "consumable", entityId: "2", label: "Mustard oil", source: "clarification", at: "2026-10-26T00:00:00Z" },
  ];
  const people = [{ id: "c1", displayName: "Asmi Sharma" }, { id: "c2", displayName: "Manan Sharma" }];
  const sets: [string, PendingClarification][] = [
    ["amount, one item", quantity],
    ["amount, an item not in the catalog", pending({ action: "add_to_list", target: { kind: "list", reference: "groceries" }, parameters: { item: "maps link", awaiting: "quantity", quantityFor: ["maps link"] }, question: "How much maps link should I add? For example 1 litre, 1 kg or 2 packets." })],
    ["amount, already on the list", pending({ ...quantity, question: 'How much more should I add? Or say "that\'s enough" to leave it.' })],
    ["amount, several", pending({ action: "add_to_list", parameters: { items: ["milk", "eggs"], awaiting: "quantity", quantityFor: ["milk", "eggs"] } })],
    ["amount, in another unit", pending({ action: "add_to_list", parameters: { item: "coconut oil", awaiting: "quantity", quantityFor: ["coconut oil"], unitAsk: { itemId: "c", unit: "l", said: "1 litre coconut oil" }, choices: ["1 bottle", "2 bottles", "Count it in litres instead"] } })],
    ["who", pending({ action: "assign_responsibility", parameters: { awaiting: "member" } })],
    ["which day", pending({ action: "set_reminder", parameters: { awaiting: "day", what: "call the plumber" } })],
    ["which item", pending({ action: "add_to_list", parameters: { awaiting: "referent", candidates } })],
    ["the offer, one", pending({ action: "fill_homesend_details", parameters: { itemIds: ["hs-1"] } })],
    ["the offer, several", pending({ action: "fill_homesend_details", parameters: { itemIds: ["a", "b"], titles: [{ id: "a", title: "Maths worksheet" }, { id: "b", title: "Diwali dinner" }] } })],
    ["item: who it's for", intake("child", "school_item", { choices: people })],
    ["item: how much", intake("quantity", "grocery_item", { title: "Coconut oil" })],
    ["item: due", intake("dueDate", "school_item")],
    ["item: date", intake("date", "receipt")],
    ["item: time", intake("time", "event")],
    ["item: record type", intake("recordType", "health_document")],
  ];

  it("each set is offered, and each pick's words are an answer to it (or leave it, with nothing done)", () => {
    for (const [name, asked] of sets) {
      const set = choicesFor(asked, context);
      expect(set, name).not.toBeNull();
      for (const choice of [...set!.choices, ...(set!.also ?? [])]) {
        if (choice.say === null) continue;
        const answered = answerClarification(asked, choice.say, actor);
        expect(answered !== null || leavesQuestion(asked, choice.say), `${name}: ${choice.say}`).toBe(true);
      }
    }
  });

  it("\"skip\" to a how-much question is an answer that leaves the list as it is", () => {
    const maps = sets[1]![1];
    expect(says(choicesFor(maps, context))).toEqual(["skip"]);
    expect(answerClarification(maps, "skip", actor)?.parameters).toMatchObject({ keepAsIs: true });
  });

  it("every \"leave it\" is read by every question: its own way, or the question closes", () => {
    for (const word of ["skip", "Skip", "leave it", "never mind", "Nevermind.", "no thanks", "that's enough", "That’s enough!"]) {
      for (const [name, asked] of sets) {
        const answered = answerClarification(asked, word, actor);
        expect(answered !== null || leavesQuestion(asked, word), `${name}: ${word}`).toBe(true);
      }
      expect(answerClarification(quantity, word, actor)?.parameters, word).toMatchObject({ keepAsIs: true });
      expect(answerClarification(sets[8]![1], word, actor)?.parameters, word).toMatchObject({ decline: true });
      expect(readDetailAnswer("school_item", "dueDate", word, { timezone: "Asia/Kolkata", now: MONDAY }), word).toBe("skip");
    }
  });
});
