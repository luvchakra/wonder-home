"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { createClient } from "@wonderhome/core/db/server";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { requireMembership } from "@wonderhome/core/identity/households";
import { setSubscriptionEventsVisibility } from "@wonderhome/core/family/repository";
import { createSubscription, deleteSubscription, getSubscription, updateSubscription } from "@wonderhome/core/calendar/subscriptions/repository";
import { syncSubscriptionById } from "@wonderhome/core/calendar/subscriptions/sync";
import { normaliseFeedUrl } from "@wonderhome/core/calendar/subscriptions/url";

import type { ActionState } from "./actions";

/**
 * Subscribe to a calendar by its share link, and manage the subscription
 * (story 26-022). Only an adult may; the RLS enforces it, and we check the
 * member type too so the message is clear and so the admin-client steps
 * (initial sync, re-scoping imported events) never run for a child. The first
 * sync and a "sync now" run after the response, off the request path.
 */

const field = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
};

const COLOR = /^[a-z][a-z0-9-]{0,39}$/;

function revalidate() {
  revalidatePath("/settings/connections");
  revalidatePath("/calendar");
}

/** Kick off a sync for one feed after the response, with the service-role client. */
function syncAfterResponse(id: string) {
  after(async () => {
    try {
      await syncSubscriptionById(createAdminClient(), id);
    } catch {
      // The delivery clock will try again; a failed first sync records its reason on the feed.
    }
  });
}

const addSchema = z.object({
  householdId: z.uuid(),
  name: z.string().trim().min(1, { error: "Give the calendar a name." }).max(80),
  url: z.string().trim().min(1, { error: "Paste the calendar's share link." }),
  color: z.string().trim().max(40).optional(),
  visibility: z.enum(["household", "private"]),
});

export async function addCalendarSubscriptionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = addSchema.safeParse({
    householdId: field(formData, "householdId"),
    name: field(formData, "name"),
    url: field(formData, "url"),
    color: field(formData, "color"),
    visibility: field(formData, "visibility") ?? "household",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };

  const normalised = normaliseFeedUrl(parsed.data.url);
  if (!normalised.ok) return { error: "That doesn't look like a calendar link. Use an https or webcal address ending in .ics." };
  const color = parsed.data.color && COLOR.test(parsed.data.color) ? parsed.data.color : null;

  try {
    const supabase = await createClient();
    const actor = await requireMembership(supabase, parsed.data.householdId);
    if (actor.memberType !== "adult") return { error: "Only an adult can add a calendar subscription." };
    const { id } = await createSubscription(supabase, {
      householdId: parsed.data.householdId,
      name: parsed.data.name,
      url: normalised.url,
      color,
      visibility: parsed.data.visibility,
      actorMemberId: actor.memberId,
    });
    syncAfterResponse(id);
    revalidate();
    return { notice: "Calendar added — its events will appear here in a moment." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "generic").body.error.message };
  }
}

const updateSchema = z.object({
  householdId: z.uuid(),
  id: z.uuid(),
  name: z.string().trim().min(1, { error: "Give the calendar a name." }).max(80),
  color: z.string().trim().max(40).optional(),
  visibility: z.enum(["household", "private"]),
});

export async function updateCalendarSubscriptionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = updateSchema.safeParse({
    householdId: field(formData, "householdId"),
    id: field(formData, "id"),
    name: field(formData, "name"),
    color: field(formData, "color"),
    visibility: field(formData, "visibility") ?? "household",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  const color = parsed.data.color && COLOR.test(parsed.data.color) ? parsed.data.color : null;

  try {
    const supabase = await createClient();
    const actor = await requireMembership(supabase, parsed.data.householdId);
    if (actor.memberType !== "adult") return { error: "Only an adult can change a calendar subscription." };
    const before = await getSubscription(supabase, parsed.data.householdId, parsed.data.id);
    if (!before) return { error: "That calendar subscription is no longer here." };
    await updateSubscription(supabase, parsed.data.householdId, parsed.data.id, {
      name: parsed.data.name,
      color,
      visibility: parsed.data.visibility,
      actorMemberId: actor.memberId,
    });
    // A visibility change re-scopes the feed's already-imported events, which
    // are read-only to members, so the admin client does it.
    if (before.visibility !== parsed.data.visibility) {
      await setSubscriptionEventsVisibility(createAdminClient(), parsed.data.id, parsed.data.visibility, parsed.data.visibility === "private" ? actor.memberId : null);
    }
    revalidate();
    return { notice: "Calendar updated." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "generic").body.error.message };
  }
}

const idSchema = z.object({ householdId: z.uuid(), id: z.uuid() });

export async function removeCalendarSubscriptionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = idSchema.safeParse({ householdId: field(formData, "householdId"), id: field(formData, "id") });
  if (!parsed.success) return { error: "Please try again." };
  try {
    const supabase = await createClient();
    const actor = await requireMembership(supabase, parsed.data.householdId);
    if (actor.memberType !== "adult") return { error: "Only an adult can remove a calendar subscription." };
    await deleteSubscription(supabase, parsed.data.householdId, parsed.data.id);
    revalidate();
    return { notice: "Calendar removed, along with its imported events." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "generic").body.error.message };
  }
}

export async function syncCalendarSubscriptionNowAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = idSchema.safeParse({ householdId: field(formData, "householdId"), id: field(formData, "id") });
  if (!parsed.success) return { error: "Please try again." };
  try {
    const supabase = await createClient();
    const actor = await requireMembership(supabase, parsed.data.householdId);
    if (actor.memberType !== "adult") return { error: "Only an adult can refresh a calendar subscription." };
    // Confirm the caller may see this feed before the admin client syncs it.
    const feed = await getSubscription(supabase, parsed.data.householdId, parsed.data.id);
    if (!feed) return { error: "That calendar subscription is no longer here." };
    syncAfterResponse(parsed.data.id);
    revalidate();
    return { notice: "Refreshing this calendar…" };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "generic").body.error.message };
  }
}
