import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import type { HomeAssessment } from "../home/assessment";
import type { ExistingImport, ImportedEvent, ReconciliationPlan } from "./calendar-connector";
import {
  assessEvent,
  assessGift,
  commonAvailability,
  type BusyWindow,
  type EventKind,
  type FamilyEvent,
  type GiftPlan,
  type Window,
} from "./schedule";
import { invalidatesContext } from "../context/invalidation";

/**
 * Reading the family calendar (module 12).
 *
 * `availability` is the function the rest of the product has been waiting for:
 * school, meals and maintenance all estimate free time today and were written
 * to overstate it rather than invent it. It reads through wh.busy_windows,
 * which returns times and nothing about what anybody is doing — a planner that
 * could see why somebody is busy would have read a private appointment.
 */

type Row = Record<string, unknown>;

export async function listEvents(
  supabase: SupabaseClient,
  householdId: string,
  options: { from?: Date; to?: Date } = {},
): Promise<FamilyEvent[]> {
  let query = supabase
    .from("family_events")
    .select(
      "id, title, kind, starts_at, ends_at, protected, owner_member_id, status, action_state, action_due_at, event_participants(member_id, response, required)",
    )
    .eq("household_id", householdId)
    .order("starts_at", { ascending: true });

  if (options.from) query = query.gte("ends_at", options.from.toISOString());
  if (options.to) query = query.lte("starts_at", options.to.toISOString());

  const { data, error } = await query;
  if (error) throw new Error(`listEvents failed: ${error.code ?? "unknown"}`);

  return (data ?? []).map((row: Row) => ({
    id: row.id as string,
    title: row.title as string,
    kind: row.kind as EventKind,
    startsAt: new Date(row.starts_at as string),
    endsAt: new Date(row.ends_at as string),
    protected: row.protected as boolean,
    ownerMemberId: (row.owner_member_id as string | null) ?? null,
    status: row.status as FamilyEvent["status"],
    actionState: (row.action_state as FamilyEvent["actionState"]) ?? null,
    actionDueAt: row.action_due_at ? new Date(row.action_due_at as string) : null,
    participants: ((row.event_participants as Row[] | null) ?? []).map((participant) => ({
      memberId: participant.member_id as string,
      response: participant.response as "unknown" | "yes" | "no" | "maybe",
      required: participant.required as boolean,
    })),
  }));
}

/**
 * When the named people are all free.
 *
 * The one function other modules should call instead of assuming availability.
 * It never returns a title or a location, because the free/busy source does not
 * expose them.
 */
export async function availability(
  supabase: SupabaseClient,
  householdId: string,
  members: readonly string[],
  search: Window,
  options: { minimumMinutes?: number } = {},
): Promise<Window[]> {
  const { data, error } = await supabase.rpc("busy_windows", {
    p_household_id: householdId,
    p_from: search.start.toISOString(),
    p_to: search.end.toISOString(),
  });

  if (error) throw new Error(`availability failed: ${error.code ?? "unknown"}`);

  const busy: BusyWindow[] = ((data as Row[] | null) ?? []).map((row) => ({
    memberId: row.member_id as string,
    start: new Date(row.busy_from as string),
    end: new Date(row.busy_to as string),
    protected: row.protected as boolean,
  }));

  return commonAvailability(members, busy, search, options);
}

export type CreateEventInput = {
  householdId: string;
  title: string;
  kind?: EventKind;
  startsAt: string;
  endsAt: string;
  location?: string | null;
  protected?: boolean;
  ownerMemberId?: string | null;
  participantMemberIds?: readonly string[];
};

async function createEventImpl(
  supabase: SupabaseClient,
  input: CreateEventInput,
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("family_events")
    .insert({
      household_id: input.householdId,
      title: input.title,
      kind: input.kind ?? "family_time",
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      location: input.location ?? null,
      protected: input.protected ?? false,
      owner_member_id: input.ownerMemberId ?? null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("You cannot add events to this household.");
    if (error.code === "23514") {
      // The one check a caller is likely to hit: protected time must be owned.
      throw ApiError.badRequest("Protected family time needs somebody to own it.");
    }
    throw new Error(`createEvent failed: ${error.code ?? "unknown"}`);
  }

  const id = (data as Row).id as string;

  if (input.participantMemberIds?.length) {
    const { error: participantError } = await supabase.from("event_participants").insert(
      input.participantMemberIds.map((memberId) => ({
        household_id: input.householdId,
        event_id: id,
        member_id: memberId,
      })),
    );
    if (participantError && participantError.code !== "23505") {
      throw new Error(`createEvent failed: ${participantError.code ?? "unknown"}`);
    }
  }

  return { id };
}

/**
 * Records that whatever an event was waiting on — a reply, a gift, some
 * preparation, travel — has been dealt with. The household does the replying
 * or the buying; WonderHome only stops asking.
 */
async function settleEventActionImpl(
  supabase: SupabaseClient,
  input: { householdId: string; eventId: string },
): Promise<void> {
  const { data, error } = await supabase
    .from("family_events")
    .update({ action_state: "ready" })
    .eq("id", input.eventId)
    .eq("household_id", input.householdId)
    .select("id");

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only the event's owner or a household administrator can settle this.");
    throw new Error(`settleEventAction failed: ${error.code ?? "unknown"}`);
  }
  // RLS filters rather than refuses an update it will not allow: no row back
  // means the caller may not change this event, or it is gone.
  if (!data || data.length === 0) throw ApiError.forbidden("Only the event's owner or a household administrator can settle this.");
}

export const GIFT_STEPS = ["chosen", "ordered", "given"] as const;
export type GiftStep = (typeof GIFT_STEPS)[number];

/** Moves a gift along: needed → chosen → ordered → given. Wrapped is skipped on purpose — nobody wants to be asked about wrapping paper. */
async function advanceGiftImpl(
  supabase: SupabaseClient,
  input: { householdId: string; giftId: string; step: GiftStep },
): Promise<void> {
  const { data, error } = await supabase
    .from("gift_plans")
    .update({ status: input.step })
    .eq("id", input.giftId)
    .eq("household_id", input.householdId)
    .select("id");

  if (error) throw new Error(`advanceGift failed: ${error.code ?? "unknown"}`);
  if (!data || data.length === 0) throw ApiError.notFound("That gift is no longer on the list.");
}

/**
 * Closes a schedule conflict. "Resolved" means the household sorted it out
 * (moved something, dropped something); "declined" means they looked and
 * decided it is not a problem. Neither moves a commitment on its own — the
 * proposal was always a suggestion somebody accepts, never an automatic edit.
 */
async function resolveConflictImpl(
  supabase: SupabaseClient,
  input: { householdId: string; conflictId: string; memberId: string; outcome: "resolved" | "declined" },
): Promise<void> {
  const { data, error } = await supabase
    .from("schedule_conflicts")
    .update({ status: input.outcome, resolved_by_member_id: input.memberId, resolved_at: new Date().toISOString() })
    .eq("id", input.conflictId)
    .eq("household_id", input.householdId)
    .eq("status", "open")
    .select("id");

  if (error) throw new Error(`resolveConflict failed: ${error.code ?? "unknown"}`);
  if (!data || data.length === 0) throw ApiError.notFound("That clash has already been dealt with.");
}

export type FamilyAgenda = {
  events: HomeAssessment[];
  gifts: HomeAssessment[];
  conflicts: HomeAssessment[];
  checked: number;
};

export async function familyAgenda(
  supabase: SupabaseClient,
  householdId: string,
  options: { now?: Date } = {},
): Promise<FamilyAgenda> {
  const now = options.now ?? new Date();

  const [events, giftRows, conflictRows] = await Promise.all([
    listEvents(supabase, householdId, { from: now }),
    supabase
      .from("gift_plans")
      .select("id, recipient, needed_by, status, responsible_member_id")
      .eq("household_id", householdId),
    supabase
      .from("schedule_conflicts")
      .select("id, left_label, right_label, overlap_starts_at, proposed_action, proposed_detail")
      .eq("household_id", householdId)
      .eq("status", "open"),
  ]);

  const gifts: GiftPlan[] = ((giftRows.data as Row[] | null) ?? []).map((row) => ({
    id: row.id as string,
    recipient: row.recipient as string,
    neededBy: row.needed_by as string,
    status: row.status as GiftPlan["status"],
    responsibleMemberId: (row.responsible_member_id as string | null) ?? null,
  }));

  const conflicts: HomeAssessment[] = ((conflictRows.data as Row[] | null) ?? []).map((row) => ({
    subjectKey: `conflict.${row.id as string}`,
    // Both sides are named, because a conflict that says only "something
    // clashes" cannot be resolved by anybody.
    title: `${row.left_label as string} clashes with ${row.right_label as string}`,
    status: "blocked" as const,
    riskLevel: "medium" as const,
    notable: true,
    reason: (row.proposed_detail as string | null) ?? "These cannot both happen.",
    action: { action: row.proposed_action as string, target: row.id as string },
    dueOn: (row.overlap_starts_at as string).slice(0, 10),
  }));

  return {
    events: events.map((event) => assessEvent(event, now)).filter((assessment) => assessment.notable),
    gifts: gifts.map((gift) => assessGift(gift, now)).filter((assessment) => assessment.notable),
    conflicts,
    checked: events.length + gifts.length,
  };
}

/**
 * Events this connection has imported before, as reconciliation needs them
 * (17-002). Identity only — the sync decides what to do from the provider's
 * ids and content hashes, never by comparing titles.
 */
export async function listImportedEvents(
  supabase: SupabaseClient,
  integrationId: string,
): Promise<ExistingImport[]> {
  const { data, error } = await supabase
    .from("family_events")
    .select("id, external_id, status")
    .eq("integration_id", integrationId);

  if (error) throw new Error(`listImportedEvents failed: ${error.code ?? "unknown"}`);

  return ((data as Row[] | null) ?? []).map((row) => ({
    id: row.id as string,
    externalId: row.external_id as string,
    status: row.status as ExistingImport["status"],
  }));
}

/**
 * Writes a reconciliation plan (17-002).
 *
 * Inserts and updates carry the provider identity so a retry lands on the same
 * rows; a vanished event is cancelled, never deleted. Participants are added,
 * never removed — an answer somebody already gave is theirs to keep. Nothing
 * here can set `protected`: the column is not written, so it keeps whatever a
 * person set.
 */
async function applyCalendarPlanImpl(
  supabase: SupabaseClient,
  input: { householdId: string; integrationId: string; plan: ReconciliationPlan },
): Promise<void> {
  const { householdId, integrationId, plan } = input;
  const fail = (step: string, error: { code?: string }) => {
    if (error.code === "42501") return ApiError.forbidden("You cannot change this household's calendar.");
    return new Error(`applyCalendarPlan ${step} failed: ${error.code ?? "unknown"}`);
  };
  const participants: { household_id: string; event_id: string; member_id: string }[] = [];

  if (plan.insert.length > 0) {
    const { data, error } = await supabase
      .from("family_events")
      .insert(plan.insert.map((event) => ({ household_id: householdId, integration_id: integrationId, ...eventColumns(event) })))
      .select("id, external_id");
    if (error) throw fail("insert", error);

    const idByExternal = new Map(((data as Row[] | null) ?? []).map((row) => [row.external_id as string, row.id as string]));
    for (const event of plan.insert) {
      const id = idByExternal.get(event.externalId);
      if (!id) continue;
      for (const memberId of event.participantMemberIds) {
        participants.push({ household_id: householdId, event_id: id, member_id: memberId });
      }
    }
  }

  for (const { id, event } of plan.update) {
    const { error } = await supabase.from("family_events").update(eventColumns(event)).eq("id", id);
    if (error) throw fail("update", error);
    for (const memberId of event.participantMemberIds) {
      participants.push({ household_id: householdId, event_id: id, member_id: memberId });
    }
  }

  if (plan.cancel.length > 0) {
    const { error } = await supabase.from("family_events").update({ status: "cancelled" }).in("id", plan.cancel);
    if (error) throw fail("cancel", error);
  }

  if (participants.length > 0) {
    const { error } = await supabase
      .from("event_participants")
      .upsert(participants, { onConflict: "event_id,member_id", ignoreDuplicates: true });
    if (error) throw fail("participants", error);
  }
}

function eventColumns(event: ImportedEvent) {
  return {
    external_id: event.externalId,
    title: event.title,
    kind: event.kind,
    starts_at: event.startsAt.toISOString(),
    ends_at: event.endsAt.toISOString(),
    location: event.location,
    status: event.status,
    owner_member_id: event.ownerMemberId,
  };
}

// Every write forgets the household's cached context once it succeeds, so
// the next HomeTalk answer sees the change (Wave 1 §14).
export const createEvent = invalidatesContext(createEventImpl, (_supabase, input) => input.householdId);
export const settleEventAction = invalidatesContext(settleEventActionImpl, (_supabase, input) => input.householdId);
export const applyCalendarPlan = invalidatesContext(applyCalendarPlanImpl, (_supabase, input) => input.householdId);
export const advanceGift = invalidatesContext(advanceGiftImpl, (_supabase, input) => input.householdId);
export const resolveConflict = invalidatesContext(resolveConflictImpl, (_supabase, input) => input.householdId);
