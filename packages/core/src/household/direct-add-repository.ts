import type { SupabaseClient } from "@supabase/supabase-js";

import { savePolicy } from "./configuration-repository";
import { directAddFrom, NO_DIRECT_ADD, type DirectAdd, type DirectAddArea } from "../homesend/auto-add";
import {
  asApprovalScope,
  asMoneyHealthMode,
  asOutsideSenderMode,
  CAREFUL_RECORD_FIRST,
  DEFAULT_RECORD_FIRST,
  moneyHealthFromLegacy,
  type ApprovalScope,
  type MoneyHealthMode,
  type OutsideSenderMode,
  type RecordFirstSettings,
} from "../homesend/record-first";

/**
 * The record-first settings (`homesend/record-first.ts`, the owner
 * 2026-11-14), kept like the bar (`auto-add-repository.ts`): one versioned
 * row each in `policies`, category `ai_autonomy`, so a change is audited and
 * Admins only. Nothing to migrate: a household that never picked one gets the
 * default, and one that turned on the old "Add money / health entries
 * directly" switches keeps "confirmed" for that area until an Admin picks.
 * A failure to read is the careful answer: everything waits.
 */

/** The two 2026-10-26 switches, still read so a household's earlier choice carries over. */
export const DIRECT_ADD_POLICY_NAMES: Record<DirectAddArea, string> = {
  money: "Add bills and receipts from HomeSend directly",
  health: "Add health documents from HomeSend directly",
};

export const RECORD_FIRST_POLICY_NAMES: Record<keyof RecordFirstSettings, string> = {
  approvalScope: "What Wait for Approval holds",
  moneyHealth: "Money and health entries from HomeSend",
  outsideSenders: "Email from new senders",
};

type PolicyRow = { name: string; rule: Record<string, unknown> | null };

async function readPolicies(supabase: SupabaseClient, householdId: string): Promise<PolicyRow[] | null> {
  const { data, error } = await supabase
    .from("policies")
    .select("name, rule")
    .eq("household_id", householdId)
    .eq("category", "ai_autonomy")
    .in("name", [...Object.values(DIRECT_ADD_POLICY_NAMES), ...Object.values(RECORD_FIRST_POLICY_NAMES)])
    .eq("active", true)
    .limit(10);
  if (error || !data) return null;
  return data as PolicyRow[];
}

function settingsFrom(rows: readonly PolicyRow[]): RecordFirstSettings & { legacy: Record<DirectAddArea, boolean>; moneyHealthPicked: boolean } {
  const rule = (name: string) => rows.find((row) => row.name === name)?.rule ?? null;
  const picked = rule(RECORD_FIRST_POLICY_NAMES.moneyHealth);
  const legacyOn = (area: DirectAddArea) => rule(DIRECT_ADD_POLICY_NAMES[area])?.on === true;
  return {
    approvalScope: asApprovalScope(rule(RECORD_FIRST_POLICY_NAMES.approvalScope)?.value),
    moneyHealth: picked ? asMoneyHealthMode(picked.value) : DEFAULT_RECORD_FIRST.moneyHealth,
    outsideSenders: asOutsideSenderMode(rule(RECORD_FIRST_POLICY_NAMES.outsideSenders)?.value),
    legacy: { money: legacyOn("money"), health: legacyOn("health") },
    moneyHealthPicked: picked !== null,
  };
}

/** Each area's money/health mode: the Admin's pick, else the old switch carried over. */
function areaModes(settings: ReturnType<typeof settingsFrom>): Record<DirectAddArea, MoneyHealthMode> {
  if (settings.moneyHealthPicked) return { money: settings.moneyHealth, health: settings.moneyHealth };
  return { money: moneyHealthFromLegacy(settings.legacy.money), health: moneyHealthFromLegacy(settings.legacy.health) };
}

/** All three settings, with what they let HomeSend record of money and health; the careful answer (everything waits) when they can't be read. */
export async function loadRecordFirst(supabase: SupabaseClient, householdId: string): Promise<RecordFirstSettings & { directAdd: DirectAdd }> {
  const rows = await readPolicies(supabase, householdId).catch(() => null);
  if (!rows) return { ...CAREFUL_RECORD_FIRST, directAdd: NO_DIRECT_ADD };
  const settings = settingsFrom(rows);
  const modes = areaModes(settings);
  // Shown as one choice: the old switches split it only until an Admin picks; the more careful of the two is shown.
  const shown: MoneyHealthMode = modes.money === modes.health ? modes.money : modes.money === "checking" || modes.health === "checking" ? "checking" : "confirmed";
  return { approvalScope: settings.approvalScope, moneyHealth: shown, outsideSenders: settings.outsideSenders, directAdd: directAddFrom(modes) };
}

/** What HomeSend may record of money and health (`auto-add.ts` `DirectAdd`); nothing when the settings can't be read. */
export async function loadDirectAdd(supabase: SupabaseClient, householdId: string): Promise<DirectAdd> {
  const rows = await readPolicies(supabase, householdId).catch(() => null);
  if (!rows) return NO_DIRECT_ADD;
  return directAddFrom(areaModes(settingsFrom(rows)));
}

export async function saveRecordFirst(
  supabase: SupabaseClient,
  input:
    | { householdId: string; actorMemberId: string; setting: "approvalScope"; value: ApprovalScope }
    | { householdId: string; actorMemberId: string; setting: "moneyHealth"; value: MoneyHealthMode }
    | { householdId: string; actorMemberId: string; setting: "outsideSenders"; value: OutsideSenderMode },
): Promise<{ id: string; downstream: string[] }> {
  return savePolicy(supabase, {
    householdId: input.householdId,
    actorMemberId: input.actorMemberId,
    category: "ai_autonomy",
    name: RECORD_FIRST_POLICY_NAMES[input.setting],
    rule: { value: input.value },
  });
}
