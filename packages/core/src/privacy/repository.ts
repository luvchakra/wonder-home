import type { SupabaseClient } from "@supabase/supabase-js";

import { auditChange } from "../api/audit";
import { ApiError } from "../api/errors";
import type { Permission } from "../identity/permissions";
import { requireStepUp } from "../security/step-up-repository";
import { EXPORT_SECTIONS, sectionsFor, type ExportFile, type ExportSection } from "./export";
import { actsAt, DELETION_GRACE_DAYS } from "./retention";

/**
 * Export and deletion requests (story 15-007).
 *
 * Both are gated on a step-up verification that this module spends rather than
 * merely checks, and both are audited. The two facts are related: the audit
 * entry is the only durable record that somebody confirmed themselves before
 * their data moved, and it is written on the admin client precisely so the
 * person who triggered it cannot remove it afterwards.
 */

type Row = Record<string, unknown>;

export type PrivacyRequest = {
  id: string;
  kind: "export" | "deletion";
  status: "pending" | "ready" | "completed" | "cancelled" | "refused";
  subjectMemberId: string | null;
  requestedByMemberId: string | null;
  actsAt: Date | null;
  createdAt: Date;
  refusalReason: string | null;
};

export async function listPrivacyRequests(
  supabase: SupabaseClient,
  householdId: string,
): Promise<PrivacyRequest[]> {
  const { data, error } = await supabase
    .from("privacy_requests")
    .select("id, kind, status, subject_member_id, requested_by_member_id, acts_at, created_at, refusal_reason")
    .eq("household_id", householdId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw new Error(`listPrivacyRequests failed: ${error.code ?? "unknown"}`);

  return ((data as Row[] | null) ?? []).map((row) => ({
    id: row.id as string,
    kind: row.kind as PrivacyRequest["kind"],
    status: row.status as PrivacyRequest["status"],
    subjectMemberId: (row.subject_member_id as string | null) ?? null,
    requestedByMemberId: (row.requested_by_member_id as string | null) ?? null,
    actsAt: row.acts_at ? new Date(row.acts_at as string) : null,
    createdAt: new Date(row.created_at as string),
    refusalReason: (row.refusal_reason as string | null) ?? null,
  }));
}

/**
 * Builds the export, now, with the member's own client.
 *
 * Deliberately synchronous rather than queued. A queued export needs a worker,
 * a place to put the file and a signed URL to hand back — three things that
 * each become a way for the file to reach somebody it was not built for. A
 * household's own data is small enough to assemble in a request, so it is
 * assembled in the request and streamed straight back to the person who asked.
 *
 * The client is the caller's, so RLS narrows every query to what this person
 * may see. `sectionsFor` narrows it again by permission. Neither alone is
 * trusted: an export touches every table at once, which is exactly the request
 * where one missing policy is a whole household's finances in the wrong hands.
 */
export async function buildExport(
  supabase: SupabaseClient,
  input: {
    householdId: string;
    householdName: string;
    memberId: string;
    displayName: string;
    permissions: readonly Permission[];
  },
  now: Date = new Date(),
): Promise<ExportFile> {
  // Spent before a single row is read. An export that half-failed must not
  // leave a live verification a retry could use without asking again.
  await requireStepUp(supabase, { memberId: input.memberId, purpose: "export" }, now);

  const allowed = sectionsFor(input.permissions);
  const sections: Record<string, unknown[]> = {};

  for (const section of allowed) {
    sections[section.key] = await readSection(supabase, section, input.householdId, input.memberId);
  }

  const withheld = EXPORT_SECTIONS.filter((section) => !allowed.includes(section)).map((section) => ({
    label: section.label,
    because: `Your household role does not include "${section.requires}".`,
  }));

  await createRequest(supabase, {
    householdId: input.householdId,
    memberId: input.memberId,
    kind: "export",
    status: "completed",
    now,
  });

  await auditChange({
    householdId: input.householdId,
    actorMemberId: input.memberId,
    eventType: "privacy.export_requested",
    targetTable: "household_members",
    targetId: input.memberId,
    // Section keys and counts only. The point of an audit entry here is that
    // an export happened, not a second copy of what was in it.
    metadata: {
      sections: allowed.map((section) => section.key),
      rows: Object.values(sections).reduce((total, rows) => total + rows.length, 0),
    },
  });

  return {
    formatVersion: 1,
    generatedAt: now.toISOString(),
    household: { id: input.householdId, name: input.householdName },
    subject: { memberId: input.memberId, displayName: input.displayName },
    withheldSections: withheld,
    sections,
  };
}

async function readSection(
  supabase: SupabaseClient,
  section: ExportSection,
  householdId: string,
  memberId: string,
): Promise<unknown[]> {
  let query = supabase.from(section.table).select(section.columns.join(", ")).eq("household_id", householdId);

  if (section.scope === "member" && section.memberColumn) {
    query = query.eq(section.memberColumn, memberId);
  }

  if (section.scope === "member_via" && section.via) {
    const { data: parents } = await supabase
      .from(section.via.table)
      .select(section.via.idColumn)
      .eq("household_id", householdId)
      .eq(section.via.memberColumn, memberId);

    const ids = ((parents as Row[] | null) ?? []).map((row) => row[section.via!.idColumn] as string);
    // No parents means no rows. Skipping the filter would return the whole
    // household's, which is the one mistake this scope exists to prevent.
    if (ids.length === 0) return [];
    query = query.in(section.via.localColumn, ids);
  }

  const { data, error } = await query.limit(5000);

  // One unreadable section must not silently become an empty one: a person
  // reading their export would take the absence as fact.
  if (error) throw new ApiError("internal", `Could not read "${section.label}" for your export.`);

  return (data as unknown[] | null) ?? [];
}

/**
 * Asks for data to be deleted.
 *
 * A request with a grace window rather than a button. The window is the
 * household's chance to change its mind, and it is the difference between a
 * product that respects a decision and one that punishes a bad evening.
 *
 * The Head of Family is refused. A household's head owns the tenant itself,
 * and deleting them would leave a home nobody administers, with children and
 * helpers still in it — the head hands over first, which is a different
 * action with different consequences and deserves its own flow rather than
 * being smuggled in behind this one.
 */
export async function requestDeletion(
  supabase: SupabaseClient,
  input: {
    householdId: string;
    memberId: string;
    isHead: boolean;
  },
  now: Date = new Date(),
): Promise<{ id: string; actsAt: Date }> {
  if (input.isHead) {
    throw new ApiError(
      "unprocessable",
      `You are the Head of Family, so deleting your data would leave the household without anyone to run it. Hand that role to another adult first, then come back.`,
    );
  }

  await requireStepUp(supabase, { memberId: input.memberId, purpose: "deletion" }, now);

  const when = actsAt(now);
  const id = await createRequest(supabase, {
    householdId: input.householdId,
    memberId: input.memberId,
    kind: "deletion",
    status: "pending",
    actsAt: when,
    now,
  });

  await auditChange({
    householdId: input.householdId,
    actorMemberId: input.memberId,
    eventType: "privacy.deletion_requested",
    targetTable: "household_members",
    targetId: input.memberId,
    metadata: { graceDays: DELETION_GRACE_DAYS, actsAt: when.toISOString() },
  });

  return { id, actsAt: when };
}

/** Changes its mind. Available to the subject for the whole grace window. */
export async function cancelDeletion(
  supabase: SupabaseClient,
  input: { householdId: string; memberId: string; requestId: string },
  now: Date = new Date(),
): Promise<void> {
  const { data, error } = await supabase
    .from("privacy_requests")
    .update({ status: "cancelled", cancelled_at: now.toISOString() })
    .eq("id", input.requestId)
    .eq("household_id", input.householdId)
    .eq("subject_member_id", input.memberId)
    .eq("kind", "deletion")
    .in("status", ["pending", "ready"])
    .select("id")
    .maybeSingle();

  if (error) throw new ApiError("internal", "Could not cancel that just now. Please try again.");
  if (!data) throw ApiError.notFound("There is no deletion waiting to be cancelled.");

  await auditChange({
    householdId: input.householdId,
    actorMemberId: input.memberId,
    eventType: "privacy.deletion_cancelled",
    targetTable: "privacy_requests",
    targetId: input.requestId,
  });
}

async function createRequest(
  supabase: SupabaseClient,
  input: {
    householdId: string;
    memberId: string;
    kind: "export" | "deletion";
    status: "pending" | "completed";
    actsAt?: Date;
    now: Date;
  },
): Promise<string> {
  const { data, error } = await supabase
    .from("privacy_requests")
    .insert({
      household_id: input.householdId,
      requested_by_member_id: input.memberId,
      subject_member_id: input.memberId,
      kind: input.kind,
      status: input.status,
      acts_at: input.actsAt?.toISOString() ?? null,
      completed_at: input.status === "completed" ? input.now.toISOString() : null,
    })
    .select("id")
    .single();

  if (error) {
    // The partial unique index refuses a second live request of the same kind.
    if (error.code === "23505") {
      throw ApiError.conflict(
        input.kind === "deletion"
          ? "You have already asked for this. It is waiting, and you can cancel it below."
          : "An export is already being prepared.",
      );
    }
    throw new ApiError("internal", "Could not record that request. Please try again.");
  }

  return (data as Row).id as string;
}
