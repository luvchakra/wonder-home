import { recordDecisionOutcome } from "./decision-memory";
import type { SupabaseClient } from "@supabase/supabase-js";

import { auditChange } from "../api/audit";
import { dispatchWebhookEvent } from "../webhooks/dispatch";
import type { HomeSendChange, HomeSendChangeDomain, HomeSendChangeType, HomeSendConfirmationState } from "./items";

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
  const changes = (data ?? []).map((row) => fromRow(row as Row));
  return withConfirmation(supabase, householdId, changes);
}

/**
 * Each change's checking state and score (the owner, 2026-11-03), read on
 * their own so a database without the columns yet (the migration lands after
 * the deploy) still lists every change, all "confirmed".
 */
export async function withConfirmation(supabase: SupabaseClient, householdId: string, changes: HomeSendChange[]): Promise<HomeSendChange[]> {
  if (changes.length === 0) return changes;
  const { data, error } = await supabase
    .from("homesend_changes")
    .select("id, confirmation_state, confidence")
    .eq("household_id", householdId)
    .in("id", changes.map((change) => change.id).slice(0, 500));
  if (error || !data) return changes.map((change) => ({ ...change, confirmationState: "confirmed", confidence: null }));
  const states = new Map((data as Row[]).map((row) => [row.id as string, row]));
  return changes.map((change) => {
    const row = states.get(change.id);
    const confidence = row?.confidence === null || row?.confidence === undefined ? null : Number(row.confidence);
    return { ...change, confirmationState: row?.confirmation_state === "unconfirmed" ? "unconfirmed" : "confirmed", confidence: Number.isFinite(confidence) ? confidence : null };
  });
}

/**
 * The records HomeSend added that are still being checked, live ones only:
 * their own reminders wait until they are confirmed (the owner, 2026-11-03).
 * Empty when the columns aren't there yet, so nothing is held by mistake.
 */
export async function unconfirmedEntityIds(client: SupabaseClient, householdId: string): Promise<Set<string>> {
  const { data, error } = await client
    .from("homesend_changes")
    .select("entity_id")
    .eq("household_id", householdId)
    .eq("confirmation_state", "unconfirmed")
    .is("undone_at", null)
    .limit(500);
  if (error || !data) return new Set();
  return new Set((data as Row[]).map((row) => row.entity_id as string));
}

/**
 * Bills HomeSend added or updated from something sent in, live ones only:
 * "Tidy up" suggests keeping one of these over a hand-typed twin (the owner,
 * 2026-11-20). Empty when it cannot be read; it only shapes a suggestion.
 */
export async function sourcedBillIds(client: SupabaseClient, householdId: string): Promise<Set<string>> {
  const { data, error } = await client
    .from("homesend_changes")
    .select("entity_id")
    .eq("household_id", householdId)
    .eq("domain", "bill")
    .is("undone_at", null)
    .limit(500);
  if (error || !data) return new Set();
  return new Set((data as Row[]).map((row) => row.entity_id as string));
}

/** How an unconfirmed entry became confirmed: a person said it is right, or answers raised it over the bar. */
export type ConfirmedBy = { memberId: string; how: "person" } | { memberId: string; how: "answers"; confidence: number };

/**
 * Marks what a HomeSend item added confirmed — every live, unconfirmed write
 * of it (a receipt's lines together): its "Checking" goes and its reminders
 * start (the owner, 2026-11-03). How many moved; 0 when none was waiting
 * (already confirmed, undone, or not this household's). Through the caller's
 * own client, so RLS decides.
 */
export async function confirmHomeSendEntry(
  supabase: SupabaseClient,
  householdId: string,
  intakeId: string,
  by: ConfirmedBy,
): Promise<number> {
  const { data, error } = await supabase
    .from("homesend_changes")
    .update({
      confirmation_state: "confirmed",
      confirmed_at: new Date().toISOString(),
      confirmed_by_member_id: by.how === "person" ? by.memberId : null,
      // Why it is confirmed (14-069, `homesend_changes.confirmed_basis`): a person said so, or answers raised it over the bar.
      confirmed_basis: by.how === "person" ? "person" : "answer",
      ...(by.how === "answers" ? { confidence: Math.round(Math.min(1, Math.max(0, by.confidence)) * 1000) / 1000 } : {}),
    })
    .eq("household_id", householdId)
    .eq("intake_id", intakeId)
    .eq("confirmation_state", "unconfirmed")
    .is("undone_at", null)
    .select("id, domain, entity_id");
  if (error) throw new Error(`confirmHomeSendEntry failed: ${error.code ?? "unknown"}`);
  const rows = (data as Row[] | null) ?? [];
  for (const row of rows) {
    await auditChange({
      householdId,
      actorMemberId: by.memberId,
      eventType: "homesend.confirmed",
      targetTable: row.domain as string,
      targetId: row.entity_id as string,
      metadata: { intakeId, how: by.how, ...(by.how === "answers" ? { confidence: by.confidence } : {}) },
    });
  }
  // A person said it is right, or their answers raised it (14-083): remembered with its decision.
  if (rows.length > 0) await recordDecisionOutcome(supabase, householdId, intakeId, by.how === "person" ? "confirmed" : "answered", undefined, by.memberId ?? null);
  return rows.length;
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
  /**
   * Added by HomeSend on its own (the owner, 2026-11-03): audited as
   * `homesend.auto_added` with how sure and from where, and "unconfirmed"
   * while below the household's bar. Absent for a person's own confirm.
   */
  auto?: { state: HomeSendConfirmationState; confidence: number | null; source: string | null };
};

/** Postgres "undefined column" or PostgREST "column not in schema cache": the migration isn't live yet. */
function missingColumn(error: { code?: string } | null): boolean {
  return error?.code === "42703" || error?.code === "PGRST204";
}

export async function recordHomeSendChange(
  supabase: SupabaseClient,
  input: RecordHomeSendChangeInput,
): Promise<HomeSendChange> {
  const row = {
    household_id: input.householdId,
    intake_id: input.intakeId,
    domain: input.domain,
    entity_id: input.entityId,
    created_by_member_id: input.createdByMemberId,
    change_type: input.changeType ?? "created",
    previous: input.changeType && input.changeType !== "created" ? (input.previous ?? {}) : null,
    ...(input.planKey ? { plan_key: input.planKey, fields: input.fields ?? [], evidence: input.evidence ?? null } : {}),
  };
  const confidence = typeof input.auto?.confidence === "number" && Number.isFinite(input.auto.confidence) ? Math.min(1, Math.max(0, Math.round(input.auto.confidence * 1000) / 1000)) : null;
  const checking = input.auto ? { confirmation_state: input.auto.state, confidence } : {};
  let { data, error } = await supabase.from("homesend_changes").insert({ ...row, ...checking }).select(SELECT_COLUMNS).single();
  // Before the migration is live the entry is still added, just without its checking state.
  if (error && input.auto && missingColumn(error)) ({ data, error } = await supabase.from("homesend_changes").insert(row).select(SELECT_COLUMNS).single());

  if (error) throw new Error(`recordHomeSendChange failed: ${error.code ?? "unknown"}`);

  await auditChange({
    householdId: input.householdId,
    actorMemberId: input.createdByMemberId,
    eventType: input.auto ? "homesend.auto_added" : "homesend.applied",
    targetTable: input.domain,
    targetId: input.entityId,
    metadata: {
      intakeId: input.intakeId,
      changeType: input.changeType ?? "created",
      ...(input.auto ? { confirmationState: input.auto.state, confidence, source: input.auto.source } : {}),
    },
  });

  await dispatchWebhookEvent({
    householdId: input.householdId,
    eventType: "homesend.applied",
    data: { domain: input.domain, entityId: input.entityId },
  });

  return { ...fromRow(data as Row), ...(input.auto ? { confirmationState: input.auto.state, confidence } : {}) };
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

  // The household undid what HomeSend decided (14-083): its next similar item learns not to.
  const { data: undone } = await supabase.from("homesend_changes").select("intake_id").eq("household_id", householdId).eq("id", changeId).maybeSingle();
  if (undone?.intake_id) await recordDecisionOutcome(supabase, householdId, undone.intake_id as string, "undone", undefined, actorMemberId);

  await auditChange({
    householdId,
    actorMemberId,
    eventType: "homesend.undone",
    targetTable: "homesend_changes",
    targetId: changeId,
  });
}

/**
 * A person acted on an entry HomeSend added while it was still Checking —
 * marked it paid or done, or edited it — so it is confirmed (decision 3, the
 * owner, 2026-11-14): acting on it is saying it is right. Through the
 * person's own client, in their name, audited `homesend.confirmed` with
 * `how: "acted"`. Its open "Needs you" question is then settled (the next
 * deadlines pass withdraws it). Never throws: the action it follows has
 * already succeeded, and a missing confirm only leaves the "not yet
 * confirmed" mark on.
 */
export async function confirmByAction(supabase: SupabaseClient, householdId: string, entityId: string, memberId: string, basis: "person" | "marked_paid" = "person"): Promise<number> {
  try {
    const confirm = (why: ConfirmedBasis | null) =>
      supabase
        .from("homesend_changes")
        .update({ confirmation_state: "confirmed", confirmed_at: new Date().toISOString(), confirmed_by_member_id: memberId, confirmed_basis: why })
        .eq("household_id", householdId)
        .eq("entity_id", entityId)
        .eq("confirmation_state", "unconfirmed")
        .is("undone_at", null)
        .select("id, domain, entity_id, intake_id");
    let { data, error } = await confirm(basis);
    // Before the migration allowing "marked_paid" is live: confirmed by a person, as before.
    if (error && basisRefused(error)) ({ data, error } = await confirm("person"));
    if (error) return 0;
    const rows = (data as Row[] | null) ?? [];
    for (const row of rows) {
      await auditChange({ householdId, actorMemberId: memberId, eventType: "homesend.confirmed", targetTable: row.domain as string, targetId: row.entity_id as string, metadata: { intakeId: row.intake_id, how: "acted", basis } });
    }
    return rows.length;
  } catch {
    return 0;
  }
}

/**
 * Why an entry is confirmed (`homesend_changes.confirmed_basis`). Beyond a
 * person, an answer, the bar and the nightly evidence, the owner's
 * 2026-11-20 review adds confirmation by action and evidence: a payment
 * proof, a matching receipt from the payee, marking it paid, and its due date
 * passing with no correction and no conflict (never for health).
 */
export const CONFIRMED_BASES = ["person", "answer", "bar", "second_source", "recurring", "payment_proof", "receipt", "marked_paid", "due_passed"] as const;
export type ConfirmedBasis = (typeof CONFIRMED_BASES)[number];
/** The bases the 2026-11-20 migration adds; until it is live the check refuses them. */
const NEW_BASES: ReadonlySet<ConfirmedBasis> = new Set(["payment_proof", "receipt", "marked_paid", "due_passed"]);

/** A check constraint refused the value (the basis migration isn't live yet). */
function basisRefused(error: { code?: string } | null): boolean {
  return error?.code === "23514";
}

/** Whether a basis needs the 2026-11-20 migration. */
export function isNewBasis(basis: ConfirmedBasis): boolean {
  return NEW_BASES.has(basis);
}

/**
 * Confirms every live Checking entry of one record by evidence, not by a tap:
 * a payment proof or a receipt from the payee (decision 2). Never a health
 * record. Through the caller's client (the deadlines pass's service role),
 * audited `homesend.confirmed` with the basis. Before the migration is live
 * the entry is still confirmed, its basis left blank. Never throws.
 */
export async function confirmByEvidence(
  client: SupabaseClient,
  householdId: string,
  entityId: string,
  basis: Exclude<ConfirmedBasis, "person" | "answer">,
  options: { intakeId?: string; now?: Date } = {},
): Promise<number> {
  try {
    const at = (options.now ?? new Date()).toISOString();
    const confirm = (why: ConfirmedBasis | null) => {
      let query = client
        .from("homesend_changes")
        .update({ confirmation_state: "confirmed", confirmed_at: at, confirmed_basis: why })
        .eq("household_id", householdId)
        .eq("entity_id", entityId)
        .neq("domain", "health_document")
        .eq("confirmation_state", "unconfirmed")
        .is("undone_at", null);
      if (options.intakeId) query = query.neq("intake_id", options.intakeId);
      return query.select("id, domain, entity_id, intake_id");
    };
    let { data, error } = await confirm(basis);
    if (error && basisRefused(error)) ({ data, error } = await confirm(null));
    if (error) return 0;
    const rows = (data as Row[] | null) ?? [];
    for (const row of rows) {
      await auditChange({ householdId, eventType: "homesend.confirmed", targetTable: row.domain as string, targetId: row.entity_id as string, metadata: { intakeId: row.intake_id, how: "evidence", basis, ...(options.intakeId ? { evidenceIntakeId: options.intakeId } : {}) } });
    }
    return rows.length;
  } catch {
    return 0;
  }
}
