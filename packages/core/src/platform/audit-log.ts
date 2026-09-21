import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import { platformCan, type PlatformAdmin } from "./admin";

/**
 * The platform-wide audit trail (story 16-008).
 *
 * `audit_events` already redacts its metadata before a row is ever written
 * (`api/audit.ts`) — that is what makes a household's own Activity screen
 * safe to show them. This module does not relax that; it only widens who
 * may read the same, already-safe rows: an operator troubleshooting across
 * households sees exactly what each household could see about itself, never
 * more.
 */

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export type PlatformAuditEvent = {
  id: string;
  householdId: string | null;
  eventType: string;
  actorProfileId: string | null;
  actorMemberId: string | null;
  targetTable: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
};

type Row = Record<string, unknown>;

function toEvent(row: Row): PlatformAuditEvent {
  return {
    id: row.id as string,
    householdId: (row.household_id as string | null) ?? null,
    eventType: row.event_type as string,
    actorProfileId: (row.actor_profile_id as string | null) ?? null,
    actorMemberId: (row.actor_member_id as string | null) ?? null,
    targetTable: (row.target_table as string | null) ?? null,
    targetId: (row.target_id as string | null) ?? null,
    metadata: (row.metadata as Record<string, unknown> | null) ?? {},
    createdAt: new Date(row.created_at as string),
  };
}

function clampLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(limit as number), 1), MAX_LIMIT);
}

/** Recent audit events across every household, most recent first. */
export async function listPlatformAuditEvents(
  adminClient: SupabaseClient,
  actor: PlatformAdmin,
  options: { limit?: number; eventType?: string } = {},
): Promise<PlatformAuditEvent[]> {
  if (!platformCan(actor, "audit.read_platform")) {
    throw ApiError.forbidden("Your platform role cannot view the platform-wide audit trail.");
  }

  let query = adminClient
    .from("audit_events")
    .select(
      "id, household_id, event_type, actor_profile_id, actor_member_id, target_table, target_id, metadata, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(clampLimit(options.limit));

  if (options.eventType) {
    query = query.eq("event_type", options.eventType);
  }

  const { data, error } = await query;
  if (error) throw new Error(`listPlatformAuditEvents failed: ${error.code ?? "unknown"}`);

  return ((data as Row[] | null) ?? []).map(toEvent);
}
