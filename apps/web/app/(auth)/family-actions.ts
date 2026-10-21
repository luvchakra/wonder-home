"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { may } from "@wonderhome/core/billing/repository";
import { createClient } from "@wonderhome/core/db/server";
import { advanceGift, createEvent, GIFT_STEPS, resolveConflict, settleEventAction as settleEvent } from "@wonderhome/core/family/repository";
import { EVENT_KINDS } from "@wonderhome/core/family/schedule";
import { localMoment } from "@wonderhome/core/calendar/dates";
import { EVENT_CATEGORIES, EVENT_VISIBILITIES } from "@wonderhome/core/calendar/projection";
import { parseRecurrence, RECURRENCE_FREQUENCIES } from "@wonderhome/core/calendar/recurrence";
import { requireMembership } from "@wonderhome/core/identity/households";
import { log } from "@wonderhome/core/observability/logger";

import { clashesFor, duplicateFor, eventWindow } from "../_lib/event-window";
import { eventPlaceFromForm } from "../_lib/places";
import type { ActionState } from "./actions";

/**
 * Putting something in the family calendar, from Family, Today, Home or the
 * Calendar (story 12-009) — one form, one action.
 *
 * The same rules as the API: membership, then entitlement, then the domain
 * service. Protected time is created here and never moved here. Before a
 * timed event is written, clashes with what this person can see — and, for
 * the people going, "busy" from free/busy, which never says why — are said in
 * words; the form then offers "Add anyway".
 */
export type EventActionState = ActionState & { clashes?: string[]; duplicate?: string | null };

const eventSchema = z.object({
  householdId: z.uuid(),
  title: z.string().trim().min(1, { error: "Give it a name." }).max(200),
  kind: z.enum(EVENT_KINDS).default("family_time"),
  allDay: z.enum(["on"]).optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  startDate: z.iso.date().optional(),
  endDate: z.iso.date().optional(),
  protected: z.enum(["on"]).optional(),
  location: z.string().trim().max(200).optional(),
  memberIds: z.array(z.uuid()).max(30).default([]),
  category: z.enum(EVENT_CATEGORIES).optional(),
  visibility: z.enum(EVENT_VISIBILITIES).default("household"),
  repeat: z.enum(["none", ...RECURRENCE_FREQUENCIES]).default("none"),
  repeatUntil: z.iso.date().optional(),
  notes: z.string().trim().max(1000).optional(),
  confirmClash: z.enum(["on"]).optional(),
});

const optional = (value: FormDataEntryValue | null) => (value === null || value === "" ? undefined : value);

export async function createEventAction(_previous: EventActionState, formData: FormData): Promise<EventActionState> {
  const parsed = eventSchema.safeParse({
    householdId: formData.get("householdId"),
    title: formData.get("title"),
    kind: optional(formData.get("kind")),
    allDay: optional(formData.get("allDay")),
    startsAt: optional(formData.get("startsAt")),
    endsAt: optional(formData.get("endsAt")),
    startDate: optional(formData.get("startDate")),
    endDate: optional(formData.get("endDate")),
    protected: optional(formData.get("protected")),
    location: optional(formData.get("location")),
    memberIds: formData.getAll("memberIds"),
    category: optional(formData.get("category")),
    visibility: optional(formData.get("visibility")),
    repeat: optional(formData.get("repeat")),
    repeatUntil: optional(formData.get("repeatUntil")),
    notes: optional(formData.get("notes")),
    confirmClash: optional(formData.get("confirmClash")),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details." };
  const input = parsed.data;

  const supabase = await createClient();
  try {
    const membership = await requireMembership(supabase, input.householdId);
    const timezone = membership.household.timezone;
    // The form's times are the household's wall clock, not the server's.
    const when = eventWindow(input, timezone);
    if ("error" in when) return { error: when.error };
    const entitlement = await may(supabase, input.householdId, "family.events");
    if (!entitlement.allowed) return { error: entitlement.reason };

    const rule = input.repeat === "none" ? null : parseRecurrence({ freq: input.repeat, ...(input.repeatUntil ? { until: input.repeatUntil } : {}) });
    if (input.repeat !== "none" && !rule) return { error: "That repeat could not be read." };
    if (rule?.until && rule.until < localMoment(new Date(when.startsAt), timezone).dateKey) return { error: "A repeat has to end after it starts." };

    // One question before anything is written: what this clashes with, and
    // whether it is already on the calendar under this or another name.
    if (!input.confirmClash) {
      const [clashes, duplicate] = await Promise.all([
        input.allDay ? Promise.resolve([] as string[]) : clashesFor(supabase, membership, { start: new Date(when.startsAt), end: new Date(when.endsAt), memberIds: input.memberIds }),
        duplicateFor(supabase, membership, { title: input.title, start: new Date(when.startsAt) }),
      ]);
      if (clashes.length > 0 || duplicate) return { clashes, duplicate };
    }

    const place = await eventPlaceFromForm(membership, formData);

    await createEvent(supabase, {
      householdId: input.householdId,
      title: input.title,
      kind: input.kind,
      startsAt: when.startsAt,
      endsAt: when.endsAt,
      location: place.location,
      locationPlaceId: place.locationPlaceId,
      locationAddress: place.locationAddress,
      protected: input.protected === "on",
      ownerMemberId: membership.memberId,
      participantMemberIds: input.memberIds,
      allDay: input.allDay === "on",
      category: input.category ?? null,
      visibility: input.visibility,
      recurrence: rule,
      notes: input.notes ?? null,
    });
  } catch (error) {
    log.warn("event creation failed", { reason: error instanceof Error ? error.name : "unknown" });
    return { error: "We could not add that to the calendar. Please try again." };
  }

  revalidatePath("/family");
  revalidatePath("/today");
  revalidatePath("/calendar");
  revalidatePath("/");
  return {};
}

/**
 * The "Reply", "Gift", "Prepare", "Plan" pills, made real. None of these do
 * the replying or the buying — the household does that. They record that it
 * has been done, so the row stops asking.
 */
const settleSchema = z.object({ householdId: z.uuid(), eventId: z.uuid() });

export async function settleEventAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = settleSchema.safeParse({ householdId: formData.get("householdId"), eventId: formData.get("eventId") });
  if (!parsed.success) return { error: "That event could not be read. Please try again." };

  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);
    await settleEvent(supabase, parsed.data);
  } catch (thrown) {
    return { error: toErrorBody(thrown, "family").body.error.message };
  }

  revalidatePath("/family");
  revalidatePath("/today");
  revalidatePath("/");
  return { notice: "Noted — nothing more to do on this one." };
}

const giftSchema = z.object({ householdId: z.uuid(), giftId: z.uuid(), step: z.enum(GIFT_STEPS) });

export async function advanceGiftAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = giftSchema.safeParse({ householdId: formData.get("householdId"), giftId: formData.get("giftId"), step: formData.get("step") });
  if (!parsed.success) return { error: "That gift could not be read. Please try again." };

  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);
    await advanceGift(supabase, parsed.data);
  } catch (thrown) {
    return { error: toErrorBody(thrown, "family").body.error.message };
  }

  revalidatePath("/family");
  revalidatePath("/");
  return { notice: parsed.data.step === "given" ? "Given. Off the list." : `Marked ${parsed.data.step}.` };
}

const conflictSchema = z.object({ householdId: z.uuid(), conflictId: z.uuid(), outcome: z.enum(["resolved", "declined"]) });

export async function resolveConflictAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = conflictSchema.safeParse({ householdId: formData.get("householdId"), conflictId: formData.get("conflictId"), outcome: formData.get("outcome") });
  if (!parsed.success) return { error: "That clash could not be read. Please try again." };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);
    await resolveConflict(supabase, { ...parsed.data, memberId: membership.memberId });
  } catch (thrown) {
    return { error: toErrorBody(thrown, "family").body.error.message };
  }

  revalidatePath("/family");
  revalidatePath("/today");
  revalidatePath("/");
  return { notice: parsed.data.outcome === "resolved" ? "Sorted." : "Left as it is." };
}
