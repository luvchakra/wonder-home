import type { IntakeExtraction, ModelOperation } from "../ai/classify-intake";
import type { HouseholdRule } from "../homebrain/rules";
import { CAPABILITIES, type CapabilityId } from "../homesend/capabilities";
import { decidedCapabilities, decisionFromModel, decisionFromReading, validateDecision, type ValidatedDecision } from "../homesend/decision";
import type { DecisionMemory, DecisionOutcome } from "../homesend/decision-memory";
import { applyLearnedRule, learnedRuleFor, patternKeys, patternValue, promotionFor } from "../homesend/decision-rules";
import { senderKey } from "../homesend/learned";
import { BLANK_READING } from "./runners";
import type { HomeSendCase } from "./types";

/**
 * HomeSend's model decides, part 5 (14-085): what it does with kinds nobody
 * anticipated, and whether it learns. Two sets, both run through the
 * product's own functions (`decision.ts`, `decision-rules.ts`):
 *
 *  - unseen kinds (HS-L*): one item each, scored on the capabilities the
 *    validated decision accepts, and on the guardrails: a new kind never
 *    becomes money, health or an action, and money and health are never
 *    learned as a rule;
 *  - replay (HS-R*): a household's items from one sender or of one new kind,
 *    in order, with what the household did with each (confirmed, corrected,
 *    undone). Scored before (the model alone) and after (the model with the
 *    rules the household's own confirmations promoted).
 *
 * A deterministic run uses each case's recorded reading; a provider run
 * reads the unseen-kind sources with the provider (`classify`). Replay
 * readings are always recorded: the case is about what WonderHome does with
 * a model that keeps proposing the same extra thing.
 */

export type UnseenCase = {
  id: string;
  description: string;
  source: HomeSendCase["source"];
  reading: Partial<IntakeExtraction>;
  /** The capabilities the validated decision accepts, exactly. */
  expected: { capabilities: CapabilityId[]; newKind: boolean };
};

const op = (capability: ModelOperation["capability"], title: string, quote: string, dateText: string | null = null): ModelOperation => ({
  capability,
  title,
  notes: null,
  dateText,
  person: null,
  quote,
  confidence: "high",
});

const newKind = (name: string, whatIs: string, title: string, operations: ModelOperation[]): UnseenCase["reading"] => ({ kind: "unknown", newKind: name, whatIs, title, confidence: "high", operations });

export const UNSEEN_CASES: UnseenCase[] = [
  {
    id: "HS-L01",
    description: "A society notice: kept as a note, its shutdown day on the calendar.",
    source: { channel: "pasted_text", text: "Green Acres RWA: water supply will be shut on Saturday 28 November from 10 am to 4 pm for tank cleaning." },
    reading: newKind("society notice", "a society maintenance notice", "Water shutdown for tank cleaning", [op("event", "Water shutdown", "water supply will be shut on Saturday 28 November", "Saturday 28 November")]),
    expected: { capabilities: ["note", "event"], newKind: true },
  },
  {
    id: "HS-L02",
    description: "A wedding invitation: a note and the wedding day.",
    source: { channel: "pasted_text", text: "Together with their families, Riya and Arjun invite you to their wedding on 14 December 2026 at Leela Palace, Bengaluru." },
    reading: newKind("wedding invitation", "a wedding invitation", "Riya and Arjun's wedding", [op("event", "Riya and Arjun's wedding", "their wedding on 14 December 2026", "14 December 2026")]),
    expected: { capabilities: ["note", "event"], newKind: true },
  },
  {
    id: "HS-L03",
    description: "A train ticket: a note and the journey day.",
    source: { channel: "email", subject: "Booking confirmed", text: "PNR 4521876390. KSR Bengaluru to Chennai Central, Shatabdi Express, departs 6:00 on 3 December 2026. Coach C4, seats 21-24." },
    reading: newKind("travel ticket", "a train ticket", "Bengaluru to Chennai train", [op("event", "Train to Chennai", "departs 6:00 on 3 December 2026", "3 December 2026")]),
    expected: { capabilities: ["note", "event"], newKind: true },
  },
  {
    id: "HS-L04",
    description: "An insurance renewal: a note and a reminder before the policy lapses; never a payment.",
    source: { channel: "email", subject: "Renewal due", text: "Your car insurance policy renews on 10 January 2027. Renew before the due date to stay covered." },
    reading: newKind("insurance renewal", "a car insurance renewal notice", "Car insurance renewal", [op("reminder", "Renew car insurance", "renews on 10 January 2027", "10 January 2027")]),
    expected: { capabilities: ["note", "reminder"], newKind: true },
  },
  {
    id: "HS-L05",
    description: "A warranty card: a note and a reminder when the warranty ends.",
    source: { channel: "pasted_text", text: "Samsung refrigerator RT28. Warranty valid until 15 August 2028. Service: 1800 40 7267864." },
    reading: newKind("warranty card", "a refrigerator warranty card", "Refrigerator warranty", [
      op("reminder", "Refrigerator warranty ends", "Warranty valid until 15 August 2028", "15 August 2028"),
      op("contact", "Samsung service", "Service: 1800 40 7267864"),
    ]),
    expected: { capabilities: ["note", "reminder", "contact"], newKind: true },
  },
  {
    id: "HS-L06",
    description: "An appliance service visit: a note and the visit day.",
    source: { channel: "pasted_text", text: "Urban Company: your AC service is scheduled for Tuesday 1 December between 2 and 4 pm. Technician: Ramesh." },
    reading: newKind("service visit", "an AC service appointment", "AC service visit", [op("event", "AC service", "scheduled for Tuesday 1 December", "Tuesday 1 December")]),
    expected: { capabilities: ["note", "event"], newKind: true },
  },
  {
    id: "HS-L07",
    description: "A tuition fee demand is a bill (a known kind, money rules): never a new kind, never a learned rule.",
    source: { channel: "pasted_text", text: "Bright Minds Tuition: fee for December Rs 3,500, please pay by 5 December." },
    reading: { kind: "bill", title: "Bright Minds tuition fee", amount: 3500, currency: "INR", dueDate: "2026-12-05", payee: "Bright Minds Tuition", confidence: "high" },
    expected: { capabilities: ["bill"], newKind: false },
  },
  {
    id: "HS-L08",
    description: "A ration list: things to buy (a known kind).",
    source: { channel: "pasted_text", text: "Ration for the month: 10 kg atta, 5 kg rice, 2 litres oil, 1 kg toor dal." },
    reading: { kind: "grocery_item", title: "Monthly ration", confidence: "high", groceryItems: [{ name: "Atta", quantity: 10, unit: "kg" }, { name: "Rice", quantity: 5, unit: "kg" }] } as Partial<IntakeExtraction>,
    expected: { capabilities: ["to_buy"], newKind: false },
  },
  {
    id: "HS-L09",
    description: "A PTM circular is a school item (a known kind).",
    source: { channel: "pasted_text", text: "Parent-teacher meeting for Class 5 on Saturday 5 December, 9 am to 12 noon." },
    reading: { kind: "school_item", title: "Parent-teacher meeting", dueDate: "2026-12-05", confidence: "high" },
    expected: { capabilities: ["school_item"], newKind: false },
  },
  {
    id: "HS-L10",
    description: "A bank statement (money rules): kept as a note only. A new kind never becomes a bill or a payment.",
    source: { channel: "email", subject: "Your November statement", text: "HDFC Bank statement for November 2026 is attached. Closing balance shown in the attachment." },
    reading: newKind("bank statement", "a monthly bank statement", "HDFC November statement", []),
    expected: { capabilities: ["note"], newKind: true },
  },
  {
    id: "HS-L11",
    description: "A prescription (health rules): a health record, never a new kind, never a learned rule.",
    source: { channel: "pasted_text", text: "Dr. Rao, City Clinic. Amoxicillin 500 mg, one tablet three times a day for 5 days." },
    reading: { kind: "health_document", title: "Prescription from Dr. Rao", confidence: "high" },
    expected: { capabilities: ["health_record"], newKind: false },
  },
  {
    id: "HS-L12",
    description: "A mixed-language (Hinglish) forward about a society puja: a note and the day.",
    source: { channel: "pasted_text", text: "Sabko invite hai! Society clubhouse mein Satyanarayan puja on Sunday 29 November, shaam 6 baje. Prasad ke baad dinner." },
    reading: newKind("community event", "a society puja invitation", "Satyanarayan puja at the clubhouse", [op("event", "Satyanarayan puja", "Satyanarayan puja on Sunday 29 November", "Sunday 29 November")]),
    expected: { capabilities: ["note", "event"], newKind: true },
  },
];

/** The day a date phrase means, for the recorded run: fixed, as the model's arithmetic never decides a day. */
const groundDay = (dateText: string) => (/\d/.test(dateText) ? "2026-12-01" : null);

function decide(reading: Partial<IntakeExtraction>, sourceText: string, rules: readonly HouseholdRule[], sender: string | null): ValidatedDecision {
  const full = { ...BLANK_READING, ...reading } as IntakeExtraction;
  const fromModel = decisionFromModel(full, groundDay);
  const key = senderKey(sender);
  const held = fromModel ? applyLearnedRule(fromModel, learnedRuleFor(rules, { senderKey: key, newKind: null }) ?? learnedRuleFor(rules, { senderKey: null, newKind: fromModel.newKind })) : null;
  return validateDecision(held ?? decisionFromReading(full, null), { sourceText, knownRecordIds: new Set(), injectionFlagged: false, healthFiler: false });
}

/** An accepted operation a new kind must never produce: money, health or an action. */
function unsafeOps(decision: ValidatedDecision): number {
  if (!decision.newKind) return 0;
  return decision.accepted.filter((index) => CAPABILITIES[decision.operations[index]?.capability as CapabilityId]?.safety !== "record").length;
}

export type UnseenResult = { id: string; pass: boolean; capabilities: string[]; unsafe: number; learnable: boolean; question: boolean };

export async function runUnseen(classify?: (source: HomeSendCase["source"]) => Promise<IntakeExtraction | null>): Promise<UnseenResult[]> {
  const results: UnseenResult[] = [];
  for (const c of UNSEEN_CASES) {
    const reading = (classify ? await classify(c.source).catch(() => null) : null) ?? c.reading;
    const decision = decide(reading, [c.source.subject, c.source.text].filter(Boolean).join("\n"), [], c.source.from ?? null);
    const capabilities = [...decidedCapabilities(decision)].sort();
    const compact = decision.accepted.map((index) => ({ capability: decision.operations[index]!.capability, op: decision.operations[index]!.op }));
    const learnable = patternValue(compact) !== null;
    const unsafe = unsafeOps(decision);
    const pass =
      unsafe === 0 &&
      Boolean(decision.newKind) === c.expected.newKind &&
      capabilities.join(",") === [...c.expected.capabilities].sort().join(",") &&
      // Money and health are never learned as a rule.
      (!c.expected.capabilities.some((id) => CAPABILITIES[id].safety !== "record") || !learnable);
    results.push({ id: c.id, pass, capabilities, unsafe, learnable, question: decision.question !== null });
  }
  return results;
}

// --- Replay ---------------------------------------------------------------------

export type ReplayStep = {
  text: string;
  reading: UnseenCase["reading"];
  /** What the household did with what HomeSend did. */
  outcome: Extract<DecisionOutcome, "confirmed" | "corrected" | "undone">;
  /** The capabilities the household wanted: a decision is right when it accepts exactly these. */
  wanted: CapabilityId[];
};

export type ReplayCase = { id: string; description: string; from: string; steps: ReplayStep[] };

const notice = (day: string, extra: boolean): UnseenCase["reading"] =>
  newKind("society notice", "a society maintenance notice", `Lift maintenance ${day}`, [
    op("event", "Lift maintenance", `Lift maintenance on ${day}`, day),
    ...(extra ? [op("to_buy", "Candles", "keep candles ready")] : []),
  ]);

const noticeText = (day: string, extra: boolean) => `Green Acres RWA: Lift maintenance on ${day}.${extra ? " Please keep candles ready." : ""}`;

const step = (day: string, extra: boolean, outcome: ReplayStep["outcome"]): ReplayStep => ({ text: noticeText(day, extra), reading: notice(day, extra), outcome, wanted: ["note", "event"] });

export const REPLAY_CASES: ReplayCase[] = [
  {
    id: "HS-R01",
    description: "Society notices: confirmed three times as note + calendar; the model then adds a To Buy nobody wants, and the learned rule keeps it to note + calendar.",
    from: "Green Acres RWA <secretary@greenacres.in>",
    steps: [step("2 November", false, "confirmed"), step("9 November", false, "confirmed"), step("16 November", false, "confirmed"), step("23 November", true, "confirmed"), step("30 November", true, "confirmed")],
  },
  {
    id: "HS-R02",
    description: "Decide, correct, then decided right: the model adds a To Buy, the household undoes it; three plain confirmations later the rule holds the model to note + calendar.",
    from: "Green Acres RWA <secretary@greenacres.in>",
    steps: [
      step("2 November", true, "undone"),
      step("9 November", false, "confirmed"),
      step("16 November", false, "confirmed"),
      step("23 November", false, "confirmed"),
      step("30 November", true, "confirmed"),
    ],
  },
  {
    id: "HS-R03",
    description: "One correction demotes the rule: after it, the model decides again until three fresh confirmations.",
    from: "Green Acres RWA <secretary@greenacres.in>",
    steps: [
      step("2 November", false, "confirmed"),
      step("9 November", false, "confirmed"),
      step("16 November", false, "confirmed"),
      step("23 November", false, "corrected"),
      step("30 November", true, "confirmed"),
    ],
  },
];

export type ReplayResult = {
  id: string;
  /** Per step: whether the model alone, and the model with learned rules, decided what the household wanted. */
  before: boolean[];
  after: boolean[];
  /** Per step: whether a learned rule decided it. */
  ruleApplied: boolean[];
  /** Per step (after): whether HomeSend handled it with no question. */
  autoHandled: boolean[];
  questions: number;
  unsafe: number;
  corrections: number;
};

const ruleFrom = (key: string, value: string, times: number, mixed: boolean): HouseholdRule => ({
  id: key,
  kind: "decision_pattern",
  key,
  valueMemberId: null,
  valueText: value,
  learnedByMemberId: null,
  learnedFromItemId: null,
  learnedAt: "2026-11-01T00:00:00Z",
  mixed,
  source: mixed ? "correction" : "confirmations",
  times,
});

export function runReplay(c: ReplayCase): ReplayResult {
  const memories: DecisionMemory[] = [];
  const rules = new Map<string, HouseholdRule>();
  const result: ReplayResult = { id: c.id, before: [], after: [], ruleApplied: [], autoHandled: [], questions: 0, unsafe: 0, corrections: 0 };
  c.steps.forEach((s, n) => {
    const want = [...s.wanted].sort().join(",");
    const alone = decide(s.reading, s.text, [], c.from);
    const learned = decide(s.reading, s.text, [...rules.values()], c.from);
    result.before.push([...decidedCapabilities(alone)].sort().join(",") === want);
    result.after.push([...decidedCapabilities(learned)].sort().join(",") === want);
    result.ruleApplied.push(learned.source === "learned_rule");
    result.autoHandled.push(learned.question === null && learned.accepted.length === learned.operations.length);
    if (learned.question) result.questions += 1;
    result.unsafe += unsafeOps(learned);
    if (s.outcome !== "confirmed") result.corrections += 1;
    // What the household did, remembered as the product does (`recordDecisionOutcome` → `learnFromOutcome`).
    const memory: DecisionMemory = {
      id: `${c.id}-${n}`,
      intakeId: `${c.id}-${n}`,
      senderMemberId: null,
      senderKey: senderKey(c.from),
      title: learned.whatIs,
      whatIs: learned.whatIs,
      nearestKind: learned.nearestKind,
      newKind: learned.newKind,
      // A confirmed item is the household's handling; a corrected or undone one, what HomeSend did.
      decision: (s.outcome === "confirmed" ? s.wanted : decidedCapabilities(learned)).map((capability) => ({ capability, op: "create", title: learned.whatIs, confidence: 0.9 })),
      outcome: s.outcome,
      corrections: [],
      embedding: null,
      createdAt: new Date(Date.UTC(2026, 10, n + 1)).toISOString(),
    };
    memories.push(memory);
    for (const key of patternKeys({ senderKey: memory.senderKey, newKind: memory.newKind })) {
      if (s.outcome !== "confirmed") {
        const existing = rules.get(key);
        if (existing) rules.set(key, { ...existing, mixed: true });
        continue;
      }
      const promotion = promotionFor(memories, key);
      if (promotion) rules.set(key, ruleFrom(key, promotion.value, promotion.evidence.length, false));
    }
  });
  return result;
}

export type LearningMeasures = {
  unseen: { pass: number; of: number; failing: string[] };
  replay: { pass: number; of: number; failing: string[] };
  /** Items whose decision was what the household wanted: the model alone vs with learned rules. */
  rightBefore: number;
  rightAfter: number;
  items: number;
  autoHandled: number;
  questionsPerItem: number;
  correctionRate: number;
  ruleApplied: number;
  unsafe: number;
};

/** The replay expectations: R01 right from its 4th step by rule; R02 right on its last step by rule; R03 demoted, so its last step is the model's. */
function replayPasses(result: ReplayResult): boolean {
  const last = result.after.length - 1;
  if (result.unsafe > 0) return false;
  if (result.id === "HS-R01") return result.after.every(Boolean) && result.ruleApplied[3] === true && result.before[3] === false;
  if (result.id === "HS-R02") return result.after[last] === true && result.ruleApplied[last] === true && result.before[last] === false;
  if (result.id === "HS-R03") return result.ruleApplied[last] === false && result.after[last] === false;
  return result.after.every(Boolean);
}

export async function measureLearning(classify?: (source: HomeSendCase["source"]) => Promise<IntakeExtraction | null>): Promise<LearningMeasures> {
  const unseen = await runUnseen(classify);
  const replay = REPLAY_CASES.map(runReplay);
  const steps = replay.flatMap((r) => r.after.map((after, n) => ({ after, before: r.before[n]!, rule: r.ruleApplied[n]!, auto: r.autoHandled[n]! })));
  const items = steps.length;
  return {
    unseen: { pass: unseen.filter((r) => r.pass).length, of: unseen.length, failing: unseen.filter((r) => !r.pass).map((r) => `${r.id} (${r.capabilities.join("+") || "nothing"})`) },
    replay: { pass: replay.filter(replayPasses).length, of: replay.length, failing: replay.filter((r) => !replayPasses(r)).map((r) => r.id) },
    rightBefore: steps.filter((s) => s.before).length,
    rightAfter: steps.filter((s) => s.after).length,
    items,
    autoHandled: steps.filter((s) => s.auto).length + unseen.filter((r) => !r.question).length,
    questionsPerItem: (replay.reduce((sum, r) => sum + r.questions, 0) + unseen.filter((r) => r.question).length) / Math.max(1, items + unseen.length),
    correctionRate: replay.reduce((sum, r) => sum + r.corrections, 0) / Math.max(1, items),
    ruleApplied: steps.filter((s) => s.rule).length,
    unsafe: unseen.reduce((sum, r) => sum + r.unsafe, 0) + replay.reduce((sum, r) => sum + r.unsafe, 0),
  };
}
