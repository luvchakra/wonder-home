import type { SupabaseClient } from "@supabase/supabase-js";

import { auditChange } from "../api/audit";
import type { NeedsYouItem } from "./needs-you";
import { applyNeedsYouAnswer } from "./needs-you-answer";
import { askNeedsYou, needsYouReady } from "./needs-you-repository";
import { loadNothingWaits } from "../household/nothing-waits-repository";
import { sweepNotices } from "../notifications/notices-sweep";
import { localMoment } from "../notifications/timing";
import { log } from "../observability/logger";
import { checkQuestion, endingFor, resendQuestion, waitingQuestion, type Ending, type HomeSendQuestion } from "../homesend/deadlines";
import type { HomeSendFailureReason, HomeSendKind, HomeSendStatus } from "../homesend/items";
import { enqueueClassifyRetry, enqueueReread } from "../homesend/retry-queue";

/**
 * "Nothing waits", run (the owner, 2026-11-14; decision 4). A background step
 * on the jobs runner (`clock.homesend-deadlines`: the GitHub clock every ten
 * minutes, the Vercel delivery tick taking it back when its heartbeat goes
 * stale; docs/background-jobs.md). Each pass:
 *
 *   1. applies every due default (`needs_you_items.default_at` passed),
 *      through the same answer a person's tap gives (`applyNeedsYouAnswer`),
 *      audited `needs_you.defaulted`; anything still open at `expires_at` is
 *      closed `expired` — nothing stays in "Needs you" past 48 hours;
 *   2. closes HomeTalk proposals still waiting after 48 hours as not done
 *      (never approved);
 *   3. makes every waiting or failed HomeSend item end as something
 *      (`deadlines.ts` `endingFor`): set aside with its reason, kept as a
 *      household note, read again once, or asked about once, with a default;
 *   4. asks one "Looks right?" for every entry still Checking.
 *
 * Idempotent: one open question per thing per source, and every write is a
 * compare-and-swap on what was read. Bounded per call. Never throws for one
 * household. Questions are asked from when the thing was sent, so the first
 * pass after this shipped settled what was already older than a day (the
 * one-time pass, with an audit row each and Undo or Restore for all of it).
 */

type Row = Record<string, unknown>;

/** Due defaults applied per call. */
const DEFAULTS_PER_RUN = 200;
/** Items read per household per call. */
const ITEMS_PER_HOUSEHOLD = 300;

export type DeadlinesResult = {
  ready: boolean;
  defaulted: number;
  expired: number;
  proposalsClosed: number;
  setAside: number;
  notes: number;
  readAgain: number;
  asked: number;
  households: number;
};

export type DeadlinesOptions = { now?: Date; limit?: number; householdIds?: readonly string[]; sweep?: boolean };

const EMPTY: DeadlinesResult = { ready: false, defaulted: 0, expired: 0, proposalsClosed: 0, setAside: 0, notes: 0, readAgain: 0, asked: 0, households: 0 };

export async function runNeedsYouDeadlines(admin: SupabaseClient, options: DeadlinesOptions = {}): Promise<DeadlinesResult> {
  const now = options.now ?? new Date();
  if (!(await needsYouReady(admin))) return EMPTY;
  const result: DeadlinesResult = { ...EMPTY, ready: true };
  const touched = new Set<string>();

  // 1–2. Due defaults and the 48-hour close, across households.
  await applyDueDefaults(admin, now, result, touched, options.householdIds);
  result.proposalsClosed = await closeStaleProposals(admin, now, options.householdIds);

  // 3–4. Every waiting item ends as something; every Checking entry is asked about once.
  const ids = options.householdIds ? [...options.householdIds] : await candidateHouseholds(admin);
  for (const householdId of ids.slice(0, Math.max(1, options.limit ?? 25))) {
    try {
      const changed = await endHouseholdItems(admin, householdId, now, result);
      if (changed) touched.add(householdId);
      result.households += 1;
    } catch (thrown) {
      log.warn("needs-you deadlines failed for a household", { reason: thrown instanceof Error ? thrown.message.slice(0, 80) : "unknown" });
    }
  }
  // A question asked now is due 24 hours after the thing was sent: an old one is settled in the same pass.
  if (result.asked > 0) await applyDueDefaults(admin, now, result, touched, options.householdIds);

  if (options.sweep !== false) for (const householdId of touched) await sweepNotices(admin, householdId, now).catch(() => undefined);
  return result;
}

const NEEDS_COLUMNS = "id, household_id, source, subject_table, subject_id, recipient_member_id, prompt, answers, default_answer, default_at, expires_at, consequence, due_on, created_at";

function needsFromRow(row: Row): NeedsYouItem {
  return {
    id: row.id as string,
    householdId: row.household_id as string,
    source: row.source as string,
    subjectTable: row.subject_table as string,
    subjectId: row.subject_id as string,
    recipientMemberId: (row.recipient_member_id as string | null) ?? null,
    prompt: (row.prompt as NeedsYouItem["prompt"]) ?? { code: "unknown" },
    answers: (row.answers as NeedsYouItem["answers"]) ?? [],
    defaultAnswer: row.default_answer as string,
    defaultAt: row.default_at as string,
    expiresAt: row.expires_at as string,
    consequence: Number(row.consequence ?? 0) as NeedsYouItem["consequence"],
    dueOn: (row.due_on as string | null) ?? null,
    createdAt: row.created_at as string,
    answeredInPlace: true,
  };
}

async function applyDueDefaults(admin: SupabaseClient, now: Date, result: DeadlinesResult, touched: Set<string>, householdIds?: readonly string[]): Promise<void> {
  let query = admin.from("needs_you_items").select(NEEDS_COLUMNS).eq("status", "open").lte("default_at", now.toISOString()).order("default_at", { ascending: true }).limit(DEFAULTS_PER_RUN);
  if (householdIds) query = query.in("household_id", [...householdIds]);
  const { data, error } = await query;
  if (error) return;
  // An Admin may switch decision 4 back: then nothing is applied, and a question closes at 48 hours with nothing done.
  const switches = new Map<string, Promise<boolean | null>>();
  const appliesDefaults = (householdId: string) => {
    if (!switches.has(householdId)) switches.set(householdId, loadNothingWaits(admin, householdId).then((value) => value.applyDefaults));
    return switches.get(householdId)!;
  };
  for (const item of ((data ?? []) as Row[]).map(needsFromRow)) {
    let outcome: Awaited<ReturnType<typeof applyNeedsYouAnswer>> | "off";
    const allowed = await appliesDefaults(item.householdId);
    // Not readable this pass: the careful answer is to apply nothing now.
    if (allowed === null) continue;
    if (allowed === false) outcome = "off";
    else {
      try {
        outcome = await applyNeedsYouAnswer(admin, item, item.defaultAnswer, { byDefault: true, actor: { householdId: item.householdId, memberId: null }, now });
      } catch {
        outcome = "unhandled";
      }
    }
    let status: "defaulted" | "withdrawn" | "expired" | null;
    if (outcome === "done") status = "defaulted";
    else if (outcome === "settled" || outcome === "undo") status = "withdrawn";
    // Switched off, or a part's own source with no handler here: closed at 48 hours, never left open.
    else status = Date.parse(item.expiresAt) <= now.getTime() ? "expired" : null;
    if (!status) continue;
    const { data: closed } = await admin
      .from("needs_you_items")
      .update({ status, answer: status === "defaulted" ? item.defaultAnswer : null, resolved_at: now.toISOString() })
      .eq("id", item.id)
      .eq("status", "open")
      .select("id");
    if ((closed ?? []).length === 0) continue;
    touched.add(item.householdId);
    if (status === "defaulted") {
      result.defaulted += 1;
      await auditChange({
        householdId: item.householdId,
        eventType: "needs_you.defaulted",
        targetTable: item.subjectTable,
        targetId: item.subjectId,
        metadata: { source: item.source, answer: item.defaultAnswer, question: item.id },
      });
    } else if (status === "expired") result.expired += 1;
  }
}

/** HomeTalk proposals waiting for a yes for 48 hours close as not done; never approved by waiting. */
async function closeStaleProposals(admin: SupabaseClient, now: Date, householdIds?: readonly string[]): Promise<number> {
  const before = new Date(now.getTime() - 48 * 3_600_000).toISOString();
  let query = admin.from("conversation_actions").update({ approval_status: "expired" }).eq("approval_status", "proposed").lt("created_at", before);
  if (householdIds) query = query.in("household_id", [...householdIds]);
  const { data, error } = await query.select("id");
  return error ? 0 : (data ?? []).length;
}

async function candidateHouseholds(admin: SupabaseClient): Promise<string[]> {
  const [waiting, checking] = await Promise.all([
    admin.from("home_send_items").select("household_id").in("status", ["received", "classified", "failed"]).order("updated_at", { ascending: true }).limit(2000),
    admin.from("homesend_changes").select("household_id").eq("confirmation_state", "unconfirmed").is("undone_at", null).limit(2000),
  ]);
  return [...new Set([...((waiting.data ?? []) as Row[]), ...((checking.data ?? []) as Row[])].map((row) => row.household_id as string))];
}

const ITEM_COLUMNS =
  "id, status, classified_kind, raw_text, file_path, source_url, failure_reason, retry_count, retry_requested_at, created_by_member_id, created_at, updated_at, title:extracted->>title, due:extracted->>dueDate, document_date:extracted->>documentDate, readable:understanding->readable";

/** What a domain table's entry is, for its question's words and ranking. */
const DOMAIN_KIND: Record<string, string> = {
  bill: "bill",
  purchase: "purchase",
  health_document: "health_document",
  grocery_item: "grocery_item",
  school_item: "school_item",
  activity_item: "activity_item",
  activity: "activity_item",
  event: "event",
};

async function endHouseholdItems(admin: SupabaseClient, householdId: string, now: Date, result: DeadlinesResult): Promise<boolean> {
  const [household, members, waiting, unconfirmed] = await Promise.all([
    admin.from("households").select("timezone").eq("id", householdId).maybeSingle(),
    admin.from("household_members").select("id, member_type, status, profile_id").eq("household_id", householdId).limit(200),
    admin.from("home_send_items").select(ITEM_COLUMNS).eq("household_id", householdId).in("status", ["received", "classified", "failed"]).order("created_at", { ascending: true }).limit(ITEMS_PER_HOUSEHOLD),
    admin.from("homesend_changes").select("intake_id, domain, created_at").eq("household_id", householdId).eq("confirmation_state", "unconfirmed").is("undone_at", null).order("created_at", { ascending: true }).limit(ITEMS_PER_HOUSEHOLD),
  ]);
  if (waiting.error) throw new Error(`deadlines read failed: ${waiting.error.code ?? "unknown"}`);
  const timeZone = ((household.data?.timezone as string | null) || "UTC") as string;
  const today = localMoment(now, timeZone).dateKey;
  // Who may be asked by name: an active adult with an account. Anyone else's question goes to the Admins.
  const adults = new Set(((members.data ?? []) as Row[]).filter((row) => row.member_type === "adult" && row.status === "active" && row.profile_id).map((row) => row.id as string));
  const askable = (memberId: string | null) => (memberId && adults.has(memberId) ? memberId : null);

  const waitingRows = (waiting.data ?? []) as Row[];
  const checkRows = (unconfirmed.data ?? []) as Row[];
  const subjects = [...new Set([...waitingRows.map((row) => row.id as string), ...checkRows.map((row) => row.intake_id as string)])];
  const asked = new Map<string, Set<string>>();
  for (let start = 0; start < subjects.length; start += 200) {
    const { data } = await admin.from("needs_you_items").select("source, subject_id").eq("household_id", householdId).in("subject_id", subjects.slice(start, start + 200)).limit(1000);
    for (const row of (data ?? []) as Row[]) asked.set(row.subject_id as string, new Set([...(asked.get(row.subject_id as string) ?? []), row.source as string]));
  }
  let changed = false;

  // A question whose thing was settled elsewhere (confirmed by an edit or "Mark paid", added, removed) is withdrawn.
  const stillWaiting = new Set(waitingRows.map((row) => row.id as string));
  const stillChecking = new Set(checkRows.map((row) => row.intake_id as string));
  const { data: openRows } = await admin.from("needs_you_items").select("id, source, subject_id").eq("household_id", householdId).eq("status", "open").in("source", ["homesend_check", "homesend_waiting", "homesend_resend"]).limit(500);
  const settled = ((openRows ?? []) as Row[]).filter((row) => (row.source === "homesend_check" ? !stillChecking.has(row.subject_id as string) : !stillWaiting.has(row.subject_id as string)));
  if (settled.length > 0) {
    const { data: withdrawn } = await admin.from("needs_you_items").update({ status: "withdrawn", resolved_at: now.toISOString() }).in("id", settled.map((row) => row.id as string)).eq("status", "open").select("id");
    if ((withdrawn ?? []).length > 0) changed = true;
  }

  for (const row of waitingRows) {
    const id = row.id as string;
    const ending: Ending = endingFor({
      status: row.status as HomeSendStatus,
      kind: (row.classified_kind as HomeSendKind | null) ?? null,
      readable: typeof row.readable === "boolean" ? row.readable : null,
      failureReason: (row.failure_reason as HomeSendFailureReason | null) ?? null,
      rawText: (row.raw_text as string | null) ?? null,
      retryCount: Number(row.retry_count ?? 0) || 0,
      retryRequestedAt: (row.retry_requested_at as string | null) ?? null,
      canReadAgain: Boolean(row.raw_text || row.file_path || row.source_url),
      senderMemberId: askable((row.created_by_member_id as string | null) ?? null),
      asked: asked.get(id) ?? new Set(),
      minutesSinceTouched: Math.floor((now.getTime() - Date.parse(row.updated_at as string)) / 60_000),
    });
    const title = (row.title as string | null) ?? null;
    if (ending.action === "set_aside" || ending.action === "note") {
      const reason = ending.action === "note" ? "kept_as_note" : ending.reason;
      if (await archive(admin, householdId, row, reason, now)) {
        changed = true;
        if (ending.action === "note") result.notes += 1;
        else result.setAside += 1;
      }
    } else if (ending.action === "read_again") {
      if (await readAgain(admin, householdId, row, now)) {
        result.readAgain += 1;
        changed = true;
      }
    } else if (ending.action === "ask_resend" || ending.action === "ask") {
      const question = ending.action === "ask_resend"
        ? resendQuestion({ title })
        : waitingQuestion({ kind: (row.classified_kind as HomeSendKind | null) ?? null, title, dueOn: dayOf(row.due ?? row.document_date), today, duplicate: false });
      const recipient = ending.action === "ask_resend" ? askable((row.created_by_member_id as string | null) ?? null) : askable((row.created_by_member_id as string | null) ?? null);
      if (await ask(admin, householdId, id, "home_send_items", question, recipient, new Date(row.created_at as string))) {
        result.asked += 1;
        changed = true;
      }
    }
  }

  // Each entry still Checking: one "Looks right?", asked from when it was added.
  const byIntake = new Map<string, Row>();
  for (const row of checkRows) if (!byIntake.has(row.intake_id as string)) byIntake.set(row.intake_id as string, row);
  const intakeIds = [...byIntake.keys()].filter((id) => !(asked.get(id)?.has("homesend_check")));
  if (intakeIds.length > 0) {
    const { data } = await admin.from("home_send_items").select("id, created_by_member_id, title:extracted->>title, due:extracted->>dueDate, document_date:extracted->>documentDate").eq("household_id", householdId).in("id", intakeIds.slice(0, 200));
    for (const item of (data ?? []) as Row[]) {
      const change = byIntake.get(item.id as string)!;
      const question = checkQuestion({ kind: DOMAIN_KIND[change.domain as string] ?? (change.domain as string), title: (item.title as string | null) ?? null, dueOn: dayOf(item.due ?? item.document_date), today });
      if (await ask(admin, householdId, item.id as string, "home_send_items", question, askable((item.created_by_member_id as string | null) ?? null), new Date(change.created_at as string))) {
        result.asked += 1;
        changed = true;
      }
    }
  }
  return changed;
}

function dayOf(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}

async function ask(admin: SupabaseClient, householdId: string, subjectId: string, subjectTable: string, question: HomeSendQuestion, recipientMemberId: string | null, askedAt: Date): Promise<boolean> {
  try {
    const id = await askNeedsYou(admin, {
      householdId,
      source: question.source,
      subjectTable,
      subjectId,
      recipientMemberId,
      prompt: question.prompt,
      answers: question.answers,
      defaultAnswer: question.defaultAnswer,
      consequence: question.consequence,
      dueOn: question.dueOn,
      askedAt,
    });
    return id !== null;
  } catch {
    return false;
  }
}

async function archive(admin: SupabaseClient, householdId: string, row: Row, reason: "not_household" | "unreadable" | "kept_as_note", now: Date): Promise<boolean> {
  const { data, error } = await admin
    .from("home_send_items")
    .update({ status: "archived", archived_from: row.status, archived_at: now.toISOString(), archive_reason: reason, retry_requested_at: null })
    .eq("household_id", householdId)
    .eq("id", row.id as string)
    .eq("status", row.status as string)
    .eq("updated_at", row.updated_at as string)
    .select("id");
  if (error || (data ?? []).length === 0) return false;
  await auditChange({
    householdId,
    eventType: "homesend.auto_archived",
    targetTable: "home_send_items",
    targetId: row.id as string,
    metadata: { reason, by: "rule", from: row.status },
  });
  return true;
}

/** Read once more, another way: a failed item through the read-again queue, an unread one through the classify retry. */
async function readAgain(admin: SupabaseClient, householdId: string, row: Row, now: Date): Promise<boolean> {
  const failed = row.status === "failed";
  const { data, error } = await admin
    .from("home_send_items")
    .update(failed ? { retry_count: 1, retry_requested_at: now.toISOString() } : { retry_count: 1 })
    .eq("household_id", householdId)
    .eq("id", row.id as string)
    .eq("status", row.status as string)
    .eq("retry_count", 0)
    .select("id");
  if (error || (data ?? []).length === 0) return false;
  try {
    if (failed) await enqueueReread(admin, { householdId, itemId: row.id as string, now });
    else await enqueueClassifyRetry(admin, { householdId, itemId: row.id as string, now });
  } catch {
    // Couldn't queue it: the count is kept and the hold lifted, so the next pass asks the sender instead.
    if (failed) await admin.from("home_send_items").update({ retry_requested_at: null }).eq("household_id", householdId).eq("id", row.id as string);
  }
  await auditChange({ householdId, eventType: "homesend.retry_requested", targetTable: "home_send_items", targetId: row.id as string, metadata: { attempt: 1, by: "rule" } });
  return true;
}
