import type { SupabaseClient } from "@supabase/supabase-js";

import { loadHouseholdContext } from "@wonderhome/core/context/repository";
import type { HouseholdContextItem } from "@wonderhome/core/context/types";
import type { HomeSendExtraction, HomeSendKind } from "@wonderhome/core/homesend/items";
import { reconcileHomeSend, type HomeSendReconciliation } from "@wonderhome/core/homesend/reconcile";
import { resolveIntakePeople, type SubjectResolution } from "@wonderhome/core/homesend/resolve";
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
};

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
  item: { classifiedKind: HomeSendKind | null; extracted: HomeSendExtraction | null; understanding: IntakeUnderstanding | null; createdAt?: string | null },
): Promise<ReviewPreparation> {
  const kind = item.classifiedKind;
  if (!kind || kind === "unknown" || !item.extracted?.title) return { subject: null, reconciliation: null, understanding: item.understanding };

  const people = await householdPeople(supabase, membership).catch(() => []);
  const resolution = item.understanding
    ? resolveIntakePeople(item.understanding, people, { viewerMemberId: membership.memberId })
    : null;
  const understanding = item.understanding && resolution ? { ...item.understanding, references: resolution.references } : item.understanding;
  const memberNames = new Map(people.map((person) => [person.entityId, String(person.attributes.displayName)]));

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
    { timezone: membership.household.timezone, memberNames },
  ).catch(() => null);

  return { subject: resolution?.subject ?? null, reconciliation, understanding };
}
