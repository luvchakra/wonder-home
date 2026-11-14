import type { HouseholdContextItem } from "../context/types";
import { barFromHistory, effectiveBar, type BarKind } from "../homebrain/kind-bar";
import { resolveGaps, usable, whyFilled, type GapField } from "../homebrain/memory-resolve";
import { lessonsFrom, type HouseholdRule, type RuleField, type RuleKind } from "../homebrain/rules";
import { planVerification, type SourceItem, type VerifyEntry } from "../homebrain/verify-night";
import type { HomeSendKind } from "../homesend/items";
import type { IntakePerson } from "../homesend/resolve";
import type { Observation } from "./types";
import { contextItemsFor, GOLDEN_HOUSEHOLDS } from "./households";
import type { HomeBrainCase } from "./types";

/**
 * HomeBrain knows (Nothing stuck in review, phase 3) in the one evaluation:
 * the memory resolver, what a person's answer teaches, the nightly check and
 * each kind's bar, against the golden households. Deterministic: no model.
 *
 * Observed as:
 *   resolve  interpretation = the basis of the first filled gap ("none"),
 *            entity = the person filled, or "ask" when who it is for stays a question,
 *            answer = each filled value and its "Why?" from evidence;
 *   learn    interpretation = the rule kinds learned ("none"), action "learn" / "learn_nothing";
 *   verify   action = "raise:<reason>" and "confirm:<basis>" joined ("none"), conflict = any raised;
 *   bar      action = "bar:<percent>", interpretation = its basis.
 * Nothing here executes: a memory case never pays, orders or approves.
 */

export type RuleSpec = { kind: RuleKind; key: string; valueMemberId?: string; valueText?: string; mixed?: boolean; times?: number; source?: HouseholdRule["source"] };

export type ExtraItem =
  | { entityType: "consumable"; id: string; title: string }
  | { entityType: "place"; id: string; title: string }
  | { entityType: "bill"; id: string; title: string; payee: string; kind?: string; handler?: string };

export type MemorySpec =
  | {
      check: "resolve";
      kind: HomeSendKind;
      fields: GapField[];
      sender?: string;
      text?: string;
      /** Member keys of the golden household it could be for. */
      candidates?: string[];
      personId?: string;
      vendor?: string;
      phrase?: string;
      enrolments?: { childMemberId: string; schoolName: string }[];
      rules?: RuleSpec[];
      extraItems?: ExtraItem[];
    }
  | { check: "learn"; kind: HomeSendKind | null; field: RuleField; sender?: string; vendor?: string; phrase?: string; to: { memberId?: string; memberType?: string; text?: string } }
  | { check: "verify"; entries: (Partial<VerifyEntry> & { changeId: string })[]; sources?: SourceItem[]; rules?: RuleSpec[]; now: string }
  | { check: "bar"; kind: BarKind; added: number; undone: number; corrected: number; adminPercent?: number | null };

function toRules(specs: readonly RuleSpec[] | undefined, actor: string, at: string): HouseholdRule[] {
  return (specs ?? []).map((spec, index) => ({
    id: `rule-${index + 1}`,
    kind: spec.kind,
    key: spec.key,
    valueMemberId: spec.valueMemberId ?? null,
    valueText: spec.valueText ?? null,
    learnedByMemberId: actor,
    learnedFromItemId: null,
    learnedAt: at,
    mixed: spec.mixed === true,
    source: spec.source ?? "answer",
    times: spec.times ?? 1,
  }));
}

function extraItem(base: HouseholdContextItem, extra: ExtraItem): HouseholdContextItem {
  const attributes: Record<string, unknown> =
    extra.entityType === "bill" ? { title: extra.title, payee: extra.payee, kind: extra.kind ?? null } : extra.entityType === "place" ? { title: extra.title, status: "saved" } : { title: extra.title };
  return { ...base, id: `${extra.entityType}:${extra.id}`, entityType: extra.entityType, entityId: extra.id, attributes, aliases: [extra.title], subjectMemberIds: extra.entityType === "bill" && extra.handler ? [extra.handler] : [] };
}

export function observeMemory(c: HomeBrainCase, spec: MemorySpec, empty: Observation): Observation {
  const household = GOLDEN_HOUSEHOLDS[c.household];
  const safe = { consequential: false, executed: false as const, refused: false, injectionFlagged: false };
  const at = household.now.toISOString();

  if (spec.check === "learn") {
    const lessons = lessonsFrom({ kind: spec.kind, field: spec.field, sender: spec.sender ?? null, vendor: spec.vendor ?? null, phrase: spec.phrase ?? null, to: spec.to });
    return {
      ...empty,
      interpretation: lessons.length > 0 ? lessons.map((lesson) => lesson.kind).join("+") : "none",
      entity: lessons.find((lesson) => lesson.valueMemberId)?.valueMemberId ?? null,
      action: lessons.length > 0 ? "learn" : "learn_nothing",
      safety: { ...safe, refused: lessons.length === 0 },
      answer: lessons.map((lesson) => `${lesson.key} → ${lesson.valueMemberId ?? lesson.valueText}`).join("\n"),
    };
  }

  if (spec.check === "bar") {
    const learned = [{ kind: spec.kind, added: spec.added, undone: spec.undone, corrected: spec.corrected, percent: barFromHistory(spec) }];
    const bar = effectiveBar({ kind: spec.kind, adminPercent: spec.adminPercent ?? null, learned });
    return { ...empty, interpretation: bar.basis, action: `bar:${bar.percent}`, safety: safe, answer: `More than ${bar.percent}%` };
  }

  if (spec.check === "verify") {
    const now = new Date(spec.now);
    const entries: VerifyEntry[] = spec.entries.map((entry, index) => ({
      itemId: `item-${index + 1}`,
      kind: "bill",
      title: (entry.label ?? "").toLowerCase(),
      label: "",
      date: null,
      time: null,
      amount: null,
      payee: null,
      sender: null,
      subjectMemberId: null,
      createdByMemberId: c.actor,
      contentHash: null,
      unconfirmed: false,
      createdAt: spec.now,
      ...entry,
    }));
    const names = new Map(household.members.map((member) => [member.id, member.displayName.split(/\s+/)[0]!]));
    const plan = planVerification({ entries, sources: spec.sources ?? [], rules: toRules(spec.rules, c.actor, at), names, alreadyRaised: new Set(), now });
    const actions = [...plan.conflicts.map((conflict) => `raise:${conflict.reason}`), ...plan.confirm.map((confirmation) => `confirm:${confirmation.basis}`)];
    return {
      ...empty,
      interpretation: "verify",
      conflict: plan.conflicts.length > 0,
      action: actions.length > 0 ? actions.join("+") : "none",
      safety: safe,
      answer: [...plan.conflicts.flatMap((conflict) => [conflict.question, conflict.defaultWords, ...conflict.evidence]), ...plan.confirm.flatMap((confirmation) => confirmation.evidence)].join("\n"),
    };
  }

  const withSchools = spec.enrolments
    ? { ...household, records: { ...household.records, enrolments: [...(household.records.enrolments ?? []), ...spec.enrolments.map((row) => ({ ...row, grade: null }))] } }
    : household;
  const base = contextItemsFor(withSchools as typeof household, c.actor);
  const items = [...base, ...(spec.extraItems ?? []).map((extra) => extraItem(base[0]!, extra))];
  const members = new Map(base.filter((item) => item.entityType === "member").map((item) => [item.entityId, item]));
  const candidates: IntakePerson[] = (spec.candidates ?? [])
    .map((key) => members.get(key))
    .filter((item): item is HouseholdContextItem => item !== undefined)
    .map((item) => ({ memberId: item.entityId, displayName: String(item.attributes.displayName ?? ""), memberType: item.attributes.memberType === "child" ? "child" : item.attributes.memberType === "helper" ? "helper" : "adult" }));
  const resolution = resolveGaps(
    { kind: spec.kind, fields: spec.fields, sender: spec.sender ?? null, text: spec.text ?? null, candidates, personId: spec.personId ?? null, vendor: spec.vendor ?? null, phrase: spec.phrase ?? null },
    { items, rules: toRules(spec.rules, c.actor, at) },
  );
  const filled = spec.fields.map((field) => usable(resolution, field)).filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  const person = usable(resolution, "person");
  return {
    ...empty,
    interpretation: filled[0]?.basis ?? "none",
    entity: spec.fields.includes("person") ? (person?.value.memberId ?? "ask") : null,
    action: resolution.mixed.length > 0 ? `mixed:${resolution.mixed.join("+")}` : filled.length > 0 ? "fill" : "ask",
    safety: safe,
    answer: filled.map((entry) => `${entry.value.text}. ${whyFilled(entry)}`).join("\n"),
  };
}
