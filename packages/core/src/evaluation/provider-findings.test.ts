import { describe, expect, it } from "vitest";

import { groundIntakeDate, type IntakeExtraction } from "../ai/classify-intake";
import { DEFAULT_DATA_USE } from "../ai/privacy";
import { groundIntent } from "../conversation/grounding";
import type { HouseholdIntent } from "../conversation/intent";
import { localDateTime, pendingWords, roleWords } from "../conversation/moment";
import { proposeFromIntent } from "../conversation/proposal";
import type { ModelDraft } from "../homebrain/answer";
import { answerWithHomeBrain } from "../homebrain/turn";
import { adoptMatchedSubject, type SubjectResolution } from "../homesend/resolve";
import { contextItemsFor, GOLDEN_HOUSEHOLDS, groundingEnvFor, memberOf, peopleOf, viewerFor } from "./households";
import { BLANK_READING } from "./runners";

/**
 * Defects the configured-provider evaluation found (`npm run eval --
 * --provider configured` against Google Gemini, 23 Sep 2026: 31/45 before
 * these fixes, 45/45 after). Each is pinned here without a model, so the
 * deterministic suite keeps them fixed whichever provider runs next.
 */

const A = GOLDEN_HOUSEHOLDS.A;
const reference = { now: A.now, timezone: A.timezone };
const reading = (over: Partial<IntakeExtraction>): IntakeExtraction => ({ ...BLANK_READING, ...over });

describe("HomeSend dates: the model names the phrase, WonderHome decides the day", () => {
  it("resolves relative and year-less dates in the household's timezone", () => {
    expect(groundIntakeDate(reading({ kind: "school_item", title: "Maths worksheet", dateText: "tomorrow" }), reference).dueDate).toBe("2026-09-24");
    expect(groundIntakeDate(reading({ kind: "school_item", title: "Sports Day", dateText: "Saturday" }), reference).dueDate).toBe("2026-09-26");
    expect(groundIntakeDate(reading({ kind: "bill", title: "Rent", dateText: "due on 5 October" }), reference).dueDate).toBe("2026-10-05");
    expect(groundIntakeDate(reading({ kind: "health_document", title: "Dentist", dateText: "27 September" }), reference).documentDate).toBe("2026-09-27");
  });

  it("resolves against when the content was written, not when it is read", () => {
    const lastThursday = { now: new Date("2026-09-17T06:00:00Z"), timezone: A.timezone };
    expect(groundIntakeDate(reading({ kind: "school_item", title: "Worksheet", dateText: "tomorrow" }), lastThursday).dueDate).toBe("2026-09-18");
  });

  it("the resolved day wins over a date the model worked out itself", () => {
    const guessed = reading({ kind: "bill", title: "Rent", dueDate: "2025-10-05", dateText: "5 October" });
    expect(groundIntakeDate(guessed, reference).dueDate).toBe("2026-10-05");
  });

  it("keeps the model's full date when the phrase is not one it can read, and changes nothing without a timezone", () => {
    const odd = reading({ kind: "bill", title: "Water", dueDate: "2026-10-12", dateText: "the second Monday of next month" });
    expect(groundIntakeDate(odd, reference).dueDate).toBe("2026-10-12");
    const unanchored = reading({ kind: "school_item", title: "Worksheet", dateText: "tomorrow" });
    expect(groundIntakeDate(unanchored, { now: A.now, timezone: null }).dueDate).toBeNull();
  });

  it("never gives a grocery item or an unknown a date", () => {
    expect(groundIntakeDate(reading({ kind: "grocery_item", title: "Milk", dateText: "tomorrow" }), reference).dueDate).toBeNull();
  });
});

describe("HomeSend: whose item it is, from the record it matched", () => {
  const items = contextItemsFor(A, "a-kunal");
  const nobody: SubjectResolution = { said: null, selected: null, candidates: [], question: null };

  it("\"Your dentist appointment\" matched to Kunal's record is Kunal's", () => {
    expect(adoptMatchedSubject("health_document", nobody, "a-kunal", items).selected?.memberId).toBe("a-kunal");
  });

  it("never overrides a name the content used, a question already owed, or a kind that has no person", () => {
    const named: SubjectResolution = { said: "Upasana", selected: null, candidates: [], question: null };
    expect(adoptMatchedSubject("health_document", named, "a-kunal", items)).toBe(named);
    const asking: SubjectResolution = { said: null, selected: null, candidates: [{ memberId: "a-asmi", displayName: "Asmi", memberType: "child" }, { memberId: "a-manan", displayName: "Manan", memberType: "child" }], question: "Who is this for — Asmi or Manan?" };
    expect(adoptMatchedSubject("school_item", asking, "a-asmi", items)).toBe(asking);
    expect(adoptMatchedSubject("bill", nobody, "a-kunal", items)).toBe(nobody);
  });

  it("never makes a school item an adult's, or a health document a helper's", () => {
    expect(adoptMatchedSubject("school_item", nobody, "a-kunal", items).selected).toBeNull();
    expect(adoptMatchedSubject("health_document", nobody, "a-sunita", items).selected).toBeNull();
  });
});

describe("HomeTalk: what a model leaves out or misfiles", () => {
  const intent = (over: Partial<HouseholdIntent>): HouseholdIntent => ({
    action: "plan_meal",
    actorMemberId: "a-upasana",
    target: { kind: "unspecified" },
    parameters: {},
    confidence: 0.9,
    channel: "text",
    utterance: "",
    ...over,
  });

  it("\"Plan pasta for tonight\" with the day filed under the wrong parameter still lands on tonight", async () => {
    const grounded = await groundIntent(
      intent({ utterance: "Plan pasta for tonight", parameters: { what: "pasta", slot: "dinner", symptom: "tonight" } }),
      groundingEnvFor(A, "a-upasana"),
    );
    expect(grounded.kind).toBe("grounded");
    if (grounded.kind !== "grounded") return;
    expect((grounded.intent.parameters.whenResolved as { date: string }).date).toBe("2026-09-23");
    expect(grounded.intent.target).toEqual({ kind: "outcome", reference: "meals" });
  });

  it("a model that said the day is never second-guessed from the words", async () => {
    const grounded = await groundIntent(intent({ utterance: "Plan pasta for tonight", parameters: { what: "pasta", when: "tomorrow" } }), groundingEnvFor(A, "a-upasana"));
    expect(grounded.kind === "grounded" && (grounded.intent.parameters.whenResolved as { date: string }).date).toBe("2026-09-24");
  });

  it("a child asking to pay is refused before being asked which bill", () => {
    const payment = intent({ action: "make_payment", actorMemberId: "a-asmi", target: { kind: "unspecified" }, confidence: 0.5, utterance: "Pay the electricity bill" });
    const proposal = proposeFromIntent(payment, { actor: { roles: ["child"] }, autonomy: "approve", entitled: true });
    expect(proposal.kind).toBe("refused");
  });

  it("an adult with the same unclear request is still asked, and a plan that lacks the feature still says so after asking", () => {
    const payment = intent({ action: "make_payment", actorMemberId: "a-kunal", target: { kind: "unspecified" }, confidence: 0.5, utterance: "Pay it" });
    expect(proposeFromIntent(payment, { actor: { roles: ["head"] }, autonomy: "approve", entitled: true }).kind).toBe("clarify");
    expect(proposeFromIntent(payment, { actor: { roles: ["child"] }, autonomy: "approve", entitled: false }).kind).toBe("clarify");
  });

  it("the model is told the moment the same way in production and in evaluation", () => {
    expect(roleWords({ memberType: "child", roles: ["child"] })).toBe("a child of the household");
    expect(roleWords({ memberType: "adult", roles: ["head"] })).toBe("an adult who runs the household");
    expect(localDateTime(new Date("2026-09-23T04:30:00Z"), "Asia/Kolkata")).toBe("Wednesday 23 September 2026, 10:00 (Asia/Kolkata)");
    expect(pendingWords({ summary: "Science project" })).toBe('a yes or no on "Science project"');
    expect(pendingWords(null)).toBeNull();
  });
});

describe("HomeBrain: a withheld answer is never reported as \"not on record\"", () => {
  const kunal = memberOf(A, "a-kunal");
  const ask = (question: string, compose: (() => Promise<ModelDraft | null>) | null) =>
    answerWithHomeBrain({
      question,
      sentQuestion: question,
      previousQuestion: null,
      sentHistory: [],
      items: contextItemsFor(A, "a-kunal"),
      viewer: { memberId: kunal.id, roleLabel: "Adult", guardianOf: viewerFor(A, kunal.id).guardianOf },
      timezone: A.timezone,
      now: A.now,
      policy: DEFAULT_DATA_USE,
      people: peopleOf(A),
      compose: compose ? async () => compose() : null,
      factBudget: 12,
    });

  it("\"What does Asmi have tomorrow?\" answers from the record when Asmi's facts may not leave", async () => {
    let called = 0;
    const answer = await ask("What does Asmi have tomorrow?", async () => {
      called += 1;
      return { text: "I do not have any information about Asmi.", mode: "unknown", grounded: false, usedFacts: [] };
    });
    expect(called).toBe(0);
    expect(answer.source).toBe("deterministic");
    expect(answer.text).toMatch(/Maths worksheet/);
  });

  it("a model's \"unknown\" is not the last word when the record answers the question", async () => {
    const answer = await ask("When is the electricity bill due?", async () => ({ text: "I have no record of that.", mode: "unknown", grounded: false, usedFacts: [] }));
    expect(answer.text ?? "").not.toMatch(/no record of that/);
  });
});
