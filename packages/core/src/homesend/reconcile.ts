import type { SupabaseClient } from "@supabase/supabase-js";

import { listConsumables } from "../commerce/repository";
import { buildContextItems, type ContextRecords } from "../context/builders";
import { applyFreshness } from "../context/freshness";
import { describeMatch, findPotentialMatches, needsReconciliation } from "../context/matching";
import type { ContextDomain, IncomingFact, MatchVerdict } from "../context/types";
import { listObligations } from "../finance/repository";
import { listRecords } from "../health/records";
import { listSchoolItems } from "../school/repository";
import type { HomeSendChangeDomain } from "./items";

/**
 * Before HomeSend writes anything, is it already known? (Wave 1 §7)
 *
 * The same matcher HomeTalk uses, over the same domain the confirm form is
 * about to write into, read through the member's own client. A photo of
 * the electricity bill already on record is a reconciliation candidate for
 * the person to see — never a second bill created quietly beside the first.
 */

export type HomeSendReconciliation = {
  verdict: MatchVerdict;
  /** What the household is told, naming the record it resembles. */
  message: string;
  /** The existing record's id within its own table. */
  existingId: string;
};

const DOMAIN_FOR_KIND: Record<HomeSendChangeDomain, ContextDomain> = {
  bill: "bills",
  school_item: "school",
  grocery_item: "groceries",
  health_document: "health",
};

export type HomeSendCandidate = {
  kind: HomeSendChangeDomain;
  title: string;
  /** ISO date: a bill's due date, a school item's due date, a document's date. */
  date?: string | null;
  /** Major units, as typed or extracted — converted to minor units only here, at the comparison. */
  amount?: number | null;
  payee?: string | null;
  subjectMemberId?: string | null;
  /** When the source content was captured, so an older source never overrides a newer record. */
  capturedAt?: string | null;
};

async function readDomain(supabase: SupabaseClient, householdId: string, candidate: HomeSendCandidate): Promise<ContextRecords> {
  switch (candidate.kind) {
    case "bill":
      return { obligations: await listObligations(supabase, householdId) };
    case "school_item":
      return { schoolItems: await listSchoolItems(supabase, householdId, candidate.subjectMemberId ? { childMemberId: candidate.subjectMemberId } : {}) };
    case "grocery_item":
      return { consumables: await listConsumables(supabase, householdId) };
    case "health_document":
      return { healthRecords: await listRecords(supabase, householdId, candidate.subjectMemberId ? { memberId: candidate.subjectMemberId, statuses: ["active"] } : { statuses: ["active"] }) };
  }
}

/** The strongest existing record this candidate would duplicate or update, or null when it is genuinely new. */
export async function reconcileHomeSend(
  supabase: SupabaseClient,
  householdId: string,
  candidate: HomeSendCandidate,
  options: { timezone: string; now?: Date },
): Promise<HomeSendReconciliation | null> {
  if (!candidate.title.trim()) return null;
  const now = options.now ?? new Date();
  let records: ContextRecords;
  try {
    records = await readDomain(supabase, householdId, candidate);
  } catch {
    // Not being able to check is not the same as a duplicate; the write
    // still goes through the domain's own create, which has its own guards.
    return null;
  }

  const items = applyFreshness(buildContextItems(records, { householdId, householdName: "", timezone: options.timezone, now, viewerMemberId: "" }), now);
  const incoming: IncomingFact = {
    domain: DOMAIN_FOR_KIND[candidate.kind],
    title: candidate.title,
    subjectMemberId: candidate.subjectMemberId ?? null,
    date: candidate.date ?? null,
    amountMinor: candidate.amount != null ? Math.round(candidate.amount * 100) : null,
    attributes: { payee: candidate.payee ?? undefined },
    capturedAt: candidate.capturedAt ?? null,
  };

  const best = findPotentialMatches(incoming, items, { timezone: options.timezone }).find(needsReconciliation);
  if (!best?.item) return null;
  return { verdict: best.verdict, message: describeMatch(best), existingId: best.item.entityId };
}
