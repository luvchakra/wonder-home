import type { SupabaseClient } from "@supabase/supabase-js";

import { auditChange } from "../api/audit";
import { dispatchWebhookEvent } from "../webhooks/dispatch";
import type { HomeSendChange, HomeSendChangeDomain, HomeSendChangeType } from "./items";

/**
 * What a routed HomeSend item actually wrote (HomeSend Phase 1 — undo;
 * Phase 3 — up to one row per domain per intake, once a secondary grocery
 * suggestion is confirmed alongside the primary bill/school item).
 *
 * Undo calls the matching domain service directly (`cancelObligation` /
 * `cancelSchoolItem` / `retireConsumable`, from
 * `apps/web/app/(auth)/home-send-actions.ts`) — this file only records
 * that it happened and that it was reversed, the same "repository never
 * writes outside its own table" contract `homesend/repository.ts` keeps
 * for `home_send_items`.
 */

type Row = Record<string, unknown>;

function fromRow(row: Row): HomeSendChange {
  return {
    id: row.id as string,
    householdId: row.household_id as string,
    intakeId: row.intake_id as string,
    domain: row.domain as HomeSendChangeDomain,
    entityId: row.entity_id as string,
    createdByMemberId: row.created_by_member_id as string,
    createdAt: row.created_at as string,
    undoneAt: (row.undone_at as string | null) ?? null,
    undoneByMemberId: (row.undone_by_member_id as string | null) ?? null,
    changeType: ((row.change_type as HomeSendChangeType | undefined) ?? "created"),
    previous: (row.previous as Record<string, unknown> | null) ?? null,
    planKey: (row.plan_key as string | null) ?? null,
    fields: (row.fields as HomeSendChange["fields"]) ?? null,
    evidence: (row.evidence as HomeSendChange["evidence"]) ?? null,
  };
}

const SELECT_COLUMNS =
  "id, household_id, intake_id, domain, entity_id, created_by_member_id, created_at, undone_at, undone_by_member_id, change_type, previous, plan_key, fields, evidence";

export async function listHomeSendChanges(supabase: SupabaseClient, householdId: string): Promise<HomeSendChange[]> {
  const { data, error } = await supabase
    .from("homesend_changes")
    .select(SELECT_COLUMNS)
    .eq("household_id", householdId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`listHomeSendChanges failed: ${error.code ?? "unknown"}`);
  return (data ?? []).map((row) => fromRow(row as Row));
}

export async function getHomeSendChange(
  supabase: SupabaseClient,
  householdId: string,
  changeId: string,
): Promise<HomeSendChange | null> {
  const { data, error } = await supabase
    .from("homesend_changes")
    .select(SELECT_COLUMNS)
    .eq("household_id", householdId)
    .eq("id", changeId)
    .maybeSingle();

  if (error) throw new Error(`getHomeSendChange failed: ${error.code ?? "unknown"}`);
  return data ? fromRow(data as Row) : null;
}

/** Whether any of an intake's writes are still live — an intake with a secondary alongside its primary is not fully undone until both are. */
export async function hasActiveHomeSendChanges(
  supabase: SupabaseClient,
  householdId: string,
  intakeId: string,
): Promise<boolean> {
  const { count, error } = await supabase
    .from("homesend_changes")
    .select("id", { count: "exact", head: true })
    .eq("household_id", householdId)
    .eq("intake_id", intakeId)
    .is("undone_at", null);

  if (error) throw new Error(`hasActiveHomeSendChanges failed: ${error.code ?? "unknown"}`);
  return (count ?? 0) > 0;
}

export type RecordHomeSendChangeInput = {
  householdId: string;
  intakeId: string;
  domain: HomeSendChangeDomain;
  entityId: string;
  createdByMemberId: string;
  /** Defaults to `created`. An update or a cancellation must say what it replaced, so undo can put it back (§10). */
  changeType?: HomeSendChangeType;
  previous?: Record<string, unknown> | null;
  /** From a document plan (DDU 2.0): which record, what changed, and where it was read. */
  planKey?: string | null;
  fields?: HomeSendChange["fields"];
  evidence?: HomeSendChange["evidence"];
};

export async function recordHomeSendChange(
  supabase: SupabaseClient,
  input: RecordHomeSendChangeInput,
): Promise<HomeSendChange> {
  const { data, error } = await supabase
    .from("homesend_changes")
    .insert({
      household_id: input.householdId,
      intake_id: input.intakeId,
      domain: input.domain,
      entity_id: input.entityId,
      created_by_member_id: input.createdByMemberId,
      change_type: input.changeType ?? "created",
      previous: input.changeType && input.changeType !== "created" ? (input.previous ?? {}) : null,
      ...(input.planKey ? { plan_key: input.planKey, fields: input.fields ?? [], evidence: input.evidence ?? null } : {}),
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error) throw new Error(`recordHomeSendChange failed: ${error.code ?? "unknown"}`);

  await auditChange({
    householdId: input.householdId,
    actorMemberId: input.createdByMemberId,
    eventType: "homesend.applied",
    targetTable: input.domain,
    targetId: input.entityId,
    metadata: { intakeId: input.intakeId, changeType: input.changeType ?? "created" },
  });

  await dispatchWebhookEvent({
    householdId: input.householdId,
    eventType: "homesend.applied",
    data: { domain: input.domain, entityId: input.entityId },
  });

  return fromRow(data as Row);
}

export async function undoHomeSendChange(
  supabase: SupabaseClient,
  householdId: string,
  changeId: string,
  actorMemberId: string,
): Promise<void> {
  const { error } = await supabase
    .from("homesend_changes")
    .update({ undone_at: new Date().toISOString(), undone_by_member_id: actorMemberId })
    .eq("household_id", householdId)
    .eq("id", changeId);

  if (error) throw new Error(`undoHomeSendChange failed: ${error.code ?? "unknown"}`);

  await auditChange({
    householdId,
    actorMemberId,
    eventType: "homesend.undone",
    targetTable: "homesend_changes",
    targetId: changeId,
  });
}
