import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import { invalidateHouseholdContext, invalidatesContext } from "../context/invalidation";
import { generateInvitationToken } from "../identity/invitations";
import type { EventCategory, EventVisibility } from "../calendar/projection";
import { parseRecurrence, type RecurrenceRule } from "../calendar/recurrence";
import { cleanInviteMessage, templateFor, type InviteTemplate } from "./invite-templates";
import type { EventKind, FamilyEvent } from "./schedule";

/**
 * One family event, opened (rule 21: a card opens to its full detail).
 *
 * Everything about it a household can see and change: its details, who in
 * the household is asked, who outside it has replied through the invite
 * link, and what is still missing before it is ready. "What is missing" is
 * read from the event's own fields by rules (`planningGaps`), never guessed
 * by a model, and each gap names the one thing that fills it.
 *
 * Writes go through the member's own session (RLS: any member edits an
 * unowned event or their own; the owner or an Admin otherwise). Replies from
 * people outside the household are written only by the server, after the
 * link's token has matched (`replyThroughLink`, on the admin client).
 */

type Row = Record<string, unknown>;

export type EventGuest = { id: string; name: string; response: "yes" | "no" | "maybe"; partySize: number; note: string | null; repliedAt: Date };

export type EventDetail = FamilyEvent & {
  location: string | null;
  /** Google Maps' id and address for a place picked from the search; null for a typed place. */
  locationPlaceId: string | null;
  locationAddress: string | null;
  notes: string | null;
  guests: EventGuest[];
  /** The live invite link's token, when there is one. */
  inviteToken: string | null;
  allDay: boolean;
  category: EventCategory | null;
  visibility: EventVisibility;
  recurrence: RecurrenceRule | null;
  /** The invitation's design as chosen; null means it follows the event (`templateFor`). */
  inviteTemplate: InviteTemplate | null;
  /** The line guests see on the invitation; notes never are. */
  inviteMessage: string | null;
  /** The calendar subscription this event was imported from (story 26-022); null for an ordinary event. Imported events are read-only. */
  fromSubscription: { id: string; name: string; color: string | null } | null;
};

export async function loadEvent(supabase: SupabaseClient, householdId: string, eventId: string): Promise<EventDetail | null> {
  const [{ data, error }, { data: guests }, { data: links }] = await Promise.all([
    supabase
      .from("family_events")
      .select("id, title, kind, starts_at, ends_at, location, location_place_id, location_address, notes, protected, owner_member_id, status, action_state, action_due_at, all_day, category, visibility, recurrence, invite_template, invite_message, source_subscription_id, event_participants(member_id, response, required)")
      .eq("household_id", householdId)
      .eq("id", eventId)
      .is("soft_deleted_at", null)
      .maybeSingle(),
    supabase.from("event_guests").select("id, name, response, party_size, note, updated_at").eq("household_id", householdId).eq("event_id", eventId).order("updated_at", { ascending: true }),
    supabase.from("event_invite_links").select("token").eq("household_id", householdId).eq("event_id", eventId).is("revoked_at", null).order("created_at", { ascending: false }).limit(1),
  ]);
  if (error) throw new Error(`loadEvent failed: ${error.code ?? "unknown"}`);
  if (!data) return null;
  const row = data as Row;
  // An imported event names its feed, read through the same session (story 26-022).
  let fromSubscription: EventDetail["fromSubscription"] = null;
  const subscriptionId = (row.source_subscription_id as string | null) ?? null;
  if (subscriptionId) {
    const { data: feed } = await supabase.from("calendar_subscriptions").select("id, name, color").eq("id", subscriptionId).maybeSingle();
    if (feed) fromSubscription = { id: feed.id as string, name: feed.name as string, color: (feed.color as string | null) ?? null };
  }
  return {
    id: row.id as string,
    title: row.title as string,
    kind: row.kind as EventKind,
    startsAt: new Date(row.starts_at as string),
    endsAt: new Date(row.ends_at as string),
    location: (row.location as string | null) ?? null,
    locationPlaceId: (row.location_place_id as string | null) ?? null,
    locationAddress: (row.location_address as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
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
    guests: ((guests as Row[] | null) ?? []).map((guest) => ({
      id: guest.id as string,
      name: guest.name as string,
      response: guest.response as EventGuest["response"],
      partySize: Number(guest.party_size ?? 1),
      note: (guest.note as string | null) ?? null,
      repliedAt: new Date(guest.updated_at as string),
    })),
    inviteToken: (((links as Row[] | null) ?? [])[0]?.token as string | undefined) ?? null,
    allDay: row.all_day === true,
    category: (row.category as EventCategory | null) ?? null,
    visibility: ((row.visibility as EventVisibility | null) ?? "household"),
    recurrence: parseRecurrence(row.recurrence),
    inviteTemplate: (row.invite_template as InviteTemplate | null) ?? null,
    inviteMessage: (row.invite_message as string | null) ?? null,
    fromSubscription,
  };
}

/** Something an event still needs before it is ready, and the one thing that fills it. */
export type PlanningGap = "where" | "who" | "notes" | "share" | "replies";

/**
 * What is still missing, read from the event itself. A cancelled or past
 * event needs nothing. An outing or a gathering without a place, nobody
 * asked, nothing written about it; a birthday or gathering no one outside
 * has been asked to; asks with nobody answered yet.
 */
export function planningGaps(event: Pick<EventDetail, "kind" | "status" | "endsAt" | "location" | "notes" | "participants" | "guests" | "inviteToken">, now: Date = new Date()): PlanningGap[] {
  if (event.status === "cancelled" || event.status === "happened" || event.endsAt.getTime() < now.getTime()) return [];
  const gaps: PlanningGap[] = [];
  const goesSomewhere = event.kind !== "appointment" && event.kind !== "school_event";
  if (goesSomewhere && !event.location?.trim()) gaps.push("where");
  if (event.participants.length === 0) gaps.push("who");
  if (!event.notes?.trim()) gaps.push("notes");
  const sociable = event.kind === "birthday" || event.kind === "gathering" || event.kind === "special_occasion" || event.kind === "outing";
  if (sociable && !event.inviteToken && event.guests.length === 0) gaps.push("share");
  const asked = event.participants.length + (event.inviteToken ? 1 : 0);
  if (asked > 0 && event.participants.every((participant) => participant.response === "unknown") && event.guests.length === 0) gaps.push("replies");
  return gaps;
}

export type EventChanges = {
  title: string;
  kind: EventKind;
  startsAt: string;
  endsAt: string;
  location: string | null;
  /** A place picked from Google Maps, re-read on the server (`decideEventPlace`); null or left out for a typed place. */
  locationPlaceId?: string | null;
  locationAddress?: string | null;
  notes: string | null;
  /** Calendar fields (story 12-009); left out, the event keeps what it had. */
  allDay?: boolean;
  category?: EventCategory | null;
  visibility?: EventVisibility;
  recurrence?: RecurrenceRule | null;
};

async function updateEventImpl(supabase: SupabaseClient, input: { householdId: string; eventId: string; changes: EventChanges }): Promise<void> {
  if (new Date(input.changes.endsAt).getTime() <= new Date(input.changes.startsAt).getTime()) throw ApiError.badRequest("An event has to end after it starts.");
  const { data, error } = await supabase
    .from("family_events")
    .update({
      title: input.changes.title.trim().slice(0, 200),
      kind: input.changes.kind,
      starts_at: input.changes.startsAt,
      ends_at: input.changes.endsAt,
      location: input.changes.location?.trim().slice(0, 200) || null,
      // The place's id and address travel with its name: a typed place clears them.
      location_place_id: input.changes.location?.trim() ? (input.changes.locationPlaceId ?? null) : null,
      location_address: input.changes.location?.trim() ? (input.changes.locationAddress?.trim().slice(0, 300) || null) : null,
      notes: input.changes.notes?.trim().slice(0, 1000) || null,
      ...(input.changes.allDay === undefined ? {} : { all_day: input.changes.allDay }),
      ...(input.changes.category === undefined ? {} : { category: input.changes.category }),
      ...(input.changes.visibility === undefined ? {} : { visibility: input.changes.visibility }),
      ...(input.changes.recurrence === undefined ? {} : { recurrence: input.changes.recurrence }),
    })
    .eq("household_id", input.householdId)
    .eq("id", input.eventId)
    .select("id");
  if (error) {
    // RLS refuses (rather than filters) a change that would hide an event in someone else's name.
    if (error.code === "42501") throw ApiError.forbidden("Only the event's owner can make it private or just for the people invited.");
    throw new Error(`updateEvent failed: ${error.code ?? "unknown"}`);
  }
  if (!data || data.length === 0) throw ApiError.forbidden("Only the event's owner or an Admin can change it.");
}

/** Cancel an event, or bring a cancelled one back: kept, never deleted, so its replies stay on record. */
async function setEventCancelledImpl(supabase: SupabaseClient, input: { householdId: string; eventId: string; cancelled: boolean }): Promise<void> {
  const { data, error } = await supabase
    .from("family_events")
    .update({ status: input.cancelled ? "cancelled" : "planned" })
    .eq("household_id", input.householdId)
    .eq("id", input.eventId)
    .select("id");
  if (error) throw new Error(`setEventCancelled failed: ${error.code ?? "unknown"}`);
  if (!data || data.length === 0) throw ApiError.forbidden("Only the event's owner or an Admin can cancel it.");
}

/** Who in the household is asked: adds the newly ticked, removes the unticked, keeps everyone's answers. */
async function setEventInviteesImpl(supabase: SupabaseClient, input: { householdId: string; eventId: string; memberIds: readonly string[] }): Promise<void> {
  const { data: current, error } = await supabase.from("event_participants").select("member_id").eq("household_id", input.householdId).eq("event_id", input.eventId);
  if (error) throw new Error(`setEventInvitees failed: ${error.code ?? "unknown"}`);
  const had = new Set(((current as Row[] | null) ?? []).map((row) => row.member_id as string));
  const wanted = new Set(input.memberIds);
  const add = [...wanted].filter((id) => !had.has(id));
  const remove = [...had].filter((id) => !wanted.has(id));
  if (add.length > 0) {
    const { error: addError } = await supabase.from("event_participants").insert(add.map((memberId) => ({ household_id: input.householdId, event_id: input.eventId, member_id: memberId })));
    if (addError) throw addError.code === "42501" ? ApiError.forbidden("Only the event's owner or an Admin can change who is asked.") : new Error(`setEventInvitees failed: ${addError.code ?? "unknown"}`);
  }
  if (remove.length > 0) {
    const { error: removeError } = await supabase.from("event_participants").delete().eq("household_id", input.householdId).eq("event_id", input.eventId).in("member_id", remove);
    if (removeError) throw new Error(`setEventInvitees failed: ${removeError.code ?? "unknown"}`);
  }
}

/** A member's own answer to an event they are asked to. */
async function answerEventImpl(supabase: SupabaseClient, input: { householdId: string; eventId: string; memberId: string; response: "yes" | "no" | "maybe" }): Promise<void> {
  const { data, error } = await supabase
    .from("event_participants")
    .update({ response: input.response })
    .eq("household_id", input.householdId)
    .eq("event_id", input.eventId)
    .eq("member_id", input.memberId)
    .select("id");
  if (error) throw new Error(`answerEvent failed: ${error.code ?? "unknown"}`);
  if (!data || data.length === 0) throw ApiError.badRequest("You are not on this event's list.");
}

/** A new invite link for the event, replacing any earlier one. Returns its token. */
async function createInviteLinkImpl(supabase: SupabaseClient, input: { householdId: string; eventId: string; memberId: string }): Promise<string> {
  await supabase.from("event_invite_links").update({ revoked_at: new Date().toISOString() }).eq("household_id", input.householdId).eq("event_id", input.eventId).is("revoked_at", null);
  const token = generateInvitationToken();
  const { error } = await supabase.from("event_invite_links").insert({ household_id: input.householdId, event_id: input.eventId, token, created_by_member_id: input.memberId });
  if (error) throw new Error(`createInviteLink failed: ${error.code ?? "unknown"}`);
  return token;
}

/** Turn the link off: it stops working at once, and the replies already given stay. */
async function revokeInviteLinkImpl(supabase: SupabaseClient, input: { householdId: string; eventId: string }): Promise<void> {
  const { error } = await supabase.from("event_invite_links").update({ revoked_at: new Date().toISOString() }).eq("household_id", input.householdId).eq("event_id", input.eventId).is("revoked_at", null);
  if (error) throw new Error(`revokeInviteLink failed: ${error.code ?? "unknown"}`);
}

/**
 * The invitation's design and its line for guests. Null design means "follow
 * the event", so an event renamed from a lunch to a puja changes with it.
 * Same rule as any change to the event: its owner, anyone for an unowned
 * event, or an Admin (RLS decides; nothing changed means refused).
 */
async function setInviteDesignImpl(supabase: SupabaseClient, input: { householdId: string; eventId: string; template: InviteTemplate | null; message: string | null }): Promise<void> {
  const { data, error } = await supabase
    .from("family_events")
    .update({ invite_template: input.template, invite_message: cleanInviteMessage(input.message) })
    .eq("household_id", input.householdId)
    .eq("id", input.eventId)
    .select("id");
  if (error) throw new Error(`setInviteDesign failed: ${error.code ?? "unknown"}`);
  if (!data || data.length === 0) throw ApiError.forbidden("Only the event's owner or an Admin can change its invitation.");
}

/** Remove a guest's reply (a mistake, a duplicate, someone not actually invited). */
async function removeGuestImpl(supabase: SupabaseClient, input: { householdId: string; guestId: string }): Promise<void> {
  const { error } = await supabase.from("event_guests").delete().eq("household_id", input.householdId).eq("id", input.guestId);
  if (error) throw new Error(`removeGuest failed: ${error.code ?? "unknown"}`);
}

export const updateEvent = invalidatesContext(updateEventImpl, (_s, input) => input.householdId);
export const setEventCancelled = invalidatesContext(setEventCancelledImpl, (_s, input) => input.householdId);
export const setEventInvitees = invalidatesContext(setEventInviteesImpl, (_s, input) => input.householdId);
export const answerEvent = invalidatesContext(answerEventImpl, (_s, input) => input.householdId);
export const createInviteLink = invalidatesContext(createInviteLinkImpl, (_s, input) => input.householdId);
export const revokeInviteLink = invalidatesContext(revokeInviteLinkImpl, (_s, input) => input.householdId);
export const setInviteDesign = invalidatesContext(setInviteDesignImpl, (_s, input) => input.householdId);
export const removeGuest = invalidatesContext(removeGuestImpl, (_s, input) => input.householdId);

// ---------------------------------------------------------------------------
// The link, from outside the household (admin client, server only)
// ---------------------------------------------------------------------------

/** What someone holding the link may see: the event's own facts and the household's name, nothing else. */
export type InvitedEvent = {
  linkId: string;
  householdId: string;
  eventId: string;
  householdName: string;
  timezone: string;
  /** The household's own language, which the invite page speaks; English when unset. */
  language: string;
  /** The household's region (ISO country), for how its dates are written; null when unset. */
  region: string | null;
  title: string;
  kind: EventKind;
  startsAt: Date;
  endsAt: Date;
  location: string | null;
  /** The picked place's address and Google Maps id, so a guest can find it; null for a typed place. */
  locationAddress: string | null;
  locationPlaceId: string | null;
  allDay: boolean;
  /** The invitation's design in force (the household's pick, else the event's own). */
  template: InviteTemplate;
  /** The household's line for guests, if they wrote one. */
  message: string | null;
  cancelled: boolean;
  over: boolean;
};

const TOKEN = /^[A-Za-z0-9_-]{40,64}$/;

export async function readInviteLink(admin: SupabaseClient, token: string, now: Date = new Date()): Promise<InvitedEvent | null> {
  if (!TOKEN.test(token)) return null;
  const { data, error } = await admin
    .from("event_invite_links")
    .select("id, household_id, event_id, revoked_at, family_events(title, kind, starts_at, ends_at, location, location_place_id, location_address, status, all_day, invite_template, invite_message), households(name, timezone, default_language, region)")
    .eq("token", token)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Row;
  if (row.revoked_at) return null;
  const event = row.family_events as Row | null;
  const household = row.households as Row | null;
  if (!event || !household) return null;
  const endsAt = new Date(event.ends_at as string);
  return {
    linkId: row.id as string,
    householdId: row.household_id as string,
    eventId: row.event_id as string,
    householdName: household.name as string,
    timezone: (household.timezone as string) || "UTC",
    language: (household.default_language as string | null) || "en",
    region: (household.region as string | null) || null,
    title: event.title as string,
    kind: event.kind as EventKind,
    startsAt: new Date(event.starts_at as string),
    endsAt,
    location: (event.location as string | null) ?? null,
    locationAddress: (event.location_address as string | null) ?? null,
    locationPlaceId: (event.location_place_id as string | null) ?? null,
    allDay: event.all_day === true,
    template: templateFor({ inviteTemplate: (event.invite_template as string | null) ?? null, kind: event.kind as EventKind, title: event.title as string }),
    message: (event.invite_message as string | null) ?? null,
    cancelled: event.status === "cancelled",
    over: endsAt.getTime() < now.getTime(),
  };
}

/**
 * A reply through the link: the same name on the same event changes its
 * answer rather than counting twice. Refused once the link is off, the
 * event is cancelled or it is over.
 */
export async function replyThroughLink(
  admin: SupabaseClient,
  input: { token: string; name: string; response: "yes" | "no" | "maybe"; partySize: number; note: string | null },
): Promise<{ ok: true; invited: InvitedEvent } | { ok: false; reason: "not_found" | "closed" }> {
  const invited = await readInviteLink(admin, input.token);
  if (!invited) return { ok: false, reason: "not_found" };
  if (invited.cancelled || invited.over) return { ok: false, reason: "closed" };
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 80);
  const reply = {
    response: input.response,
    party_size: Math.min(Math.max(Math.round(input.partySize), 1), 20),
    note: input.note?.trim().slice(0, 300) || null,
    link_id: invited.linkId,
  };
  const { data: existing } = await admin.from("event_guests").select("id").eq("event_id", invited.eventId).ilike("name", name.replace(/[%_\\]/g, (c) => `\\${c}`)).limit(1);
  const id = ((existing as Row[] | null) ?? [])[0]?.id as string | undefined;
  const { error } = id
    ? await admin.from("event_guests").update(reply).eq("id", id)
    : await admin.from("event_guests").insert({ household_id: invited.householdId, event_id: invited.eventId, name, ...reply });
  if (error) throw new Error(`replyThroughLink failed: ${error.code ?? "unknown"}`);
  // A guest's reply comes in without a member's session, so it is not one of
  // the wrapped repository writes: the household (from the link, never the
  // caller) is told here, so HomeTalk's stored context hears who is coming.
  invalidateHouseholdContext(invited.householdId);
  return { ok: true, invited };
}
