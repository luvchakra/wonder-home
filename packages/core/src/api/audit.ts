import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "../db/admin";
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
  "ai.key_set",
  "ai.key_removed",
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

export type AuditRow = {
  id: string;
  eventType: string;
  actorMemberId: string | null;
  targetTable: string | null;
  targetId: string | null;
  /** Already redacted on the way in; safe to render. */
  metadata: Record<string, unknown>;
  createdAt: string;
};

/**
 * Reads the household's trail. Restricted to administrators by RLS.
 *
 * Metadata comes back because the screen phrases each entry from it, and it
 * is safe to: `recordAuditEvent` redacts before writing, so nothing here ever
 * held a secret or raw private content to begin with.
 */
export async function listAuditEvents(
  supabase: SupabaseClient,
  householdId: string,
  limit = 50,
): Promise<AuditRow[]> {
  const { data, error } = await supabase
    .from("audit_events")
    .select("id, event_type, actor_member_id, target_table, target_id, metadata, created_at")
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
    metadata: (row.metadata as Record<string, unknown> | null) ?? {},
    createdAt: row.created_at as string,
  }));
}

/**
 * Records a sensitive change from a domain function (story 15-006).
 *
 * Two things every caller would otherwise have to remember, and one of them
 * eventually would not.
 *
 * It uses the service-role client, because `audit_events` has no INSERT
 * policy: a member must not be able to forge or suppress their own trail, so
 * the household's own client cannot write one.
 *
 * It swallows its own failure. A change that completed must not be reported
 * as an error because the note about it did not save — a caller that retried
 * on that would make the real change twice. The failure is logged by
 * `recordAuditEvent`, and `sensitive-actions.test.ts` is what keeps the gaps
 * from being silent ones.
 */
export async function auditChange(entry: AuditEntry): Promise<void> {
  try {
    await recordAuditEvent(createAdminClient(), entry);
  } catch {
    // Already logged. A trail gap must not fail the change it describes.
  }
}
