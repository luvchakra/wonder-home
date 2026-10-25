import { describe, expect, it } from "vitest";

import { groundIntakeDate, type IntakeExtraction } from "../ai/classify-intake";
import type { AnswerComposer, AnswerInput } from "../ai/model-client";
import { DEFAULT_DATA_USE, pseudonymiseText } from "../ai/privacy";
import type { Understanding } from "../conversation/engine";
import { groundIntent } from "../conversation/grounding";
import type { HouseholdIntent } from "../conversation/intent";
import { localDateTime, pendingWords, roleWords } from "../conversation/moment";
import { proposeFromIntent } from "../conversation/proposal";
import { rulesAnswerItself, sameRuleReading } from "../conversation/rules";
import { resolveTemporal } from "../conversation/temporal";
import type { ModelDraft } from "../homebrain/answer";
import { answerWithHomeBrain } from "../homebrain/turn";
import { adoptMatchedSubject, type SubjectResolution } from "../homesend/resolve";
import { contextItemsFor, GOLDEN_HOUSEHOLDS, groundingEnvFor, memberOf, peopleOf, viewerFor } from "./households";
import { GOLDEN_CASES } from "./cases";
import { BLANK_READING, runCase } from "./runners";

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

  it("reads a date the way a school writes it — weekday, date and time together (live E2E-001, 23 Sep 2026)", () => {
    const due = (dateText: string) => groundIntakeDate(reading({ kind: "school_item", title: "Sports Day", dateText }), reference).dueDate;
    expect(due("this Saturday, 26 September")).toBe("2026-09-26");
    expect(due("Saturday 26 September at 9:00 am")).toBe("2026-09-26");
    expect(due("on Monday 5th October 2026")).toBe("2026-10-05");
    expect(due("September 30th")).toBe("2026-09-30");
    expect(due("Saturday at 9am")).toBe("2026-09-26");
  });

  it("a weekday and a date that disagree decide nothing: the person fills it in", () => {
    // 26 September 2026 is a Saturday.
    expect(groundIntakeDate(reading({ kind: "school_item", title: "Sports Day", dateText: "Friday, 26 September" }), reference).dueDate).toBeNull();
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
      // A household that unticked children's information (on by default since 2026-10-19).
      policy: { ...DEFAULT_DATA_USE, allowedClasses: ["general"] },
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

describe("HomeTalk: a bill the model named from the conversation is as settled as \"that bill\"", () => {
  // Gemini, given the conversation, resolves "Pay that bill" itself and
  // names the bill ("electricity") — sometimes with a self-reported
  // confidence of 0.7, which alone would ask "Which bill?" about a bill
  // that was just discussed (HT-08, 23 Sep 2026, intermittent).
  const env = groundingEnvFor(A, "a-kunal", { conversation: [{ entityType: "bill", entityId: "a-b-electricity", label: "Electricity", minutesAgo: 1 }] });
  const named = (reference: string, confidence = 0.7): HouseholdIntent => ({
    action: "make_payment", actorMemberId: "a-kunal", target: { kind: "bill", reference }, parameters: { billLabel: reference },
    confidence, channel: "text", utterance: "Pay that bill", understanding: { source: "model", provider: "google" },
  });

  it("grounds the named bill to the one in play and settles which bill it is", async () => {
    const grounded = await groundIntent(named("electricity"), env);
    expect(grounded.kind).toBe("grounded");
    if (grounded.kind !== "grounded") return;
    expect(grounded.intent.parameters.billId).toBe("a-b-electricity");
    expect(grounded.intent.target.reference).toBe("Electricity");
    expect(grounded.intent.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("a bill named that is not the one in play keeps its own doubt", async () => {
    const grounded = await groundIntent(named("water", 0.6), env);
    expect(grounded.kind === "grounded" && grounded.intent.confidence).toBe(0.6);
    expect(grounded.kind === "grounded" && grounded.intent.parameters.billId).toBeUndefined();
  });
});

/**
 * Defects the configured-provider evaluation found against Anthropic (`npm run
 * eval -- --provider configured`, 21 Oct 2026: 128/148 before these fixes).
 * Each model reply below is the shape the real one gave, replayed without a
 * model, so the fix holds whichever provider runs next.
 */
function goldenTalk(id: string) {
  const found = GOLDEN_CASES.find((c) => c.id === id);
  if (!found) throw new Error(`no golden case ${id}`);
  return found;
}

const anthropicRead =
  (read: Partial<HouseholdIntent>): Understanding =>
  (utterance, context) => ({
    action: "ask_status",
    actorMemberId: context.actorMemberId,
    target: { kind: "unspecified" },
    parameters: {},
    confidence: 0.6,
    channel: context.channel,
    utterance,
    understanding: { source: "model", provider: "anthropic" },
    ...read,
  });

describe("2026-10-21 Anthropic run: what the rules answer stays the rules'", () => {
  it("\"who is in the family?\" read by a model as a general status question is still the roster (HT-28, HT-29, HT-30, HT-101)", async () => {
    for (const id of ["HT-28", "HT-29", "HT-30", "HT-101"]) {
      const result = await runCase(goldenTalk(id), { understand: anthropicRead({ parameters: { scope: "home" } }) });
      expect(result.pass, id).toBe(true);
    }
  });

  it("\"what do you know about the preferences in food and family?\" stays the likes answer (HT-112)", async () => {
    const result = await runCase(goldenTalk("HT-112"), { understand: anthropicRead({ parameters: { what: "preferences in food and family", scope: "home" }, confidence: 0.7 }) });
    expect(result.pass).toBe(true);
  });

  it("\"suggest a two-day vacation plan\" read as an event to plan is still a place question, and nothing is prepared (HT-88)", async () => {
    const result = await runCase(goldenTalk("HT-88"), { understand: anthropicRead({ action: "plan_event", target: { kind: "event" }, parameters: { window: "two-day", what: "vacation" } }) });
    expect(result.pass).toBe(true);
  });

  it("the rules only ever take over a read, and only when the model read something else", () => {
    const people = { action: "ask_status", parameters: { scope: "people" } } as unknown as HouseholdIntent;
    expect(rulesAnswerItself(people)).toBe(true);
    expect(sameRuleReading(people, { action: "ask_status", parameters: { scope: "people" } } as unknown as HouseholdIntent)).toBe(true);
    expect(rulesAnswerItself({ action: "make_payment", parameters: {} } as unknown as HouseholdIntent)).toBe(false);
    expect(rulesAnswerItself({ action: "ask_status", parameters: { scope: "home" } } as unknown as HouseholdIntent)).toBe(false);
  });

  it("a request the rules read plainly is not asked about because the model scored itself low (HT-06, HT-73)", async () => {
    const move = await runCase(goldenTalk("HT-06"), {
      understand: anthropicRead({ action: "adjust_schedule", target: { kind: "event", reference: "science project" }, parameters: { to: "Friday", what: "Science project" } }),
    });
    expect(move.pass).toBe(true);
    const pay = await runCase(goldenTalk("HT-73"), {
      understand: (utterance, context) =>
        utterance.trim().toLowerCase() === "no"
          ? anthropicRead({ action: "unknown" })(utterance, context)
          : anthropicRead({ action: "make_payment", target: { kind: "bill", reference: "electricity bill" }, parameters: { billLabel: "electricity bill" } })(utterance, context),
    });
    expect(pay.pass).toBe(true);
  });

  it("\"Friday this week\" is this Friday, and a movie night on it is Friday night, on the calendar at once (HT-103)", async () => {
    expect(resolveTemporal("Friday this week", { timezone: A.timezone, now: A.now })?.date).toBe("2026-09-25");
    const result = await runCase(goldenTalk("HT-103"), {
      understand: anthropicRead({ action: "plan_event", target: { kind: "event" }, parameters: { window: "Friday this week", what: "movie night" }, confidence: 0.9 }),
    });
    expect(result.pass).toBe(true);
  });
});

describe("2026-10-21 Anthropic run: what HomeBrain lets a model see and say", () => {
  const statusRead = anthropicRead({ parameters: { scope: "home" }, confidence: 0.8 });
  const recording = (draft: (input: AnswerInput) => ModelDraft) => {
    const seen: AnswerInput[] = [];
    const compose: AnswerComposer = async (input) => {
      seen.push(input);
      return draft(input);
    };
    return { seen, compose };
  };

  it("a model's \"nothing on record\" is said in WonderHome's words — never the question dressed as a record (HT-54)", async () => {
    const model = recording(() => ({ text: "I can't see any school fees.\n- **School fees** — nothing recorded → [Bills](/bills)", mode: "unknown", grounded: false, usedFacts: [] }));
    const result = await runCase(goldenTalk("HT-54"), { understand: statusRead, compose: model.compose });
    expect(result.pass).toBe(true);
  });

  it("a count, a sum or the free weekends is told by its rule, never re-told by a model (HT-111, HT-118, HT-120)", async () => {
    for (const id of ["HT-111", "HT-118", "HT-120"]) {
      const model = recording(() => ({ text: "5 guests are coming.", mode: "answer", grounded: true, usedFacts: [] }));
      const result = await runCase(goldenTalk(id), { compose: model.compose });
      expect(model.seen, id).toHaveLength(0);
      expect(result.pass, id).toBe(true);
    }
  });

  it("a question about one day shows a model nothing on another day, not even through the asker's profile (HB-12)", async () => {
    const model = recording((input) => ({ text: "Football practice and the Piano lesson.", mode: "answer", grounded: true, usedFacts: input.facts.slice(0, 1).map((fact) => fact.id) }));
    await runCase(goldenTalk("HB-12"), { compose: model.compose });
    expect(model.seen.length).toBeGreaterThan(0);
    for (const input of model.seen) expect(input.facts.map((fact) => fact.text).join("\n")).not.toMatch(/Parent-teacher/);
  });

  it("a question that names one thing shows a model no other thing of its kind (HT-47)", async () => {
    const model = recording((input) => ({ text: "The washing machine is due for service.", mode: "answer", grounded: true, usedFacts: input.facts.slice(0, 1).map((fact) => fact.id) }));
    await runCase(goldenTalk("HT-47"), { understand: statusRead, compose: model.compose });
    expect(model.seen.length).toBeGreaterThan(0);
    for (const input of model.seen) expect(input.facts.map((fact) => fact.text).join("\n")).not.toMatch(/Fridge/);
  });

  it("the question leaves with the same placeholders as the facts, so a model never says it has nobody of that name (HT-65)", async () => {
    const model = recording(() => ({ text: "Nothing.", mode: "answer", grounded: true, usedFacts: [] }));
    await runCase(goldenTalk("HT-65"), { understand: statusRead, compose: model.compose });
    expect(model.seen.length).toBeGreaterThan(0);
    for (const input of model.seen) expect(input.question).not.toMatch(/\bAsmi\b|\bManan\b/);
    expect(pseudonymiseText("What does Asmi have tomorrow?", peopleOf(A))).not.toMatch(/Asmi/);
  });
});

describe("2026-10-25 Anthropic run: what the live model taught HomeBrain and HomeSend", () => {
  it("a question nothing the asker may see could answer is WonderHome's own 'nothing on record', no model asked (HB-03)", async () => {
    const seen: AnswerInput[] = [];
    // What the live model wrote, 4 runs in 8: an action it cannot take, refused by the validator.
    const compose: AnswerComposer = async (input) => {
      seen.push(input);
      return { text: "I can ask Neha to share her appointment with you.", mode: "answer", grounded: false, usedFacts: [] };
    };
    const result = await runCase(goldenTalk("HB-03"), { compose });
    expect(seen).toHaveLength(0);
    expect(result.errors).not.toContain("provider_failure");
    expect(result.pass).toBe(true);
  });

  it("a case about an invented reading keeps it in a provider run, and it still waits for a person (HS-24)", async () => {
    const hs24 = GOLDEN_CASES.find((c) => c.id === "HS-24")!;
    // A live model reads "We need paneer" correctly: on its own reading there would be nothing to catch.
    const classify = async () => reading({ kind: "grocery_item", title: "Paneer", quantity: 1, unit: "packet", category: "grocery" });
    const result = await runCase(hs24, { classify });
    expect(result.pass).toBe(true);
  });
});
