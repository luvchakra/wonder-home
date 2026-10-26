import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";

/**
 * Reading and writing the school channels a household tracks (story 08-031).
 *
 * A channel is part of a school connection — an administrator's to set up — so
 * RLS lets only an Admin write one, and every member of the household read which
 * are tracked (a channel naming a child is seen only by those who may see that
 * child). This module is the round trip; the policies in
 * `20261026210000_school_channels.sql` are authoritative, and a forbidden write
 * surfaces as `ApiError.forbidden`, never a silent no-op.
 */

export type SchoolChannel = {
  id: string;
  householdId: string;
  integrationId: string;
  provider: string;
  channelId: string;
  url: string;
  childMemberId: string | null;
  active: boolean;
  createdBy: string | null;
  lastMessageExternalId: string | null;
  lastPolledAt: Date | null;
};

type Row = {
  id: string;
  household_id: string;
  integration_id: string;
  provider: string;
  channel_id: string;
  url: string;
  child_member_id: string | null;
  active: boolean;
  created_by: string | null;
  last_message_external_id: string | null;
  last_polled_at: string | null;
};

const COLUMNS =
  "id, household_id, integration_id, provider, channel_id, url, child_member_id, active, created_by, last_message_external_id, last_polled_at";

function fromRow(row: Row): SchoolChannel {
  return {
    id: row.id,
    householdId: row.household_id,
    integrationId: row.integration_id,
    provider: row.provider,
    channelId: row.channel_id,
    url: row.url,
    childMemberId: row.child_member_id,
    active: row.active,
    createdBy: row.created_by,
    lastMessageExternalId: row.last_message_external_id,
    lastPolledAt: row.last_polled_at ? new Date(row.last_polled_at) : null,
  };
}

/** The channels a household tracks, newest first; optionally one connection's. */
export async function listSchoolChannels(
  supabase: SupabaseClient,
  householdId: string,
  options: { integrationId?: string; activeOnly?: boolean } = {},
): Promise<SchoolChannel[]> {
  let query = supabase.from("school_channels").select(COLUMNS).eq("household_id", householdId);
  if (options.integrationId) query = query.eq("integration_id", options.integrationId);
  if (options.activeOnly) query = query.eq("active", true);

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error(`listSchoolChannels failed: ${error.code ?? "unknown"}`);
  return (data as Row[] | null)?.map(fromRow) ?? [];
}

/**
 * Track a channel, or reactivate one already tracked.
 *
 * Keyed by (connection, channel id), so re-adding the same link does not make a
 * second row and a previously stopped channel comes back on. The caller passes
 * the parsed, normalised fields — a raw link is never stored unchecked.
 */
export async function addSchoolChannel(
  supabase: SupabaseClient,
  input: {
    householdId: string;
    integrationId: string;
    provider: string;
    channelId: string;
    url: string;
    childMemberId?: string | null;
    createdBy: string;
  },
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("school_channels")
    .upsert(
      {
        household_id: input.householdId,
        integration_id: input.integrationId,
        provider: input.provider,
        channel_id: input.channelId,
        url: input.url,
        child_member_id: input.childMemberId ?? null,
        created_by: input.createdBy,
        active: true,
      },
      { onConflict: "integration_id,channel_id" },
    )
    .select("id")
    .single();

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only an admin can track a school channel.");
    throw new Error(`addSchoolChannel failed: ${error.code ?? "unknown"}`);
  }
  return { id: (data as { id: string }).id };
}

/** Stop or resume tracking a channel. Stopping keeps the row, so its cursor is not lost. */
export async function setSchoolChannelActive(
  supabase: SupabaseClient,
  input: { householdId: string; id: string; active: boolean },
): Promise<void> {
  const { error } = await supabase
    .from("school_channels")
    .update({ active: input.active })
    .eq("household_id", input.householdId)
    .eq("id", input.id);
  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only an admin can change a school channel.");
    throw new Error(`setSchoolChannelActive failed: ${error.code ?? "unknown"}`);
  }
}

/** Record where a poll stopped, so the next one resumes and never re-files. */
export async function recordChannelPoll(
  supabase: SupabaseClient,
  input: { householdId: string; id: string; lastMessageExternalId: string | null; now?: Date },
): Promise<void> {
  const { error } = await supabase
    .from("school_channels")
    .update({
      last_message_external_id: input.lastMessageExternalId,
      last_polled_at: (input.now ?? new Date()).toISOString(),
    })
    .eq("household_id", input.householdId)
    .eq("id", input.id);
  if (error) throw new Error(`recordChannelPoll failed: ${error.code ?? "unknown"}`);
}
