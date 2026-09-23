import type { SupabaseClient } from "@supabase/supabase-js";

import { listConsumables } from "../commerce/repository";
import { buildContextItems, type ContextRecords } from "../context/builders";
import { applyFreshness } from "../context/freshness";
import { listEvents } from "../family/repository";
import { findPotentialMatches, needsReconciliation } from "../context/matching";
import type { ContextDomain, HouseholdContextItem, IncomingFact, MatchResult, MatchVerdict } from "../context/types";
import { listObligations } from "../finance/repository";
import { listRecords } from "../health/records";
import { listSchoolItems } from "../school/repository";
import type { HomeSendChangeDomain } from "./items";

/**
 * Before HomeSend writes anything, is it already known? (Wave 1 §7, Wave 3 §10)
 *
 * The same matcher HomeTalk uses, over the same domain the confirm form is
 * about to write into, read through the member's own client. What it finds
 * becomes a proposal the person decides on, never a quiet write:
 *
 *   duplicate     — already on record; keep the existing one
 *   update        — newer details for a record on record (a moved date, a
 *                   revised amount): "Update the existing event?"
 *   cancellation  — the content says it is called off: "Cancel it?"
 *   conflict      — the record was changed after this was captured, so the
 *                   record stands unless the person says otherwise
 *
 * Updates and cancellations only exist where the domain has a governed
 * service to perform them and put them back (a bill, a school item);
 * everywhere else a match is a duplicate to confirm or add anyway.
 */

export type HomeSendProposal =
  | { type: "duplicate" }
  | { type: "update"; changes: HomeSendFieldChange[] }
  | { type: "cancellation" }
  | { type: "conflict" };

export type HomeSendFieldChange = { field: "date" | "amount"; from: string | number | null; to: string | number };

export type HomeSendReconciliation = {
  verdict: MatchVerdict;
  /** What the household is told, naming the record it resembles. */
  message: string;
  /** The existing record's id within its own table. */
  existingId: string;
  existing: { title: string; date: string | null; status: string | null; subjectMemberId: string | null; subjectName: string | null; amountMinor: number | null };
  proposal: HomeSendProposal;
};

/**
 * The domains a candidate is reconciled in: every change domain but a
 * purchase — a receipt line is a new fact about what was bought, never a
 * second copy of a record (09-009), so there is nothing to reconcile it with.
 */
export type ReconcilableDomain = Exclude<HomeSendChangeDomain, "purchase">;

const DOMAIN_FOR_KIND: Record<ReconcilableDomain, ContextDomain> = {
  bill: "bills",
  school_item: "school",
  grocery_item: "groceries",
  health_document: "health",
};

/** Domains whose governed services can update or cancel a record, and put it back on undo. */
const REVISABLE: ReadonlySet<ReconcilableDomain> = new Set(["bill", "school_item"]);

export type HomeSendCandidate = {
  kind: ReconcilableDomain;
  title: string;
  /** ISO date: a bill's due date, a school item's due date, a document's date. */
  date?: string | null;
  /** Major units, as typed or extracted — converted to minor units only here, at the comparison. */
  amount?: number | null;
  payee?: string | null;
  subjectMemberId?: string | null;
  /** When the source content was captured, so an older source never overrides a newer record. */
  capturedAt?: string | null;
  /** Whether the content announces a change to something announced before (§10). */
  change?: "new" | "update" | "cancellation";
};

async function readDomain(supabase: SupabaseClient, householdId: string, candidate: HomeSendCandidate): Promise<ContextRecords> {
  switch (candidate.kind) {
    case "bill":
      return { obligations: await listObligations(supabase, householdId) };
    case "school_item": {
      // A school notice about a meeting the family already put on its own
      // calendar is the same meeting (HB-012). The calendar is read as a
      // courtesy: not being able to read it never blocks the school check.
      const [schoolItems, events] = await Promise.all([
        listSchoolItems(supabase, householdId, candidate.subjectMemberId ? { childMemberId: candidate.subjectMemberId } : {}),
        listEvents(supabase, householdId, { from: new Date(Date.now() - 2 * 86_400_000) }).catch(() => []),
      ]);
      return { schoolItems, events };
    }
    case "grocery_item":
      return { consumables: await listConsumables(supabase, householdId) };
    case "health_document":
      return { healthRecords: await listRecords(supabase, householdId, candidate.subjectMemberId ? { memberId: candidate.subjectMemberId, statuses: ["active"] } : { statuses: ["active"] }) };
  }
}

const NOUN: Record<ReconcilableDomain, string> = { bill: "bill", school_item: "one", grocery_item: "item", health_document: "document" };

/** What to call the record in the question: the school item's own kind ("event", "exam", "homework") when it has one. */
function nounFor(kind: ReconcilableDomain, item: HouseholdContextItem): string {
  const own = item.attributes.kind;
  if (kind === "school_item" && typeof own === "string" && own.trim()) return own.replace(/_/g, " ");
  return NOUN[kind];
}

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "28 Sep" — the §10 example's own wording. */
export function shortDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  return `${Number(match[3])} ${SHORT_MONTHS[Number(match[2]) - 1]}`;
}

function formatAmount(minor: number | null, currency: string | null): string | null {
  if (minor === null) return null;
  return `${(minor / 100).toFixed(2)}${currency ? ` ${currency}` : ""}`;
}

type Existing = HomeSendReconciliation["existing"];

function existingOf(item: HouseholdContextItem, names: ReadonlyMap<string, string>): Existing {
  const attributes = item.attributes;
  const subjectId = item.subjectMemberIds.find((id): id is string => typeof id === "string" && names.has(id));
  return {
    title: typeof attributes.title === "string" ? attributes.title : item.summary,
    date: typeof attributes.date === "string" ? attributes.date : null,
    status: typeof attributes.status === "string" ? attributes.status : null,
    subjectMemberId: subjectId ?? null,
    subjectName: subjectId ? (names.get(subjectId) ?? null) : null,
    amountMinor: typeof attributes.amountMinor === "number" ? attributes.amountMinor : null,
  };
}

/**
 * The decision the person is offered, and the words it is offered in.
 * Pure: the same match always produces the same proposal.
 */
export function proposalFor(
  match: MatchResult,
  candidate: HomeSendCandidate,
  names: ReadonlyMap<string, string> = new Map(),
): HomeSendReconciliation | null {
  if (!match.item) return null;
  const existing = existingOf(match.item, names);
  // "Asmi's Science Exhibition" — but never "Kunal's electricity bill": a
  // bill's person is who is responsible for it, not whose it is.
  const personal = candidate.kind === "school_item" || candidate.kind === "health_document";
  const owner = personal && existing.subjectName ? `${existing.subjectName}'s ` : "the ";
  const when = shortDate(existing.date);
  const found = `I found ${owner}existing ${existing.title}${when ? ` for ${when}` : ""}`;
  const revisable = REVISABLE.has(candidate.kind);
  const cancelled = existing.status === "cancelled";

  const sameThing =
    match.verdict !== "no_match" &&
    (match.verdict !== "related_but_different" || !match.reasons.some((reason) => reason === "for a different person" || reason === "a different variety"));
  if (candidate.change === "cancellation" && revisable && !cancelled && sameThing) {
    return {
      verdict: match.verdict,
      existingId: match.item.entityId,
      existing,
      proposal: { type: "cancellation" },
      message: `${found}. This message says it is cancelled. Cancel the existing ` + `${nounFor(candidate.kind, match.item)}?`,
    };
  }

  if (!needsReconciliation(match)) return null;

  if (match.verdict === "contradiction") {
    return {
      verdict: match.verdict,
      existingId: match.item.entityId,
      existing,
      proposal: { type: "conflict" },
      message: `${found}. It was changed after this message was written, so the one on record stands unless you say otherwise.`,
    };
  }

  // A moved date one day away matches as a likely duplicate; when the content
  // itself says something changed, the difference is the point (§10).
  const announcedChange = candidate.change === "update" && (match.verdict === "likely_duplicate" || match.verdict === "exact_match");
  if ((match.verdict === "likely_update" || announcedChange) && revisable && !cancelled) {
    const changes: HomeSendFieldChange[] = [];
    const newDate = candidate.date ? candidate.date.slice(0, 10) : null;
    if (newDate && newDate !== existing.date) changes.push({ field: "date", from: existing.date, to: newDate });
    const newAmount = candidate.amount != null ? Math.round(candidate.amount * 100) : null;
    if (candidate.kind === "bill" && newAmount !== null && newAmount !== existing.amountMinor) changes.push({ field: "amount", from: existing.amountMinor, to: newAmount });
    if (changes.length > 0) {
      const says = changes
        .map((change) => (change.field === "date" ? `it moved to ${shortDate(String(change.to))}` : `the amount is now ${formatAmount(Number(change.to), null)}`))
        .join(" and ");
      const noun = nounFor(candidate.kind, match.item);
      return {
        verdict: match.verdict,
        existingId: match.item.entityId,
        existing,
        proposal: { type: "update", changes },
        message: `${found}. This message says ${says}. Update the existing ` + `${noun}?`,
      };
    }
  }

  return {
    verdict: match.verdict,
    existingId: match.item.entityId,
    existing,
    proposal: { type: "duplicate" },
    message: `${found}. ${match.verdict === "related_but_different" ? "It may be a different one" : "This looks like the same one"} — keep the existing one, or add this as new?`,
  };
}

/** The strongest existing record this candidate would duplicate, update or cancel, or null when it is genuinely new. */
export async function reconcileHomeSend(
  supabase: SupabaseClient,
  householdId: string,
  candidate: HomeSendCandidate,
  options: {
    timezone: string;
    now?: Date;
    memberNames?: ReadonlyMap<string, string>;
    /**
     * Throw when the records could not be read, instead of answering "nothing
     * on record" — for a caller about to apply something on its own (§12),
     * where an unchecked item must never be taken for a new one.
     */
    strict?: boolean;
  },
): Promise<HomeSendReconciliation | null> {
  if (!candidate.title.trim()) return null;
  let records: ContextRecords;
  try {
    records = await readDomain(supabase, householdId, candidate);
  } catch (thrown) {
    if (options.strict) throw thrown;
    // Not being able to check is not the same as a duplicate; the write
    // still goes through the domain's own create, which has its own guards.
    return null;
  }
  return reconcileAgainstRecords(records, householdId, candidate, options);
}

/**
 * The decision itself, over records already read: the same function the
 * live path uses after reading the database, and the one the evaluation
 * framework (Wave 5) runs against a golden household's records — so what is
 * measured is what ships.
 */
export function reconcileAgainstRecords(
  records: ContextRecords,
  householdId: string,
  candidate: HomeSendCandidate,
  options: { timezone: string; now?: Date; memberNames?: ReadonlyMap<string, string> },
): HomeSendReconciliation | null {
  if (!candidate.title.trim()) return null;
  const now = options.now ?? new Date();
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

  const matches = findPotentialMatches(incoming, items, { timezone: options.timezone });
  // A cancellation may name its record less exactly than an update does — the
  // closest same-subject match is still the one to ask about.
  const best = matches.find(needsReconciliation) ?? (candidate.change === "cancellation" ? matches[0] : undefined);
  if (best) return proposalFor(best, candidate, options.memberNames);

  // A school notice for something already on the family calendar ("School
  // meeting" and the "Parent-teacher meeting" the parents put there). The
  // calendar entry's people are whoever attends — a parent, for a meeting
  // about their child — so the person is not compared, only the name and the
  // day. It is only ever offered as "already on record": a calendar entry is
  // changed or cancelled on the family calendar, never from a school notice.
  if (candidate.kind === "school_item") {
    const onCalendar = findPotentialMatches({ ...incoming, domain: "calendar", subjectMemberId: null, amountMinor: null }, items, { timezone: options.timezone }).find(
      (match) => match.verdict === "exact_match" || match.verdict === "likely_duplicate",
    );
    if (onCalendar?.item) return calendarDuplicate(onCalendar, candidate, options.memberNames);
  }
  return null;
}

function calendarDuplicate(match: MatchResult, candidate: HomeSendCandidate, names: ReadonlyMap<string, string> = new Map()): HomeSendReconciliation {
  const item = match.item!;
  // Whoever attends is not whose it is: never offered as the notice's subject.
  const existing = { ...existingOf(item, names), subjectMemberId: null, subjectName: null };
  const when = shortDate(existing.date);
  const found = `I found ${existing.title}${when ? ` on ${when}` : ""} on the family calendar`;
  const says =
    candidate.change === "cancellation"
      ? "This message says it is cancelled — cancel it on the family calendar, or add this as new?"
      : candidate.change === "update"
        ? "This message says it changed — change it on the family calendar, or add this as new?"
        : "This looks like the same one — keep the existing one, or add this as new?";
  return { verdict: match.verdict, existingId: item.entityId, existing, proposal: { type: "duplicate" }, message: `${found}. ${says}` };
}
