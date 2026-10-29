/**
 * Story 26-022 — syncing a calendar subscription.
 *
 * Fetch the feed safely, parse it defensively, map it to importable events, and
 * reconcile against what is already imported: insert the new, update the
 * changed, delete the dropped. Idempotent — a second run over an unchanged feed
 * writes nothing. A fetch or parse failure keeps whatever was already imported
 * and records a closed reason; it never wipes the calendar. Runs with the
 * service-role client, which bypasses the read-only policy on imported events.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  applySubscriptionImportPlan,
  listSubscriptionEvents,
  type ExistingSubscriptionEvent,
  type SubscriptionEventInput,
  type SubscriptionImportPlan,
} from "../../family/repository";
import { CALENDAR_FEED_FAILURE_COPY, fetchCalendarFeed, type CalendarFeedFetch } from "./fetch";
import { parseIcs } from "./ics";
import { mapFeedToEvents, type ImportableEvent } from "./import";
import { recordSyncResult, claimDueSubscriptions, getSubscriptionById, type CalendarSubscription } from "./repository";

export type FeedFetcher = (url: string) => Promise<CalendarFeedFetch>;

export type SyncOutcome = {
  subscriptionId: string;
  ok: boolean;
  status: CalendarSubscription["status"];
  lastSyncStatus: string;
  inserted: number;
  updated: number;
  deleted: number;
  eventCount: number;
};

/** The comparable signature of an event, so an unchanged occurrence is left alone. */
function signature(event: SubscriptionEventInput | ExistingSubscriptionEvent): string {
  return [event.title, event.startsAt.getTime(), event.endsAt.getTime(), event.allDay ? 1 : 0, event.timeZone ?? "", event.location ?? "", event.notes ?? ""].join("\u0001");
}

/** The insert/update/delete diff between what is imported and what the feed now holds. */
export function planSubscriptionSync(existing: ExistingSubscriptionEvent[], incoming: ImportableEvent[]): SubscriptionImportPlan {
  const existingById = new Map(existing.map((event) => [event.externalId, event]));
  const insert: SubscriptionEventInput[] = [];
  const update: { id: string; event: SubscriptionEventInput }[] = [];
  const seen = new Set<string>();

  for (const event of incoming) {
    seen.add(event.externalId);
    const current = existingById.get(event.externalId);
    if (!current) {
      insert.push(event);
    } else if (signature(current) !== signature(event)) {
      update.push({ id: current.id, event });
    }
  }
  const deleteIds = existing.filter((event) => !seen.has(event.externalId)).map((event) => event.id);
  return { insert, update, deleteIds };
}

/** The household's IANA zone, for reading all-day and floating times onto the right day. */
async function householdTimeZone(admin: SupabaseClient, householdId: string): Promise<string> {
  const { data } = await admin.from("households").select("timezone").eq("id", householdId).maybeSingle();
  return ((data as { timezone?: string } | null)?.timezone ?? "Asia/Kolkata") || "Asia/Kolkata";
}

function nextSyncAt(subscription: CalendarSubscription, now: Date): Date {
  return new Date(now.getTime() + subscription.syncIntervalMinutes * 60_000);
}

/**
 * Syncs one subscription. `fetchFeed` is injected so tests drive every branch
 * with no network. Never throws for a feed problem; a DB failure propagates so
 * the caller can log it and carry on with the next feed.
 */
export async function syncSubscription(
  admin: SupabaseClient,
  subscription: CalendarSubscription,
  options: { fetchFeed?: FeedFetcher; now?: Date } = {},
): Promise<SyncOutcome> {
  const fetchFeed = options.fetchFeed ?? fetchCalendarFeed;
  const now = options.now ?? new Date();

  const fetched = await fetchFeed(subscription.url);
  if (!fetched.ok) {
    await recordSyncResult(admin, subscription.id, {
      status: "error",
      lastSyncStatus: fetched.reason,
      lastError: CALENDAR_FEED_FAILURE_COPY[fetched.reason],
      eventCount: subscription.eventCount,
      nextSyncAt: nextSyncAt(subscription, now),
    });
    return { subscriptionId: subscription.id, ok: false, status: "error", lastSyncStatus: fetched.reason, inserted: 0, updated: 0, deleted: 0, eventCount: subscription.eventCount };
  }

  const tz = await householdTimeZone(admin, subscription.householdId);
  const parsed = parseIcs(fetched.text);
  const { events } = mapFeedToEvents(parsed, { householdTimeZone: tz, now });
  const existing = await listSubscriptionEvents(admin, subscription.id);
  const plan = planSubscriptionSync(existing, events);

  const applied = await applySubscriptionImportPlan(admin, {
    householdId: subscription.householdId,
    subscriptionId: subscription.id,
    visibility: subscription.visibility,
    ownerMemberId: subscription.ownerMemberId,
    plan,
  });

  const eventCount = events.length;
  await recordSyncResult(admin, subscription.id, { status: "active", lastSyncStatus: "ok", lastError: null, eventCount, nextSyncAt: nextSyncAt(subscription, now) });
  return { subscriptionId: subscription.id, ok: true, status: "active", lastSyncStatus: "ok", inserted: applied.inserted, updated: applied.updated, deleted: applied.deleted, eventCount };
}

/** Syncs one subscription by id (an on-demand "Sync now"). */
export async function syncSubscriptionById(admin: SupabaseClient, id: string, options: { fetchFeed?: FeedFetcher; now?: Date } = {}): Promise<SyncOutcome | null> {
  const subscription = await getSubscriptionById(admin, id);
  if (!subscription) return null;
  return syncSubscription(admin, subscription, options);
}

/** The delivery clock: claim the feeds that are due and sync each (service role). */
export async function syncDueSubscriptions(admin: SupabaseClient, options: { fetchFeed?: FeedFetcher; now?: Date; limit?: number; onError?: (id: string, error: unknown) => void } = {}): Promise<{ synced: number; failed: number }> {
  const due = await claimDueSubscriptions(admin, options.limit ?? 25);
  let synced = 0;
  let failed = 0;
  for (const subscription of due) {
    try {
      const outcome = await syncSubscription(admin, subscription, { fetchFeed: options.fetchFeed, now: options.now });
      if (outcome.ok) synced += 1;
      else failed += 1;
    } catch (error) {
      failed += 1;
      options.onError?.(subscription.id, error);
    }
  }
  return { synced, failed };
}
