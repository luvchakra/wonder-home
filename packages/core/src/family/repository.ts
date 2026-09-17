import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import type { HomeAssessment } from "../home/assessment";
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

export async function createEvent(
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
