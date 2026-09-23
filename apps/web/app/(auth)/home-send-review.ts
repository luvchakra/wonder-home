import type { SupabaseClient } from "@supabase/supabase-js";

import { loadHouseholdContext } from "@wonderhome/core/context/repository";
import { listResponsibilities } from "@wonderhome/core/household/configuration-repository";
import type { AutonomyMode } from "@wonderhome/core/household/autonomy";
import { AUTO_APPLY_OUTCOMES, decideConfirmation, type ConfirmationDecision } from "@wonderhome/core/homesend/confirmation";
import type { HouseholdContextItem } from "@wonderhome/core/context/types";
import type { HomeSendExtraction, HomeSendKind } from "@wonderhome/core/homesend/items";
import { reconcileHomeSend, type HomeSendReconciliation } from "@wonderhome/core/homesend/reconcile";
import { adoptMatchedSubject, resolveIntakePeople, type SubjectResolution } from "@wonderhome/core/homesend/resolve";
import type { IntakeUnderstanding } from "@wonderhome/core/homesend/understanding";
import type { HouseholdMembership } from "@wonderhome/core/identity/schemas";
import { buildPersonalView } from "@wonderhome/core/identity/views";

/**
 * What the review step needs beyond the reading itself (Wave 3 §9, §10):
 * who the item is for, resolved through the household's own people by the
 * same Wave 1 resolver HomeBrain uses, and whether it is already on record
 * — a duplicate, newer details for something on record, or a cancellation
 * of it. Computed on the member's own client, never stored: the household
 * can change between an item arriving and being reviewed.
 */

export type ReviewPreparation = {
  subject: SubjectResolution | null;
  reconciliation: HomeSendReconciliation | null;
  understanding: IntakeUnderstanding | null;
  /** How this item is confirmed (§12): applied on its own, prepared, one question, or held for a person. */
  confirmation: ConfirmationDecision;
};

/**
 * The household's own autonomy setting for the outcome a kind belongs to
 * (§12), read from its responsibilities — the same row the Manage Household
 * screen writes. Anything unconfigured, or unreadable, is "observe".
 */
async function autonomyFor(supabase: SupabaseClient, householdId: string, kind: HomeSendKind): Promise<AutonomyMode> {
  const outcome = AUTO_APPLY_OUTCOMES[kind];
  if (!outcome) return "observe";
  const rows = await listResponsibilities(supabase, householdId).catch(() => []);
  return rows.find((row) => row.outcomeKey === outcome.outcomeKey)?.aiMode ?? "observe";
}

async function householdPeople(supabase: SupabaseClient, membership: HouseholdMembership): Promise<HouseholdContextItem[]> {
  const view = buildPersonalView(membership);
  const snapshot = await loadHouseholdContext(
    supabase,
    {
      householdId: membership.household.id,
      householdName: membership.household.name,
      timezone: membership.household.timezone,
      now: new Date(),
      viewer: { memberId: membership.memberId, permissions: view.permissions, tone: view.tone, guardianOf: [] },
    },
    // People only: resolution needs the household's members, nothing else.
    { domains: [] },
  );
  return snapshot.items.filter((item) => item.entityType === "member");
}

export async function prepareReview(
  supabase: SupabaseClient,
  membership: HouseholdMembership,
  item: {
    classifiedKind: HomeSendKind | null;
    extracted: HomeSendExtraction | null;
    understanding: IntakeUnderstanding | null;
    createdAt?: string | null;
    /** Null for an email: nobody in the household was acting when it arrived. */
    createdByMemberId: string | null;
  },
): Promise<ReviewPreparation> {
  const kind = item.classifiedKind;
  const confirm = (subject: SubjectResolution | null, reconciliation: HomeSendReconciliation | null, understanding: IntakeUnderstanding | null, autonomy: AutonomyMode) =>
    decideConfirmation({ kind, extracted: item.extracted, understanding, reconciliation, subject, memberInitiated: item.createdByMemberId !== null, autonomy });
  // A receipt is matched line by line on its own confirm form (09-009): it is
  // for nobody in particular and never a second copy of a record.
  if (!kind || kind === "unknown" || kind === "receipt" || !item.extracted?.title) {
    return { subject: null, reconciliation: null, understanding: item.understanding, confirmation: confirm(null, null, item.understanding, "observe") };
  }

  const people = await householdPeople(supabase, membership).catch(() => []);
  const resolution = item.understanding
    ? resolveIntakePeople(item.understanding, people, { viewerMemberId: membership.memberId })
    : null;
  const understanding = item.understanding && resolution ? { ...item.understanding, references: resolution.references } : item.understanding;
  const memberNames = new Map(people.map((person) => [person.entityId, String(person.attributes.displayName)]));

  // Strict: if what is on record could not be read, nothing may apply on its
  // own (§12) — the item is prepared for a person instead.
  let checked = true;
  const reconciliation = await reconcileHomeSend(
    supabase,
    membership.household.id,
    {
      kind,
      title: item.extracted.title,
      date: item.extracted.dueDate ?? item.extracted.documentDate ?? null,
      amount: item.extracted.amount,
      payee: item.extracted.payee,
      subjectMemberId: resolution?.subject.selected?.memberId ?? null,
      capturedAt: item.createdAt ?? new Date().toISOString(),
      change: item.extracted.change ?? item.understanding?.change ?? "new",
    },
    { timezone: membership.household.timezone, memberNames, strict: true },
  ).catch(() => {
    checked = false;
    return null;
  });

  // Who it is for: what the content said, or else whose record it matched.
  const subject = resolution ? adoptMatchedSubject(kind, resolution.subject, reconciliation?.existing.subjectMemberId, people) : null;
  const autonomy = checked ? await autonomyFor(supabase, membership.household.id, kind) : "observe";
  return { subject, reconciliation, understanding, confirmation: confirm(subject, reconciliation, understanding, autonomy) };
}
