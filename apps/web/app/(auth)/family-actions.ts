"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { may } from "@wonderhome/core/billing/repository";
import { createClient } from "@wonderhome/core/db/server";
import { createEvent } from "@wonderhome/core/family/repository";
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

  const startsAt = new Date(parsed.data.startsAt);
  const endsAt = new Date(parsed.data.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return { error: "Those times did not make sense." };
  if (endsAt <= startsAt) return { error: "An event has to end after it starts." };

  const supabase = await createClient();
  try {
    const membership = await requireMembership(supabase, parsed.data.householdId);
    const entitlement = await may(supabase, parsed.data.householdId, "family.events");
    if (!entitlement.allowed) return { error: entitlement.reason };

    await createEvent(supabase, {
      householdId: parsed.data.householdId,
      title: parsed.data.title,
      kind: parsed.data.kind,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
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
