import type { SupabaseClient } from "@supabase/supabase-js";

import { listConsumables } from "../commerce/repository";
import type { ContextRecords } from "../context/builders";
import { tokens } from "../context/normalize";
import type { HouseholdContextItem } from "../context/types";
import { listEvents } from "../family/repository";
import { listObligations } from "../finance/repository";
import { listEnrolments } from "../school/enrolments";
import { listSchoolItems } from "../school/repository";
import type { DocumentReading, DocumentRecord, EvidenceRef } from "./document";
import { reconcileAgainstRecords, shortDate, type HomeSendCandidate, type HomeSendReconciliation } from "./reconcile";
import { resolveIntakePeople, type IntakePerson } from "./resolve";

/**
 * The change plan (Deep Document Understanding 2.0 §14–30, §36).
 *
 * Every record a document proposes is reconciled on its own against what
 * the household already has, and given exactly one outcome:
 *
 *   create       genuinely new                         → "New"
 *   update       newer details for a record on file   → "Updates" (field by field)
 *   cancel       the document calls it off           → "Updates"
 *   no_change    already on record, nothing new      → "Already on record"
 *   conflict     the record changed after the document was written → "Conflicts"
 *   needs_answer who it is for is not clear          → "Needs your answer"
 *
 * Pure over records already read — the same function the review, the golden
 * scenarios and the evaluation run, so what is measured is what ships. It
 * never writes, never names an id the household's own records did not
 * supply, and never picks a person the household would have been asked
 * about (§29): a question is an outcome, not a failure.
 */

export type PlanAction = "create" | "update" | "cancel" | "no_change" | "conflict" | "needs_answer";
export type PlanGroup = "updates" | "new" | "already_on_record" | "conflicts" | "needs_answer";

/** The §36 order: what changes first, then what is new, then what is already known, then what needs a person. */
export const PLAN_GROUPS: readonly PlanGroup[] = ["updates", "new", "already_on_record", "conflicts", "needs_answer"];

export const PLAN_GROUP_TITLES: Record<PlanGroup, string> = {
  updates: "Updates",
  new: "New",
  already_on_record: "Already on record",
  conflicts: "Conflicts",
  needs_answer: "Needs your answer",
};

const GROUP_FOR: Record<PlanAction, PlanGroup> = {
  create: "new",
  update: "updates",
  cancel: "updates",
  no_change: "already_on_record",
  conflict: "conflicts",
  needs_answer: "needs_answer",
};

/** One value the record will carry, and where it came from (§30: "From document" / "From your household records"). */
export type PlanField = { field: string; label: string; value: string; source: "document" | "household" };

/** One field an update changes (§18, §25): what it was, what it becomes. */
export type PlanFieldChange = { field: "date" | "amount"; label: string; before: string | null; after: string };

export type PlanEntry = {
  /** The document record this entry is about ("r1"…). */
  key: string;
  domain: DocumentRecord["domain"];
  action: PlanAction;
  group: PlanGroup;
  title: string;
  /** One line saying why this outcome — the row's reason (rule 4). */
  reason: string;
  fields: PlanField[];
  changes: PlanFieldChange[];
  /** The record on file this entry updates, cancels, matches or conflicts with. */
  existing: { id: string; title: string; date: string | null } | null;
  /** Who it is for, once that is clear. */
  person: IntakePerson | null;
  /** The one question, when it is not (§29). */
  question: { text: string; options: IntakePerson[] } | null;
  evidence: EvidenceRef;
  /** Whether it is ticked when the review opens: a change is; a no-op, a conflict or an open question is not. */
  included: boolean;
  record: DocumentRecord;
};

export type DocumentPlan = {
  version: 1;
  pages: DocumentReading["pages"];
  issuedOn: string | null;
  entries: PlanEntry[];
  counts: Record<PlanGroup, number>;
  /** How many entries would write something if applied as they stand. */
  changeCount: number;
};

export type PlanContext = ContextRecords & {
  enrolments?: readonly { childMemberId: string; schoolName: string; grade: string | null }[];
};

export type PlanOptions = {
  householdId: string;
  timezone: string;
  now?: Date;
  viewerMemberId: string;
  /** The household's people, as the Wave 1 context builds them. */
  people: readonly HouseholdContextItem[];
  /** When the content arrived — used when the document prints no date of its own. */
  receivedAt?: string | null;
  /** A person's answer to a "who is this for" question, by record key. */
  answers?: Readonly<Record<string, string>>;
};

/** Everything the plan compares against, read once for the whole document through the member's own client. */
export async function readPlanContext(supabase: SupabaseClient, householdId: string, now: Date = new Date()): Promise<PlanContext> {
  const [obligations, schoolItems, consumables, events, enrolments] = await Promise.all([
    listObligations(supabase, householdId),
    listSchoolItems(supabase, householdId),
    listConsumables(supabase, householdId),
    // The family calendar and enrolments are read as a courtesy: not being
    // able to read them never blocks the plan (the school check still runs).
    listEvents(supabase, householdId, { from: new Date(now.getTime() - 2 * 86_400_000) }).catch(() => []),
    listEnrolments(supabase, householdId).catch(() => []),
  ]);
  return { obligations, schoolItems, consumables, events, enrolments };
}

const money = (amount: number, currency: string | null): string => {
  const symbol = !currency || currency.toUpperCase() === "INR" || currency === "₹" ? "₹" : `${currency.toUpperCase()} `;
  return `${symbol}${amount.toLocaleString("en-IN", { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 })}`;
};

/** What the record would write, each value marked with where it came from. */
function fieldsFor(record: DocumentRecord, person: IntakePerson | null, context: PlanContext): PlanField[] {
  const fields: PlanField[] = [];
  const add = (field: string, label: string, value: string | number | null | undefined, source: PlanField["source"] = "document") => {
    if (value === null || value === undefined || value === "") return;
    fields.push({ field, label, value: String(value), source });
  };
  add("title", "Title", record.title);
  if (record.date) add("date", record.domain === "bill" ? "Due" : "Date", shortDate(record.date) ?? record.date);
  if (record.time) add("time", "Time", record.endTime ? `${record.time}–${record.endTime}` : record.time);
  if (person) add("person", record.domain === "school_item" ? "Child" : "For", person.displayName);
  // Contextual enrichment (§30): deterministic, from the household's own
  // records, and always marked as such.
  if (record.domain === "school_item" && person) {
    const enrolment = context.enrolments?.find((entry) => entry.childMemberId === person.memberId);
    if (enrolment) add("school", "School", enrolment.schoolName, "household");
    if (enrolment?.grade) add("grade", "Class", enrolment.grade, "household");
  }
  add("location", "Location", record.location);
  if (record.amount !== null) add("amount", "Amount", money(record.amount, record.currency));
  add("payee", "Payee", record.payee);
  if (record.quantity !== null) add("quantity", "Quantity", `${record.quantity}${record.unit ? ` ${record.unit}` : ""}`);
  add("subject", "Subject", record.subject);
  add("notes", "Notes", record.notes);
  return fields;
}

/**
 * Records of the same thing on several days in one document — "Rehearsals on
 * 8, 10 and 13 October". Each is its own occurrence: a record on file for
 * one of those days is that one, never a reason to move it to another.
 */
function seriesKeys(records: readonly DocumentRecord[]): Set<string> {
  const name = (title: string) => [...new Set(tokens(title))].sort().join(" ");
  const keys = new Set<string>();
  for (const record of records) {
    const siblings = records.filter(
      (other) => other.key !== record.key && other.domain === record.domain && other.date && record.date && other.date !== record.date && name(other.title) === name(record.title),
    );
    if (siblings.length > 0) keys.add(record.key);
  }
  return keys;
}

/**
 * A bill already on file for the same amount on the same day, whose name
 * shares a word with this one ("Parent contribution" and "School
 * contribution", ₹500 due 5 Oct): the same payment, however the notice
 * names it. Only an exact amount and an exact day count.
 */
function sameBill(record: DocumentRecord, context: PlanContext): { id: string; title: string; date: string | null } | null {
  if (record.domain !== "bill" || record.amount === null || !record.date) return null;
  const minor = Math.round(record.amount * 100);
  const match = (context.obligations ?? []).find(
    (bill) => bill.status !== "cancelled" && bill.amountMinor === minor && bill.dueOn === record.date && tokens(bill.name).some((word) => tokens(record.title).includes(word)),
  );
  return match ? { id: match.id, title: match.name, date: match.dueOn } : null;
}

type Draft = Omit<PlanEntry, "group" | "included">;

function finish(draft: Draft): PlanEntry {
  const included = draft.action === "create" || draft.action === "update" || draft.action === "cancel";
  return { ...draft, group: GROUP_FOR[draft.action], included };
}

function joinOr(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

export function buildDocumentPlan(reading: DocumentReading, context: PlanContext, options: PlanOptions): DocumentPlan {
  const now = options.now ?? new Date();
  // Newer record wins (§28): the document's own date is when it was
  // written; failing that, when it arrived.
  const capturedAt = reading.issuedOn ? `${reading.issuedOn}T00:00:00Z` : (options.receivedAt ?? now.toISOString());
  const memberNames = new Map(options.people.filter((item) => item.entityType === "member").map((item) => [item.entityId, String(item.attributes.displayName)]));
  const series = seriesKeys(reading.records);

  const drafts: (Draft & { strength: number })[] = [];
  for (const record of reading.records) {
    // Who it is for — the same Wave 1 resolver, one record at a time. A
    // school item is always someone's; a bill or a thing to buy is the
    // household's.
    let person: IntakePerson | null = null;
    let question: PlanEntry["question"] = null;
    if (record.domain === "school_item") {
      const resolved = resolveIntakePeople(
        { kind: "school_item", entities: [], references: record.person ? [{ text: record.person, candidates: [], confidence: 0 }] : [] },
        options.people,
        { viewerMemberId: options.viewerMemberId },
      ).subject;
      const answered = options.answers?.[record.key];
      const chosen = answered ? resolved.candidates.find((candidate) => candidate.memberId === answered) : undefined;
      person = chosen ?? resolved.selected;
      if (!person) {
        const choices = resolved.candidates;
        question = {
          text: resolved.unknown && resolved.said
            ? `${resolved.said} isn't one of your children on record — who is the ${record.title} for?`
            : choices.length > 0
              ? `Who is the ${record.title} for — ${joinOr(choices.map((candidate) => candidate.displayName))}?`
              : `Who is the ${record.title} for? Add the child in Family first.`,
          options: choices,
        };
      }
    }

    const base = { key: record.key, domain: record.domain, title: record.title, record, evidence: record.evidence, person, question, fields: fieldsFor(record, person, context), changes: [] as PlanFieldChange[] };

    if (question) {
      drafts.push({ ...base, action: "needs_answer", reason: question.text, existing: null, strength: 0 });
      continue;
    }

    const candidate: HomeSendCandidate = {
      kind: record.domain,
      title: record.title,
      date: record.date,
      amount: record.amount,
      payee: record.payee,
      subjectMemberId: person?.memberId ?? null,
      capturedAt,
      change: record.change,
    };
    const reconciliation: HomeSendReconciliation | null = reconcileAgainstRecords(context, options.householdId, candidate, { timezone: options.timezone, now, memberNames });
    const existing = reconciliation ? { id: reconciliation.existingId, title: reconciliation.existing.title, date: reconciliation.existing.date } : null;

    if (!reconciliation) {
      const bill = sameBill(record, context);
      if (bill) {
        drafts.push({ ...base, action: "no_change", reason: `Already on record as ${bill.title}${bill.date ? `, due ${shortDate(bill.date)}` : ""}.`, existing: bill, strength: 5 });
      } else {
        drafts.push({ ...base, action: "create", reason: `New — nothing like it is on record.`, existing: null, strength: 0 });
      }
      continue;
    }

    const { proposal } = reconciliation;
    if (proposal.type === "conflict") {
      drafts.push({
        ...base,
        action: "conflict",
        reason: `The document says ${shortDate(record.date) ?? "otherwise"}, but ${existing!.title} was changed after it was written${existing!.date ? ` — ${shortDate(existing!.date)}` : ""}. The record stands.`,
        existing,
        strength: 4,
      });
      continue;
    }
    if (proposal.type === "cancellation") {
      drafts.push({ ...base, action: "cancel", reason: `The document says ${existing!.title} is cancelled.`, existing, strength: 3 });
      continue;
    }
    if (proposal.type === "update") {
      // One of several days of the same thing is a new occurrence, unless
      // the document itself says something moved (§20, multiple occurrences).
      if (series.has(record.key) && record.change !== "update") {
        drafts.push({ ...base, action: "create", reason: `New — another ${record.title} on a different day.`, existing: null, strength: 0 });
        continue;
      }
      const changes: PlanFieldChange[] = proposal.changes.map((change) =>
        change.field === "date"
          ? { field: "date", label: record.domain === "bill" ? "Due date" : "Date", before: shortDate(change.from as string | null), after: shortDate(String(change.to)) ?? String(change.to) }
          : {
              field: "amount",
              label: "Amount",
              before: change.from === null ? null : money(Number(change.from) / 100, record.currency),
              after: money(Number(change.to) / 100, record.currency),
            },
      );
      drafts.push({
        ...base,
        action: "update",
        reason: `${existing!.title} on record changes: ${changes.map((change) => `${change.before ?? "—"} → ${change.after}`).join(", ")}.`,
        existing,
        changes,
        strength: 3,
      });
      continue;
    }
    // Already on record: the same thing, with nothing new to say.
    drafts.push({ ...base, action: "no_change", reason: `Already on record${existing?.date ? ` for ${shortDate(existing.date)}` : ""} — nothing new.`, existing, strength: 5 });
  }

  // One record on file answers for one thing in the document (§20): the
  // strongest claim on it keeps it — a record that already is that day's
  // rehearsal is never also moved to be another day's.
  const claimed = new Map<string, number>();
  const order = drafts.map((draft, index) => ({ draft, index })).sort((a, b) => b.draft.strength - a.draft.strength);
  const entries: PlanEntry[] = new Array(drafts.length);
  for (const { draft, index } of order) {
    const { strength: _strength, ...rest } = draft;
    const target = rest.existing?.id;
    if (target && claimed.has(target) && (rest.action === "update" || rest.action === "cancel")) {
      entries[index] = finish({ ...rest, action: "create", existing: null, changes: [], reason: `New — another ${rest.title}.` });
      continue;
    }
    if (target && (rest.action === "update" || rest.action === "cancel" || rest.action === "no_change")) claimed.set(target, index);
    entries[index] = finish(rest);
  }

  const counts = Object.fromEntries(PLAN_GROUPS.map((group) => [group, entries.filter((entry) => entry.group === group).length])) as Record<PlanGroup, number>;
  return {
    version: 1,
    pages: reading.pages,
    issuedOn: reading.issuedOn,
    entries,
    counts,
    changeCount: entries.filter((entry) => entry.included).length,
  };
}

/** "I found 5 relevant items" — then what each group holds, in words (§22–23, §32). */
export function planSummary(plan: DocumentPlan): string {
  const total = plan.entries.length;
  if (total === 0) return "Nothing in it needs anything from your household.";
  const parts = [
    plan.counts.updates ? `${plan.counts.updates} to update` : null,
    plan.counts.new ? `${plan.counts.new} new` : null,
    plan.counts.already_on_record ? `${plan.counts.already_on_record} already on record` : null,
    plan.counts.conflicts ? `${plan.counts.conflicts} where your record is newer` : null,
    plan.counts.needs_answer ? `${plan.counts.needs_answer} I need you to answer` : null,
  ].filter((part): part is string => Boolean(part));
  return `I found ${total} relevant ${total === 1 ? "item" : "items"}: ${parts.join(", ")}.`;
}

/** The apply button's own words: "Apply 3 changes", or that there is nothing to change (§27). */
export function applyLabel(plan: Pick<DocumentPlan, "entries">, included: ReadonlySet<string> = new Set(plan.entries.filter((entry) => entry.included).map((entry) => entry.key))): string {
  const count = plan.entries.filter((entry) => included.has(entry.key) && (entry.action === "create" || entry.action === "update" || entry.action === "cancel")).length;
  return count === 0 ? "Nothing to change" : `Apply ${count} ${count === 1 ? "change" : "changes"}`;
}

