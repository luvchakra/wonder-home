"use server";

import { revalidatePath } from "next/cache";
import { householdInstant } from "@wonderhome/core/school/times";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { may } from "@wonderhome/core/billing/repository";
import { createClient } from "@wonderhome/core/db/server";
import { advanceGift, createEvent, GIFT_STEPS, resolveConflict, settleEventAction as settleEvent } from "@wonderhome/core/family/repository";
import { EVENT_KINDS } from "@wonderhome/core/family/schedule";
import { requireMembership } from "@wonderhome/core/identity/households";
import { log } from "@wonderhome/core/observability/logger";

import type { ActionState } from "./actions";

/**
 * Putting something in the family calendar from the Family screen.
 *
 * The same rules as the API: membership, then entitlement, then the domain
 * service. Protected time is created here and never moved here.
 */
const eventSchema = z.object({
  householdId: z.uuid(),
  title: z.string().trim().min(1, { error: "Give it a name." }).max(200),
  kind: z.enum(EVENT_KINDS).default("family_time"),
  startsAt: z.string().min(1, { error: "Pick a start." }),
  endsAt: z.string().min(1, { error: "Pick an end." }),
  protected: z.enum(["on"]).optional(),
  location: z.string().trim().max(200).optional(),
});

export async function createEventAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = eventSchema.safeParse({
    householdId: formData.get("householdId"),
    title: formData.get("title"),
    kind: formData.get("kind") || undefined,
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt"),
    protected: formData.get("protected") || undefined,
    location: formData.get("location") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details." };

  const supabase = await createClient();
  try {
    const membership = await requireMembership(supabase, parsed.data.householdId);
    // The form's times are the household's wall clock, not the server's.
    const startsAt = householdInstant(parsed.data.startsAt, membership.household.timezone);
    const endsAt = householdInstant(parsed.data.endsAt, membership.household.timezone);
    if (!startsAt || !endsAt) return { error: "Those times did not make sense." };
    if (endsAt <= startsAt) return { error: "An event has to end after it starts." };
    const entitlement = await may(supabase, parsed.data.householdId, "family.events");
    if (!entitlement.allowed) return { error: entitlement.reason };

    await createEvent(supabase, {
      householdId: parsed.data.householdId,
      title: parsed.data.title,
      kind: parsed.data.kind,
      startsAt,
      endsAt,
      location: parsed.data.location ?? null,
      protected: parsed.data.protected === "on",
      ownerMemberId: membership.memberId,
      participantMemberIds: [],
    });
  } catch (error) {
    log.warn("event creation failed", { reason: error instanceof Error ? error.name : "unknown" });
    return { error: "We could not add that to the calendar. Please try again." };
  }

  revalidatePath("/family");
  revalidatePath("/today");
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
