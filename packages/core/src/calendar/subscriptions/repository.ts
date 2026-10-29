/**
 * Story 26-022 — the calendar_subscriptions table.
 *
 * Member-facing reads/writes go through the caller's own client so RLS decides
 * what they may see and change (a household feed is every member's, a personal
 * feed only its owner's; only adults add). The sync's claim and sync-state
 * writes go through the service-role client, which the cron endpoint holds.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../../api/errors";

export type SubscriptionVisibility = "household" | "private";
export type SubscriptionStatus = "active" | "error" | "paused";

export type CalendarSubscription = {
  id: string;
  householdId: string;
  createdByMemberId: string;
  name: string;
  url: string;
  color: string | null;
  visibility: SubscriptionVisibility;
  ownerMemberId: string | null;
  status: SubscriptionStatus;
  lastSyncAt: Date | null;
  lastSyncStatus: string | null;
  lastError: string | null;
  eventCount: number;
  nextSyncAt: Date;
  syncIntervalMinutes: number;
  createdAt: Date;
  updatedAt: Date;
};

type Row = Record<string, unknown>;

const SELECT =
  "id, household_id, created_by_member_id, name, url, color, visibility, owner_member_id, status, last_sync_at, last_sync_status, last_error, event_count, next_sync_at, sync_interval_minutes, created_at, updated_at";

function fromRow(row: Row): CalendarSubscription {
  return {
    id: row.id as string,
    householdId: row.household_id as string,
    createdByMemberId: row.created_by_member_id as string,
    name: row.name as string,
    url: row.url as string,
    color: (row.color as string | null) ?? null,
    visibility: (row.visibility as SubscriptionVisibility) ?? "household",
    ownerMemberId: (row.owner_member_id as string | null) ?? null,
    status: (row.status as SubscriptionStatus) ?? "active",
    lastSyncAt: row.last_sync_at ? new Date(row.last_sync_at as string) : null,
    lastSyncStatus: (row.last_sync_status as string | null) ?? null,
    lastError: (row.last_error as string | null) ?? null,
    eventCount: Number(row.event_count ?? 0),
    nextSyncAt: new Date(row.next_sync_at as string),
    syncIntervalMinutes: Number(row.sync_interval_minutes ?? 360),
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

/** The household's subscriptions the caller may see (household feeds, plus their own personal ones). */
export async function listSubscriptions(supabase: SupabaseClient, householdId: string): Promise<CalendarSubscription[]> {
  const { data, error } = await supabase
    .from("calendar_subscriptions")
    .select(SELECT)
    .eq("household_id", householdId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listSubscriptions failed: ${error.code ?? "unknown"}`);
  return ((data as Row[] | null) ?? []).map(fromRow);
}

export async function getSubscription(supabase: SupabaseClient, householdId: string, id: string): Promise<CalendarSubscription | null> {
  const { data, error } = await supabase.from("calendar_subscriptions").select(SELECT).eq("household_id", householdId).eq("id", id).maybeSingle();
  if (error) throw new Error(`getSubscription failed: ${error.code ?? "unknown"}`);
  return data ? fromRow(data as Row) : null;
}

export type CreateSubscriptionInput = {
  householdId: string;
  name: string;
  url: string;
  color?: string | null;
  visibility: SubscriptionVisibility;
  actorMemberId: string;
};

export async function createSubscription(supabase: SupabaseClient, input: CreateSubscriptionInput): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("calendar_subscriptions")
    .insert({
      household_id: input.householdId,
      created_by_member_id: input.actorMemberId,
      name: input.name,
      url: input.url,
      color: input.color ?? null,
      visibility: input.visibility,
      owner_member_id: input.visibility === "private" ? input.actorMemberId : null,
      // Due immediately: the initial sync runs after the response.
      next_sync_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only an adult can add a calendar subscription.");
    throw new Error(`createSubscription failed: ${error.code ?? "unknown"}`);
  }
  return { id: (data as Row).id as string };
}

export type UpdateSubscriptionInput = {
  name?: string;
  color?: string | null;
  visibility?: SubscriptionVisibility;
  actorMemberId: string;
};

/**
 * Renames/recolours/re-scopes a feed. A visibility change also re-scopes its
 * imported events (the caller does that with the admin client, since imported
 * events are read-only to members).
 */
export async function updateSubscription(supabase: SupabaseClient, householdId: string, id: string, input: UpdateSubscriptionInput): Promise<void> {
  const patch: Row = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.color !== undefined) patch.color = input.color;
  if (input.visibility !== undefined) {
    patch.visibility = input.visibility;
    patch.owner_member_id = input.visibility === "private" ? input.actorMemberId : null;
  }
  if (Object.keys(patch).length === 0) return;
  const { data, error } = await supabase.from("calendar_subscriptions").update(patch).eq("household_id", householdId).eq("id", id).select("id");
  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("You cannot change this calendar subscription.");
    throw new Error(`updateSubscription failed: ${error.code ?? "unknown"}`);
  }
  if (!data || data.length === 0) throw ApiError.notFound("That calendar subscription is no longer here.");
}

/** Removes a feed; its imported events go with it through the FK cascade. */
export async function deleteSubscription(supabase: SupabaseClient, householdId: string, id: string): Promise<void> {
  const { error } = await supabase.from("calendar_subscriptions").delete().eq("household_id", householdId).eq("id", id);
  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("You cannot remove this calendar subscription.");
    throw new Error(`deleteSubscription failed: ${error.code ?? "unknown"}`);
  }
}

// --- service-role (sync) ---------------------------------------------------

/** Claims a bounded batch of due feeds, pushing their next_sync_at forward (service role). */
export async function claimDueSubscriptions(admin: SupabaseClient, limit: number): Promise<CalendarSubscription[]> {
  const { data, error } = await admin.rpc("claim_due_calendar_subscriptions", { p_limit: limit });
  if (error) throw new Error(`claimDueSubscriptions failed: ${error.code ?? "unknown"}`);
  return ((data as Row[] | null) ?? []).map(fromRow);
}

/** Reads one feed by id for an on-demand sync (service role). */
export async function getSubscriptionById(admin: SupabaseClient, id: string): Promise<CalendarSubscription | null> {
  const { data, error } = await admin.from("calendar_subscriptions").select(SELECT).eq("id", id).maybeSingle();
  if (error) throw new Error(`getSubscriptionById failed: ${error.code ?? "unknown"}`);
  return data ? fromRow(data as Row) : null;
}

export type SyncStateUpdate = {
  status: SubscriptionStatus;
  lastSyncStatus: string;
  lastError: string | null;
  eventCount: number;
  nextSyncAt: Date;
};

/** Records the outcome of a sync on the feed row (service role). */
export async function recordSyncResult(admin: SupabaseClient, id: string, update: SyncStateUpdate): Promise<void> {
  const { error } = await admin
    .from("calendar_subscriptions")
    .update({
      status: update.status,
      last_sync_at: new Date().toISOString(),
      last_sync_status: update.lastSyncStatus.slice(0, 40),
      last_error: update.lastError ? update.lastError.slice(0, 200) : null,
      event_count: update.eventCount,
      next_sync_at: update.nextSyncAt.toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(`recordSyncResult failed: ${error.code ?? "unknown"}`);
}
