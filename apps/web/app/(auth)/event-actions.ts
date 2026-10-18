"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { createClient } from "@wonderhome/core/db/server";
import { answerEvent, createInviteLink, removeGuest, replyThroughLink, revokeInviteLink, setEventCancelled, setEventInvitees, setInviteDesign, updateEvent } from "@wonderhome/core/family/event-detail";
import { INVITE_TEMPLATES } from "@wonderhome/core/family/invite-templates";
import { EVENT_KINDS } from "@wonderhome/core/family/schedule";
import { hashClientIp } from "@wonderhome/core/homesend/rate-limit";
import { requireMembership } from "@wonderhome/core/identity/households";
import { hitRateLimit, rateLimitMessage } from "@wonderhome/core/security/rate-limit";

import { localMoment } from "@wonderhome/core/calendar/dates";
import { EVENT_CATEGORIES, EVENT_VISIBILITIES } from "@wonderhome/core/calendar/projection";
import { parseRecurrence, RECURRENCE_FREQUENCIES } from "@wonderhome/core/calendar/recurrence";

import { clashesFor, eventWindow } from "../_lib/event-window";
import type { ActionState } from "./actions";
import type { EventActionState } from "./family-actions";

/**
 * One event, opened: change it, cancel it, ask people to it, share a link,
 * and — from outside the household — reply through that link. Every write
 * goes through the event's domain service; the link's replies are the only
 * writes made on the server's own client, after the token has matched.
 */

const ids = z.object({ householdId: z.uuid(), eventId: z.uuid() });

function refresh(eventId: string) {
  revalidatePath(`/family/events/${eventId}`);
  revalidatePath("/family");
  revalidatePath("/today");
  revalidatePath("/calendar");
  revalidatePath("/");
}

const detailsSchema = ids.extend({
  title: z.string().trim().min(1, { error: "Give it a name." }).max(200),
  kind: z.enum(EVENT_KINDS),
  allDay: z.enum(["on"]).optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  startDate: z.iso.date().optional(),
  endDate: z.iso.date().optional(),
  location: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(1000).optional(),
  category: z.enum(EVENT_CATEGORIES).optional(),
  // Sent only to the event's owner; absent, the event keeps who can see it.
  visibility: z.enum(EVENT_VISIBILITIES).optional(),
  repeat: z.enum(["none", ...RECURRENCE_FREQUENCIES]).default("none"),
  repeatUntil: z.iso.date().optional(),
  confirmClash: z.enum(["on"]).optional(),
});

/** Changing an event, from its own page: the same fields and the same clash check as adding one. */
export async function updateEventAction(_previous: EventActionState, formData: FormData): Promise<EventActionState> {
  const raw = Object.fromEntries([...formData.entries()].filter(([, value]) => value !== ""));
  const parsed = detailsSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details." };
  const input = parsed.data;
  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, input.householdId);
    const timezone = membership.household.timezone;
    const when = eventWindow(input, timezone);
    if ("error" in when) return { error: when.error };
    const rule = input.repeat === "none" ? null : parseRecurrence({ freq: input.repeat, ...(input.repeatUntil ? { until: input.repeatUntil } : {}) });
    if (input.repeat !== "none" && !rule) return { error: "That repeat could not be read." };
    if (rule?.until && rule.until < localMoment(new Date(when.startsAt), timezone).dateKey) return { error: "A repeat has to end after it starts." };

    if (!input.confirmClash && !input.allDay) {
      const { data: invited } = await supabase.from("event_participants").select("member_id").eq("household_id", input.householdId).eq("event_id", input.eventId);
      const memberIds = ((invited as { member_id: string }[] | null) ?? []).map((row) => row.member_id);
      const clashes = await clashesFor(supabase, membership, { start: new Date(when.startsAt), end: new Date(when.endsAt), memberIds, ignoreEventId: input.eventId });
      if (clashes.length > 0) return { clashes };
    }

    await updateEvent(supabase, {
      householdId: input.householdId,
      eventId: input.eventId,
      changes: {
        title: input.title,
        kind: input.kind,
        startsAt: when.startsAt,
        endsAt: when.endsAt,
        location: input.location ?? null,
        notes: input.notes ?? null,
        allDay: input.allDay === "on",
        category: input.category ?? null,
        recurrence: rule,
        ...(input.visibility ? { visibility: input.visibility } : {}),
      },
    });
  } catch (thrown) {
    return { error: toErrorBody(thrown, "family").body.error.message };
  }
  refresh(input.eventId);
  return { notice: "Saved." };
}

export async function setEventCancelledAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = ids.extend({ cancelled: z.enum(["true", "false"]) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Please try again." };
  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);
    await setEventCancelled(supabase, { householdId: parsed.data.householdId, eventId: parsed.data.eventId, cancelled: parsed.data.cancelled === "true" });
  } catch (thrown) {
    return { error: toErrorBody(thrown, "family").body.error.message };
  }
  refresh(parsed.data.eventId);
  return {};
}

export async function setEventInviteesAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = ids.safeParse({ householdId: formData.get("householdId"), eventId: formData.get("eventId") });
  if (!parsed.success) return { error: "Please try again." };
  const memberIds = formData.getAll("memberIds").filter((value): value is string => typeof value === "string" && z.uuid().safeParse(value).success);
  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);
    await setEventInvitees(supabase, { householdId: parsed.data.householdId, eventId: parsed.data.eventId, memberIds });
  } catch (thrown) {
    return { error: toErrorBody(thrown, "family").body.error.message };
  }
  refresh(parsed.data.eventId);
  return { notice: "Saved." };
}

export async function answerEventAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = ids.extend({ response: z.enum(["yes", "no", "maybe"]) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Please try again." };
  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);
    await answerEvent(supabase, { householdId: parsed.data.householdId, eventId: parsed.data.eventId, memberId: membership.memberId, response: parsed.data.response });
  } catch (thrown) {
    return { error: toErrorBody(thrown, "family").body.error.message };
  }
  refresh(parsed.data.eventId);
  return {};
}

export async function createInviteLinkAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = ids.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Please try again." };
  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);
    await createInviteLink(supabase, { householdId: parsed.data.householdId, eventId: parsed.data.eventId, memberId: membership.memberId });
  } catch (thrown) {
    return { error: toErrorBody(thrown, "family").body.error.message };
  }
  refresh(parsed.data.eventId);
  return {};
}

/** The invitation's design ("auto" follows the event) and its line for guests. */
export async function setInviteDesignAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = ids
    .extend({ template: z.enum(["auto", ...INVITE_TEMPLATES]), message: z.string().max(600).optional() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Please try again." };
  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);
    await setInviteDesign(supabase, {
      householdId: parsed.data.householdId,
      eventId: parsed.data.eventId,
      template: parsed.data.template === "auto" ? null : parsed.data.template,
      message: parsed.data.message ?? null,
    });
  } catch (thrown) {
    return { error: toErrorBody(thrown, "family").body.error.message };
  }
  refresh(parsed.data.eventId);
  return { notice: "saved" };
}

export async function revokeInviteLinkAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = ids.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Please try again." };
  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);
    await revokeInviteLink(supabase, { householdId: parsed.data.householdId, eventId: parsed.data.eventId });
  } catch (thrown) {
    return { error: toErrorBody(thrown, "family").body.error.message };
  }
  refresh(parsed.data.eventId);
  return {};
}

export async function removeGuestAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = ids.extend({ guestId: z.uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Please try again." };
  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);
    await removeGuest(supabase, { householdId: parsed.data.householdId, guestId: parsed.data.guestId });
  } catch (thrown) {
    return { error: toErrorBody(thrown, "family").body.error.message };
  }
  refresh(parsed.data.eventId);
  return {};
}

/**
 * A reply through an event's invite link, from someone who may have no
 * account at all. Rate limited by the hashed client address (never the
 * address itself); an unidentifiable caller is let through, as everywhere
 * else this throttle runs, because it limits abuse and authorizes nothing.
 */
const replySchema = z.object({
  token: z.string().min(40).max(64),
  name: z.string().trim().min(1, { error: "Add your name, so they know who is coming." }).max(80),
  response: z.enum(["yes", "no", "maybe"]),
  partySize: z.coerce.number().int().min(1).max(20).default(1),
  note: z.string().trim().max(300).optional(),
});

export type ReplyState = { error?: string; replied?: "yes" | "no" | "maybe"; name?: string };

export async function replyToEventAction(_previous: ReplyState, formData: FormData): Promise<ReplyState> {
  const parsed = replySchema.safeParse({
    token: formData.get("token"),
    name: formData.get("name"),
    response: formData.get("response"),
    partySize: formData.get("partySize") || undefined,
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check your reply." };

  const admin = createAdminClient();
  const forwarded = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded && !(await hitRateLimit(admin, "event.reply", hashClientIp(forwarded)))) return { error: rateLimitMessage("event.reply") };

  try {
    const result = await replyThroughLink(admin, { token: parsed.data.token, name: parsed.data.name, response: parsed.data.response, partySize: parsed.data.partySize, note: parsed.data.note ?? null });
    if (!result.ok) return { error: result.reason === "closed" ? "This event is no longer taking replies." : "This invite link is no longer working. Ask whoever sent it for a new one." };
    revalidatePath(`/family/events/${result.invited.eventId}`);
  } catch {
    return { error: "Your reply did not go through. Please try again in a moment." };
  }
  return { replied: parsed.data.response, name: parsed.data.name };
}
