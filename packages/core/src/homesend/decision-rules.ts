import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeWords, ruleFor, type HouseholdRule } from "../homebrain/rules";
import { CAPABILITIES, type CapabilityId } from "./capabilities";
import type { HomeSendDecision } from "./decision";
import type { DecisionMemory, DecisionOutcome } from "./decision-memory";

/**
 * HomeSend's learned rules (14-084; the owner 2026-11-22: "learnt over time
 * to take the right decision in automated way"). When a household confirms
 * the same handling of the same pattern three times with no correction or
 * Undo in between, the pattern becomes a rule in `homesend_learned_defaults`
 * (kind `decision_pattern`), applied before the model decides: it is handed to
 * the model as the household's own rule, and the model's decision is held to
 * it (`applyLearnedRule`), recorded as `source: "learned_rule"`. One
 * correction or Undo demotes it (`mixed`): the model decides again, and three
 * fresh confirmations promote it again.
 *
 * A pattern is an outside sender (`pattern:sender:<address>`) or a kind
 * nobody anticipated (`pattern:newkind:<words>`). A rule's value is a list of
 * record capabilities only: never money, health, an action, approval,
 * permission or a person, and so never who a health document is for. Every
 * read and write names one household; nothing crosses households.
 */

export const PROMOTE_AFTER = 3;

/** What a learned rule may say an item becomes: the record capabilities a new kind uses. */
export const PATTERN_CAPABILITY_IDS = ["note", "event", "reminder", "to_buy", "task", "contact", "place"] as const satisfies readonly CapabilityId[];
export type PatternCapability = (typeof PATTERN_CAPABILITY_IDS)[number];
export const PATTERN_CAPABILITIES: ReadonlySet<CapabilityId> = new Set(PATTERN_CAPABILITY_IDS);

const COUNTS: ReadonlySet<DecisionOutcome> = new Set(["confirmed", "answered"]);
const BREAKS: ReadonlySet<DecisionOutcome> = new Set(["corrected", "undone"]);

export function senderPatternKey(senderKey: string | null | undefined): string | null {
  return senderKey && senderKey.startsWith("sender:") ? `pattern:${senderKey}` : null;
}

export function newKindPatternKey(newKind: string | null | undefined): string | null {
  const words = normalizeWords(newKind);
  return words ? `pattern:newkind:${words}` : null;
}

/** The patterns an item belongs to, most specific first. */
export function patternKeys(item: { senderKey: string | null; newKind: string | null }): string[] {
  return [senderPatternKey(item.senderKey), newKindPatternKey(item.newKind)].filter((key): key is string => key !== null);
}

/**
 * How an item was handled, as a rule value ("event.create note.create"), or
 * null when it can't be one: no operations, or any operation that isn't a
 * record capability a new kind uses (money, health, an action, a school or
 * finance record all stay with the model and their own rules).
 */
export function patternValue(decision: readonly { capability: string; op: string }[]): string | null {
  if (decision.length === 0) return null;
  const parts = new Set<string>();
  for (const op of decision) {
    const id = op.capability as CapabilityId;
    if (!PATTERN_CAPABILITIES.has(id) || CAPABILITIES[id]?.safety !== "record" || op.op !== "create") return null;
    parts.add(`${id}.${op.op}`);
  }
  return [...parts].sort().join(" ");
}

export function valueCapabilities(value: string | null | undefined): PatternCapability[] {
  return (value ?? "")
    .split(" ")
    .map((part) => part.replace(/\.create$/, ""))
    .filter((id): id is PatternCapability => (PATTERN_CAPABILITY_IDS as readonly string[]).includes(id));
}

function memoryKeys(memory: DecisionMemory): string[] {
  return patternKeys({ senderKey: memory.senderKey, newKind: memory.newKind });
}

/** The household's memories of one pattern since its last correction or Undo, newest first. */
export function sinceLastCorrection(memories: readonly DecisionMemory[], key: string): { since: DecisionMemory[]; broken: DecisionMemory | null } {
  const since: DecisionMemory[] = [];
  const ordered = [...memories].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  for (const memory of ordered) {
    if (!memoryKeys(memory).includes(key)) continue;
    if (BREAKS.has(memory.outcome)) return { since, broken: memory };
    since.push(memory);
  }
  return { since, broken: null };
}

export type Promotion = { key: string; value: string; evidence: DecisionMemory[] };

/**
 * Whether a pattern has earned a rule: at least three confirmations of the
 * same handling since its last correction or Undo, and no confirmation of a
 * different handling in that time.
 */
export function promotionFor(memories: readonly DecisionMemory[], key: string): Promotion | null {
  const confirmed = sinceLastCorrection(memories, key).since.filter((memory) => COUNTS.has(memory.outcome));
  const values = new Set(confirmed.map((memory) => patternValue(memory.decision)));
  if (values.size !== 1) return null;
  const [value] = [...values];
  if (!value || confirmed.length < PROMOTE_AFTER) return null;
  return { key, value, evidence: confirmed };
}

/** The live rule for an item, sender first, then its new kind. */
export function learnedRuleFor(rules: readonly HouseholdRule[], item: { senderKey: string | null; newKind: string | null }): HouseholdRule | null {
  for (const key of patternKeys(item)) {
    const rule = ruleFor(rules, "decision_pattern", key);
    if (rule && valueCapabilities(rule.valueText).length > 0) return rule;
  }
  return null;
}

/** What the model is told before it decides: the household's own rule for this sender. Capabilities only, no content. */
export function learnedRuleLine(rule: HouseholdRule | null): string | null {
  if (!rule) return null;
  const caps = valueCapabilities(rule.valueText);
  return `Household rule (confirmed ${rule.times} times, never corrected): items from this sender become ${caps.join(" + ")}. Follow it unless what was sent is plainly something else.`;
}

/**
 * The model's decision for a new kind, held to the household's rule: the
 * operations the rule doesn't name are dropped, the note is always kept, and
 * the decision is the rule's. Only a new-kind decision (the only kind a rule
 * is learned from); anything else, or a rule that would leave nothing, is
 * returned unchanged. Validation still runs after.
 */
export function applyLearnedRule(decision: HomeSendDecision, rule: HouseholdRule | null): HomeSendDecision {
  if (!rule || !decision.newKind) return decision;
  const allowed = new Set<string>(valueCapabilities(rule.valueText));
  if (allowed.size === 0) return decision;
  const operations = decision.operations.filter((op) => op.capability === "note" || (op.op === "create" && allowed.has(op.capability)));
  if (operations.length === 0) return decision;
  return { ...decision, operations, source: "learned_rule" };
}

/** "Why?" for a rule, from the household's own memory rows: never a model. */
export function ruleEvidence(memories: readonly DecisionMemory[], rule: Pick<HouseholdRule, "key" | "mixed">): { confirmed: DecisionMemory[]; broken: DecisionMemory | null } {
  const { since, broken } = sinceLastCorrection(memories, rule.key);
  return { confirmed: since.filter((memory) => COUNTS.has(memory.outcome)).slice(0, 5), broken: rule.mixed ? broken : null };
}

type Writer = { householdId: string; byMemberId: string | null; itemId: string | null; now?: Date };

/** Keeps a promoted rule (or promotes a demoted one again). Never throws. */
export async function promoteRule(client: SupabaseClient, promotion: Promotion, by: Writer): Promise<boolean> {
  try {
    const { error } = await client.from("homesend_learned_defaults").upsert(
      {
        household_id: by.householdId,
        kind: "decision_pattern",
        key: promotion.key.slice(0, 320),
        value_member_id: null,
        value_text: promotion.value,
        learned_by_member_id: by.byMemberId,
        learned_from_item_id: by.itemId,
        learned_at: (by.now ?? new Date()).toISOString(),
        mixed: false,
        source: "confirmations",
        times: promotion.evidence.length,
      },
      { onConflict: "household_id,kind,key" },
    );
    return !error;
  } catch {
    return false;
  }
}

/** One correction or Undo demotes the pattern's rule: it settles nothing until confirmed three more times. Never throws. */
export async function demoteRules(client: SupabaseClient, keys: readonly string[], by: Writer): Promise<void> {
  if (keys.length === 0) return;
  try {
    await client
      .from("homesend_learned_defaults")
      .update({ mixed: true, source: "correction", learned_by_member_id: by.byMemberId, learned_at: (by.now ?? new Date()).toISOString() })
      .eq("household_id", by.householdId)
      .eq("kind", "decision_pattern")
      .in("key", [...keys])
      .eq("mixed", false);
  } catch {
    // The correction itself already happened.
  }
}

/** After an outcome is recorded: promote on a confirmation, demote on a correction or Undo. Never throws. */
export async function learnFromOutcome(
  client: SupabaseClient,
  memories: readonly DecisionMemory[],
  item: { senderKey: string | null; newKind: string | null; intakeId: string },
  outcome: DecisionOutcome,
  by: Writer,
): Promise<number> {
  const keys = patternKeys(item);
  if (BREAKS.has(outcome)) {
    await demoteRules(client, keys, by);
    return 0;
  }
  if (!COUNTS.has(outcome)) return 0;
  let promoted = 0;
  for (const key of keys) {
    const promotion = promotionFor(memories, key);
    if (promotion && (await promoteRule(client, promotion, { ...by, itemId: item.intakeId }))) promoted += 1;
  }
  return promoted;
}
