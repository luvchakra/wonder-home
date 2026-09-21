import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import type { HomeAssessment } from "../home/assessment";
import { ageBandFor, parseDateOfBirth } from "../identity/age";
import { assessCommunication, type SchoolCommunication } from "./communications";
import type { ExistingSchoolItemImport, SchoolItemsSyncPlan } from "./school-sync";
import type { TranslatedSchoolItem } from "./connector";
import { assessDeadline, childView, type SchoolItem, type SchoolItemKind, type SchoolItemStatus } from "./items";

/**
 * Reading and writing school work (module 08).
 *
 * Every read goes through the caller's own client, so guardianship is enforced
 * by RLS as well as by the route. That redundancy is the point: the acceptance
 * criterion asks for guardian authorization "at both API and database layers",
 * and a single check is a single mistake away from a child's homework being
 * visible to the whole house.
 */

type Row = Record<string, unknown>;

export async function listSchoolItems(
  supabase: SupabaseClient,
  householdId: string,
  options: { childMemberId?: string } = {},
): Promise<SchoolItem[]> {
  let query = supabase
    .from("school_items")
    .select(
      "id, child_member_id, kind, title, subject, detail, due_at, estimated_minutes, estimate_source, status, completed_at, provider, external_id",
    )
    .eq("household_id", householdId)
    .order("due_at", { ascending: true, nullsFirst: false });

  if (options.childMemberId) query = query.eq("child_member_id", options.childMemberId);

  const { data, error } = await query;
  if (error) throw new Error(`listSchoolItems failed: ${error.code ?? "unknown"}`);

  return (data ?? []).map(toItem);
}

function toItem(row: Row): SchoolItem {
  return {
    id: row.id as string,
    childMemberId: row.child_member_id as string,
    kind: row.kind as SchoolItemKind,
    title: row.title as string,
    subject: (row.subject as string | null) ?? null,
    detail: (row.detail as string | null) ?? null,
    dueAt: row.due_at ? new Date(row.due_at as string) : null,
    estimatedMinutes: (row.estimated_minutes as number | null) ?? null,
    estimateSource: (row.estimate_source as SchoolItem["estimateSource"]) ?? null,
    status: row.status as SchoolItemStatus,
    completedAt: row.completed_at ? new Date(row.completed_at as string) : null,
    provider: (row.provider as string | null) ?? null,
    externalId: (row.external_id as string | null) ?? null,
  };
}

export type CreateSchoolItemInput = {
  householdId: string;
  childMemberId: string;
  kind: SchoolItemKind;
  title: string;
  subject?: string | null;
  detail?: string | null;
  dueAt?: string | null;
  estimatedMinutes?: number | null;
};

export async function createSchoolItem(
  supabase: SupabaseClient,
  input: CreateSchoolItemInput,
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("school_items")
    .insert({
      household_id: input.householdId,
      child_member_id: input.childMemberId,
      kind: input.kind,
      title: input.title,
      subject: input.subject ?? null,
      detail: input.detail ?? null,
      due_at: input.dueAt ?? null,
      estimated_minutes: input.estimatedMinutes ?? null,
      // A household typing in an estimate is a person confirming it, which is a
      // stronger source than anything WonderHome infers.
      estimate_source: input.estimatedMinutes == null ? null : "member_confirmed",
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "42501") {
      throw ApiError.forbidden("Only this child's guardians can add school work for them.");
    }
    if (error.code === "23503") throw ApiError.badRequest("That child is not part of this household.");
    throw new Error(`createSchoolItem failed: ${error.code ?? "unknown"}`);
  }

  return { id: (data as Row).id as string };
}

/**
 * Records that a piece of work is finished.
 *
 * Only ever called from a person's action. The completion source is written
 * alongside so that "a child said they did it" is distinguishable forever from
 * anything a portal reported, and the database's own constraint refuses a
 * completion that does not say who said so.
 */
export async function completeSchoolItem(
  supabase: SupabaseClient,
  itemId: string,
  source: "member_confirmed" | "provider_confirmed" = "member_confirmed",
): Promise<void> {
  const { error } = await supabase
    .from("school_items")
    .update({ status: "done", completed_at: new Date().toISOString(), completion_source: source })
    .eq("id", itemId);

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("This is not yours to mark done.");
    throw new Error(`completeSchoolItem failed: ${error.code ?? "unknown"}`);
  }
}

export type UpdateSchoolItemInput = {
  childMemberId?: string;
  kind?: SchoolItemKind;
  title?: string;
  subject?: string | null;
  detail?: string | null;
  dueAt?: string | null;
  estimatedMinutes?: number | null;
};

/**
 * The other half of adding a piece of school work (CLAUDE.md rule 12): a
 * household correcting what it already entered, the same way
 * `updateMemberProfile` lets it correct a person's details.
 */
export async function updateSchoolItem(
  supabase: SupabaseClient,
  householdId: string,
  itemId: string,
  input: UpdateSchoolItemInput,
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (input.childMemberId !== undefined) patch.child_member_id = input.childMemberId;
  if (input.kind !== undefined) patch.kind = input.kind;
  if (input.title !== undefined) patch.title = input.title;
  if (input.subject !== undefined) patch.subject = input.subject;
  if (input.detail !== undefined) patch.detail = input.detail;
  if (input.dueAt !== undefined) patch.due_at = input.dueAt;
  if (input.estimatedMinutes !== undefined) {
    patch.estimated_minutes = input.estimatedMinutes;
    // A household correcting the estimate is a person confirming it, same as at creation.
    patch.estimate_source = input.estimatedMinutes == null ? null : "member_confirmed";
  }

  if (Object.keys(patch).length === 0) return;

  const { data, error } = await supabase
    .from("school_items")
    .update(patch)
    .eq("id", itemId)
    .eq("household_id", householdId)
    .select("id");

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only this child's guardians can change this.");
    throw new Error(`updateSchoolItem failed: ${error.code ?? "unknown"}`);
  }
  if (!data || data.length === 0) throw ApiError.notFound("That is not part of this household.");
}

/**
 * Stands a piece of school work down (rule 12's "remove", for a table that
 * already carries a status rather than a delete: `cancelled` already exists
 * for exactly this — a provider-cancelled item and a household-withdrawn
 * one look the same afterwards, which is correct, since neither is live
 * work anymore).
 */
export async function cancelSchoolItem(
  supabase: SupabaseClient,
  householdId: string,
  itemId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("school_items")
    .update({ status: "cancelled" })
    .eq("id", itemId)
    .eq("household_id", householdId)
    .select("id");

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only this child's guardians can remove this.");
    throw new Error(`cancelSchoolItem failed: ${error.code ?? "unknown"}`);
  }
  if (!data || data.length === 0) throw ApiError.notFound("That is not part of this household.");
}

export async function listCommunications(
  supabase: SupabaseClient,
  householdId: string,
): Promise<SchoolCommunication[]> {
  const { data, error } = await supabase
    .from("school_communications")
    .select("id, child_member_id, received_at, subject, summary, requires_action, action_label, action_due_at")
    .eq("household_id", householdId)
    .order("received_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(`listCommunications failed: ${error.code ?? "unknown"}`);

  return (data ?? []).map((row: Row) => ({
    id: row.id as string,
    childMemberId: (row.child_member_id as string | null) ?? null,
    receivedAt: new Date(row.received_at as string),
    subject: (row.subject as string | null) ?? null,
    summary: row.summary as string,
    requiresAction: row.requires_action as boolean,
    actionLabel: (row.action_label as string | null) ?? null,
    actionDueAt: row.action_due_at ? new Date(row.action_due_at as string) : null,
  }));
}

export type SchoolAgenda = {
  deadlines: HomeAssessment[];
  messages: HomeAssessment[];
  checked: number;
};

/**
 * What school currently needs from this household.
 *
 * The free time each child has before a deadline is not modelled yet — module
 * 12 owns the family calendar — so the assessment is given the honest amount:
 * the hours remaining, which is an upper bound. That overstates availability
 * rather than understating it, so nothing is called at risk purely because
 * WonderHome cannot see the diary.
 */
export async function schoolAgenda(
  supabase: SupabaseClient,
  householdId: string,
  options: { now?: Date } = {},
): Promise<SchoolAgenda> {
  const now = options.now ?? new Date();

  const [items, communications, children] = await Promise.all([
    listSchoolItems(supabase, householdId),
    listCommunications(supabase, householdId),
    supabase
      .from("household_members")
      .select("id, date_of_birth")
      .eq("household_id", householdId)
      .eq("member_type", "child"),
  ]);

  const ageByChild = new Map(
    (children.data ?? []).map((row: Row) => [
      row.id as string,
      ageBandFor(parseDateOfBirth((row.date_of_birth as string | null) ?? null)),
    ]),
  );

  const deadlines = items
    .map((item) =>
      assessDeadline(item, {
        now,
        availableMinutesBeforeDue: item.dueAt
          ? Math.max(0, (item.dueAt.getTime() - now.getTime()) / 60_000)
          : Number.POSITIVE_INFINITY,
        ageBand: ageByChild.get(item.childMemberId) ?? null,
      }),
    )
    .filter((assessment) => assessment.notable);

  const messages = communications
    .map((communication) => assessCommunication(communication, now))
    .filter((assessment) => assessment.notable);

  return { deadlines, messages, checked: items.length + communications.length };
}

/** A child's own plan: their work, their words, nothing of anybody else's. */
export async function childSchoolView(
  supabase: SupabaseClient,
  householdId: string,
  childMemberId: string,
  now: Date = new Date(),
) {
  const items = await listSchoolItems(supabase, householdId, { childMemberId });
  return childView(items, now);
}

/**
 * School items this connection has imported before, as reconciliation needs
 * them (17-004). Status travels with identity: a reconciler has to know
 * whether an item is already submitted or done before it can decide whether
 * a provider's cancellation signal is safe to apply.
 */
export async function listImportedSchoolItems(
  supabase: SupabaseClient,
  integrationId: string,
): Promise<ExistingSchoolItemImport[]> {
  const { data, error } = await supabase
    .from("school_items")
    .select("id, external_id, status")
    .eq("integration_id", integrationId);

  if (error) throw new Error(`listImportedSchoolItems failed: ${error.code ?? "unknown"}`);

  return ((data as Row[] | null) ?? []).map((row) => ({
    id: row.id as string,
    externalId: row.external_id as string,
    status: row.status as ExistingSchoolItemImport["status"],
  }));
}

/**
 * Writes a school sync plan (17-004).
 *
 * An insert is source-tagged by the provider column and starts at 'pending',
 * unless the provider itself reported the item cancelled, in which case it is
 * inserted already cancelled — there is no one's completion to protect yet. An
 * update touches only content columns and, when the plan says so, `status`
 * to 'cancelled' — never to 'done' or 'submitted', which only a person or a
 * provider-confirmed completion (never written here) may set.
 */
export async function applySchoolItemsSyncPlan(
  supabase: SupabaseClient,
  input: { householdId: string; integrationId: string; plan: SchoolItemsSyncPlan },
): Promise<void> {
  const { householdId, integrationId, plan } = input;
  const fail = (step: string, error: { code?: string }) => {
    if (error.code === "42501") throw ApiError.forbidden("You cannot add school work to this household.");
    return new Error(`applySchoolItemsSyncPlan ${step} failed: ${error.code ?? "unknown"}`);
  };

  if (plan.insert.length > 0) {
    const { error } = await supabase.from("school_items").insert(
      plan.insert.map((item) => ({
        household_id: householdId,
        integration_id: integrationId,
        status: item.providerCancelled ? "cancelled" : "pending",
        ...schoolItemColumns(item),
      })),
    );
    if (error) throw fail("insert", error);
  }

  for (const { id, item, cancel } of plan.update) {
    const { error } = await supabase
      .from("school_items")
      .update({ ...schoolItemColumns(item), ...(cancel ? { status: "cancelled" } : {}) })
      .eq("id", id);
    if (error) throw fail("update", error);
  }
}

function schoolItemColumns(item: TranslatedSchoolItem) {
  return {
    child_member_id: item.childMemberId,
    external_id: item.externalId,
    kind: item.kind,
    title: item.title,
    subject: item.subject,
    due_at: item.dueAt ? item.dueAt.toISOString() : null,
    estimated_minutes: item.estimatedMinutes,
    estimate_source: item.estimateSource,
    provider: item.provider,
  };
}
