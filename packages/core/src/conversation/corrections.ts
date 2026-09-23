import type { HouseholdIntent, IntentTarget } from "./intent";
import { resolveTemporal } from "./temporal";

/**
 * Conversational corrections (Wave 4 §9):
 *
 *   "Actually, make that Friday."
 *   "No, I meant Manan."
 *   "Not milk, almond milk."
 *
 * A correction is read against the one request it corrects — the proposal
 * still waiting for a yes, or, failing that, the last thing HomeTalk actually
 * did in this conversation — never against the household at large. It is a
 * change to *that* request, and the result is an ordinary intent that goes
 * through grounding, every gate and the executor like any other.
 *
 * What it may not do is rewrite history invisibly. A proposal not yet
 * approved is simply replaced (it is marked rejected, and the corrected one
 * is proposed in its place). Something already done is corrected by a new,
 * recorded, corrective action that undoes the earlier write through the same
 * domain service a manual undo would use and then makes the corrected one —
 * both visible in the conversation's record.
 */

export type Correction =
  /** "Not milk, almond milk" / "not milk but almond milk". */
  | { kind: "replace"; from: string; to: string }
  /** "No, I meant Manan" / "make that Friday" — what it replaces is read from the request. */
  | { kind: "value"; to: string };

/** The request being corrected, as stored — never as a model described it. */
export type CorrectableAction = {
  actionId: string;
  actionType: string;
  outcomeKey: string | null;
  parameters: Record<string, unknown>;
  status: "proposed" | "executed";
  /** What the executor actually wrote, for an executed one. */
  result: Record<string, unknown> | null;
};

/** The record of what a corrective action replaces, carried to the executor. */
export type CorrectsRecord = {
  actionId: string;
  actionType: string;
  result: Record<string, unknown>;
};

/** The target each stored action type implies, for rebuilding its intent. */
export const TARGET_KIND_FOR_ACTION: Record<string, IntentTarget["kind"]> = {
  record_absence: "member",
  assign_responsibility: "member",
  add_to_list: "list",
  order_items: "list",
  make_payment: "bill",
  plan_event: "event",
  plan_meal: "outcome",
  set_reminder: "outcome",
  adjust_schedule: "event",
  set_preference: "outcome",
  record_health_appointment: "member",
  log_health_issue: "member",
  resolve_health_issue: "member",
  log_vital: "member",
  set_fitness_goal: "member",
};

/** Whether an utterance is a correction, and of what shape. */
export function readCorrection(utterance: string): Correction | null {
  const text = utterance.trim().replace(/[.!]+$/, "");

  const replace = /^(?:no[,.!]?\s+|sorry[,.!]?\s+|oops[,.!]?\s+)?not\s+(?:the\s+)?(.+?)(?:\s*,\s*|\s+but\s+)(?:the\s+)?(.+)$/i.exec(text);
  if (replace) return { kind: "replace", from: replace[1]!.trim(), to: replace[2]!.trim() };

  const meant = /^(?:no[,.!]?\s+|sorry[,.!]?\s+|oops[,.!]?\s+)?i\s+(?:meant|mean)\s+(.+)$/i.exec(text);
  if (meant) return { kind: "value", to: meant[1]!.trim() };

  const change = /^(?:(?:actually|no|sorry|wait|oops)[,.!]?\s+)?(?:make|change|move|switch)\s+(?:that|it|this)\s+(?:to\s+)?(.+)$/i.exec(text);
  if (change) return { kind: "value", to: change[1]!.trim() };

  const actually = /^actually[,.!]?\s+(?:it'?s|it is|that'?s|that is)?\s*(.+)$/i.exec(text);
  if (actually && actually[1]!.split(/\s+/).length <= 4) return { kind: "value", to: actually[1]!.trim() };

  return null;
}

/**
 * The corrected request, or null when the correction does not fit the
 * request in hand ("not milk, almond milk" said about an absence is not a
 * correction of it — the turn is read as a fresh request instead).
 */
export function applyCorrection(
  correction: Correction,
  subject: CorrectableAction,
  context: { actorMemberId: string; channel: "text" | "voice"; utterance: string; timezone: string; now: Date },
): HouseholdIntent | null {
  const parameters = withoutGrounded(subject.parameters);
  const targetKind = TARGET_KIND_FOR_ACTION[subject.actionType] ?? "unspecified";
  const base = {
    action: subject.actionType as HouseholdIntent["action"],
    actorMemberId: context.actorMemberId,
    channel: context.channel,
    utterance: context.utterance,
    // The household said this twice now; it is not a guess.
    confidence: 0.92,
    understanding: { source: "rules" as const },
  };
  const corrects: CorrectsRecord | null =
    subject.status === "executed" ? { actionId: subject.actionId, actionType: subject.actionType, result: subject.result ?? {} } : null;
  const finish = (target: IntentTarget, next: Record<string, unknown>): HouseholdIntent => ({
    ...base,
    target,
    parameters: Object.fromEntries(Object.entries({ ...next, ...(corrects ? { corrects } : {}) }).filter(([, value]) => value !== undefined)),
  });
  const currentTarget: IntentTarget = { kind: targetKind, ...(targetReference(subject) ? { reference: targetReference(subject)! } : {}) };

  if (correction.kind === "replace") {
    if (subject.actionType !== "add_to_list" && subject.actionType !== "order_items") return null;
    const items = itemsOf(subject.parameters);
    const index = items.findIndex((item) => sameThing(item, correction.from));
    if (index < 0) return null;
    const next = items.map((item, at) => (at === index ? correction.to : item));
    return finish(currentTarget, next.length === 1 ? { ...parameters, item: next[0], items: undefined } : { ...parameters, items: next, item: undefined });
  }

  // "Make that Friday" — a day, for a request that has one.
  const asDay = resolveTemporal(correction.to, { timezone: context.timezone, now: context.now });
  if (asDay && ("when" in subject.parameters || subject.actionType === "record_absence" || subject.actionType === "record_health_appointment")) {
    return finish(currentTarget, { ...parameters, when: correction.to });
  }
  if (asDay && "to" in subject.parameters) {
    return finish(currentTarget, { ...parameters, to: correction.to });
  }

  // A day said about a request with no day in it is not a correction of it
  // — "make that Friday" never turns milk into an item called "Friday".
  if (asDay) return null;

  // "I meant Manan" — a person, for a request about one.
  if (targetKind === "member") {
    const next = { ...parameters };
    delete next.memberId;
    delete next.memberName;
    return finish({ kind: "member", reference: correction.to.toLowerCase() }, next);
  }

  // "I meant almond milk" — a different thing on the list.
  if (subject.actionType === "add_to_list") {
    const items = itemsOf(subject.parameters);
    if (items.length !== 1) return null;
    return finish(currentTarget, { ...parameters, item: correction.to, items: undefined });
  }

  return null;
}

/** What a correction said, for the reply: "Asmi → Manan", "milk → almond milk". */
export function describeCorrection(subject: CorrectableAction, corrected: HouseholdIntent): string | null {
  const before = subject.parameters;
  const after = corrected.parameters;
  const name = (value: unknown) => (typeof value === "string" ? value : null);
  const beforeItems = itemsOf(before).join(", ");
  const afterItems = itemsOf(after).join(", ");
  if (beforeItems && afterItems && beforeItems !== afterItems) return `${beforeItems} → ${afterItems}`;
  const beforeWho = name(before.memberName) ?? targetReference(subject);
  const afterWho = name(after.memberName) ?? corrected.target.reference ?? null;
  if (beforeWho && afterWho && beforeWho.toLowerCase() !== afterWho.toLowerCase()) return `${beforeWho} → ${capitalise(afterWho)}`;
  const beforeWhen = name(before.when) ?? name(before.to);
  const afterWhen = name(after.when) ?? name(after.to);
  if (beforeWhen && afterWhen && beforeWhen !== afterWhen) return `${beforeWhen} → ${afterWhen}`;
  return null;
}

function targetReference(subject: CorrectableAction): string | null {
  const parameters = subject.parameters;
  if (typeof parameters.memberName === "string") return parameters.memberName;
  if (typeof parameters.targetReference === "string") return parameters.targetReference;
  if (subject.actionType === "add_to_list") return "groceries";
  return subject.outcomeKey;
}

function itemsOf(parameters: Record<string, unknown>): string[] {
  if (typeof parameters.item === "string" && parameters.item.trim()) return [parameters.item];
  if (Array.isArray(parameters.items)) return parameters.items.filter((item): item is string => typeof item === "string");
  return [];
}

/** Grounding output and bookkeeping never carry over — the corrected request is grounded afresh. */
function withoutGrounded(parameters: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parameters)) {
    if (key.endsWith("Resolved") || key === "awaiting" || key === "candidates" || key === "corrects" || key === "referred") continue;
    next[key] = value;
  }
  return next;
}

function sameThing(a: string, b: string): boolean {
  const normal = (text: string) => text.toLowerCase().replace(/^(?:the|a|an|some)\s+/, "").replace(/[^a-z0-9 ]+/g, "").trim();
  return normal(a) === normal(b) || normal(a).includes(normal(b)) || normal(b).includes(normal(a));
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
