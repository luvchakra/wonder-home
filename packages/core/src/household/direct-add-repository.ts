import type { SupabaseClient } from "@supabase/supabase-js";

import { savePolicy } from "./configuration-repository";
import { asHealthFilers, HEALTH_FILERS_POLICY_NAME, pickableFiler, type HealthMember } from "../homesend/health-filers";
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
  const shown: MoneyHealthMode = modes.money === "review" || modes.health === "review" ? "review" : "confirmed";
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

/**
 * "Who may file health records for others" (`homesend/health-filers.ts`, the
 * owner 2026-11-20): the members an Admin picked; nobody when never picked or
 * when it can't be read (the careful answer: today's question stays).
 */
/** The household's members as "Who is this for?" weighs a health document's names (`health-filers.ts` `healthSubjectFor`); null when unreadable. */
export async function loadHealthMembers(supabase: SupabaseClient, householdId: string): Promise<HealthMember[] | null> {
  const { data, error } = await supabase.from("household_members").select("id, display_name, member_type, status").eq("household_id", householdId).limit(200);
  if (error) return null;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({ id: row.id as string, displayName: String(row.display_name ?? ""), memberType: (row.member_type as string | null) ?? null, status: (row.status as string | null) ?? null }));
}

export async function loadHealthFilers(supabase: SupabaseClient, householdId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("policies")
    .select("rule")
    .eq("household_id", householdId)
    .eq("category", "ai_autonomy")
    .eq("name", HEALTH_FILERS_POLICY_NAME)
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (error || !data) return [];
  return asHealthFilers((data as { rule: unknown }).rule);
}

/** Saved as a new policy version (Admins only, by RLS; audited by `savePolicy`). Only adults and helpers of this household are kept. */
export async function saveHealthFilers(
  supabase: SupabaseClient,
  input: { householdId: string; actorMemberId: string; memberIds: readonly string[] },
): Promise<{ id: string; downstream: string[]; members: string[] }> {
  const wanted = asHealthFilers({ members: input.memberIds });
  let members: string[] = [];
  if (wanted.length > 0) {
    const { data, error } = await supabase.from("household_members").select("id, member_type, status").eq("household_id", input.householdId).in("id", wanted);
    if (error) throw new Error(`health filers read failed: ${error.code ?? "unknown"}`);
    members = ((data ?? []) as { id: string; member_type: string; status: string }[]).filter((row) => row.status === "active" && pickableFiler(row.member_type)).map((row) => row.id);
  }
  const saved = await savePolicy(supabase, {
    householdId: input.householdId,
    actorMemberId: input.actorMemberId,
    category: "ai_autonomy",
    name: HEALTH_FILERS_POLICY_NAME,
    rule: { members },
  });
  return { ...saved, members };
}
