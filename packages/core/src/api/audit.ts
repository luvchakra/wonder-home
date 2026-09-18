import type { SupabaseClient } from "@supabase/supabase-js";

import { redact } from "../security/redact";
import { log } from "../observability/logger";

/**
 * Audit hooks (story 18-006).
 *
 * The audit trail answers "who changed what, and when" — never "what was said
 * at dinner". Metadata is redacted before it is written, so an audit row cannot
 * become a side channel for the household content the privacy rules keep out of
 * logs.
 *
 * Writes go through the service-role client, because audit_events has no INSERT
 * policy: it is append-only from the client's point of view, and a member must
 * not be able to forge or suppress their own trail.
 */

export const AUDIT_EVENTS = [
  "household.created",
  "household.updated",
  "member.added",
  "member.removed",
  "member.role_granted",
  "member.role_revoked",
  "invitation.created",
  "invitation.revoked",
  "invitation.accepted",
  "child.created",
  "child.updated",
  "playbook.updated",
  "responsibility.updated",
  "policy.updated",
  "integration.connected",
  "integration.disconnected",
  "privacy.export_requested",
  "privacy.deletion_requested",
  "support.access_granted",
] as const;

export type AuditEventType = (typeof AUDIT_EVENTS)[number];

export type AuditEntry = {
  householdId: string;
  eventType: AuditEventType;
  actorMemberId?: string | null;
  actorProfileId?: string | null;
  targetTable?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  requestId?: string;
};

/**
 * Records a sensitive action.
 *
 * Deliberately never throws. An audit write failing should not turn a completed
 * action into an error the caller retries — that would be worse than a gap in
 * the trail — so the failure is reported and the request stands.
 */
export async function recordAuditEvent(
  adminClient: SupabaseClient,
  entry: AuditEntry,
): Promise<void> {
  const metadata = redact(entry.metadata ?? {}) as Record<string, unknown>;

  const { error } = await adminClient.from("audit_events").insert({
    household_id: entry.householdId,
    actor_member_id: entry.actorMemberId ?? null,
    actor_profile_id: entry.actorProfileId ?? null,
    event_type: entry.eventType,
    target_table: entry.targetTable ?? null,
    target_id: entry.targetId ?? null,
    metadata: { ...metadata, requestId: entry.requestId },
  });

  if (error) {
    log.error("audit write failed", {
      requestId: entry.requestId,
      eventType: entry.eventType,
      reason: error.code ?? "unknown",
      allow: ["eventType", "requestId", "reason"],
    });
  }
}

/** Reads the household's trail. Restricted to administrators by RLS. */
export async function listAuditEvents(
  supabase: SupabaseClient,
  householdId: string,
  limit = 50,
): Promise<
  {
    id: string;
    eventType: string;
    actorMemberId: string | null;
    targetTable: string | null;
    targetId: string | null;
    createdAt: string;
  }[]
> {
  const { data, error } = await supabase
    .from("audit_events")
    .select("id, event_type, actor_member_id, target_table, target_id, created_at")
    .eq("household_id", householdId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));

  if (error) throw new Error(`listAuditEvents failed: ${error.code ?? "unknown"}`);

  return (data ?? []).map((row) => ({
    id: row.id as string,
    eventType: row.event_type as string,
    actorMemberId: (row.actor_member_id as string | null) ?? null,
    targetTable: (row.target_table as string | null) ?? null,
    targetId: (row.target_id as string | null) ?? null,
    createdAt: row.created_at as string,
  }));
}
