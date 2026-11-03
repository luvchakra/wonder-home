import type { SupabaseClient } from "@supabase/supabase-js";

import { auditChange } from "../api/audit";
import { readHouseholdKey } from "../ai/credentials";
import { platformKey, resolveModelKey } from "../ai/model-key";
import { routeToProvider } from "../ai/privacy";
import { loadDataUse } from "../ai/privacy-repository";
import { withoutNames } from "../homebrain/sleep/embeddings";
import { loadHomeSendTidy } from "../household/homesend-tidy-repository";
import { listMembers } from "../identity/households";
import { sweepNotices } from "../notifications/notices-sweep";
import { localMoment, shiftDate } from "../notifications/timing";
import { log } from "../observability/logger";
import type { HomeSendExtraction, HomeSendFailureReason, HomeSendKind, HomeSendStatus } from "./items";
import { reconcileHomeSend, type HomeSendCandidate, type HomeSendReconciliation, type ReconcilableDomain } from "./reconcile";
import {
  AI_ITEMS_PER_RUN,
  checkVerdict,
  decideByRules,
  isPastWithGrace,
  itemDays,
  MONEY_OR_HEALTH,
  newerFromSameSender,
  tidyFacts,
  type TidiedEntry,
  type TidyDecision,
  type TidyItem,
} from "./tidy";
import { createTidyJudge, type TidyJudge, type TidyQuestion } from "./tidy-model";
import type { IntakeUnderstanding } from "./understanding";

/**
 * HomeSend's daily tidy, run (the owner, 2026-11-03). The rules and the check
 * on the model's verdict are in `tidy.ts`; this reads, archives and records.
 *
 * Once a day per household, on its own calendar, from 04:00 local: the
 * delivery clock (`/api/v1/notifications/dispatch`) calls `runHomeSendTidy`
 * after its response, a few households a tick. The day is claimed first (one
 * `homesend_tidy_runs` row per household per day), so two workers, or a
 * re-run, never tidy twice. Each archive is a compare-and-swap on the item's
 * `updated_at`: anything a person touched since it was read stays as it is.
 * Each archive is audited `homesend.auto_archived` with its reason and
 * whether a rule or a checked AI verdict decided. Then the household's notices
 * are swept, so the grouped HomeSend reminder carries the day's one line.
 */

type Row = Record<string, unknown>;

/** The tidy starts after this local hour, before most mornings begin. */
export const TIDY_LOCAL_HOUR = 4;
/** Items read per household per run (every list has a bound). */
const ITEMS_PER_HOUSEHOLD = 300;
/** Items checked against the records per run: each reads one part of the home. */
const RECONCILE_PER_RUN = 40;

const RECONCILABLE: Partial<Record<HomeSendKind, ReconcilableDomain>> = {
  bill: "bill",
  school_item: "school_item",
  activity_item: "activity_item",
  event: "event",
  grocery_item: "grocery_item",
  health_document: "health_document",
};

export type HouseholdTidy = {
  householdId: string;
  state: "done" | "off" | "failed" | "skipped";
  archived: TidiedEntry[];
  kept: number;
  aiAsked: number;
};

export type TidyRunResult = {
  /** False before the migration: nothing was done. */
  ready: boolean;
  households: HouseholdTidy[];
};

export type TidyOptions = {
  now?: Date;
  /** Households tidied this call (the clock: a few per tick). */
  limit?: number;
  /** Only these households (a one-off run, a test). */
  householdIds?: readonly string[];
  /** Ignore the 04:00 start (a one-off run). The once-a-day claim still holds. */
  anyHour?: boolean;
  /** The model, for a test; absent, each household's own key and data-use policy decide. Null: never ask a model. */
  judgeFor?: (householdId: string) => Promise<TidyJudge | null>;
  /** Sweep notices after a run (default true). */
  sweep?: boolean;
};

/** Whether the tidy's migration is on this database: without `archive_reason` the job does nothing. */
export async function tidyReady(admin: SupabaseClient): Promise<boolean> {
  const { error } = await admin.from("homesend_tidy_runs").select("household_id").limit(1);
  if (error) return false;
  const probe = await admin.from("home_send_items").select("archive_reason").limit(1);
  return !probe.error;
}

/** Households with something the tidy looks at: waiting, failed, or a Checking entry whose questions ended. */
async function candidateHouseholds(admin: SupabaseClient): Promise<string[]> {
  const [waiting, checking] = await Promise.all([
    admin.from("home_send_items").select("household_id").in("status", ["received", "classified", "failed"]).order("updated_at", { ascending: true }).limit(2000),
    admin.from("home_send_items").select("household_id").eq("status", "routed").eq("understanding->checking->>done", "please_check").limit(1000),
  ]);
  return [...new Set([...((waiting.data ?? []) as Row[]), ...((checking.data ?? []) as Row[])].map((row) => row.household_id as string))];
}

/** Which of these households are due now: past 04:00 on their own clock, with no run today. */
async function dueHouseholds(admin: SupabaseClient, ids: readonly string[], now: Date, anyHour: boolean): Promise<{ id: string; timeZone: string; today: string }[]> {
  if (ids.length === 0) return [];
  const out: { id: string; timeZone: string; today: string }[] = [];
  for (let start = 0; start < ids.length; start += 200) {
    const chunk = ids.slice(start, start + 200);
    const utcToday = now.toISOString().slice(0, 10);
    const [households, runs] = await Promise.all([
      admin.from("households").select("id, timezone").in("id", chunk),
      admin.from("homesend_tidy_runs").select("household_id, run_on").in("household_id", chunk).gte("run_on", shiftDate(utcToday, -1)),
    ]);
    if (households.error || runs.error) continue;
    const ran = new Set(((runs.data ?? []) as Row[]).map((row) => `${row.household_id}|${row.run_on}`));
    for (const row of (households.data ?? []) as Row[]) {
      const timeZone = (row.timezone as string | null) || "UTC";
      const local = localMoment(now, timeZone);
      if (!anyHour && local.hour < TIDY_LOCAL_HOUR) continue;
      if (ran.has(`${row.id}|${local.dateKey}`)) continue;
      out.push({ id: row.id as string, timeZone, today: local.dateKey });
    }
  }
  return out;
}

/**
 * The daily tidy for the households due now. Bounded (`limit` households a
 * call), idempotent (one claimed run per household per local day), and never
 * throws: a household that fails is recorded `failed` and the rest go on.
 */
export async function runHomeSendTidy(admin: SupabaseClient, options: TidyOptions = {}): Promise<TidyRunResult> {
  const now = options.now ?? new Date();
  if (!(await tidyReady(admin))) return { ready: false, households: [] };
  const ids = options.householdIds ? [...options.householdIds] : await candidateHouseholds(admin);
  const due = (await dueHouseholds(admin, ids, now, options.anyHour ?? false)).slice(0, Math.max(1, options.limit ?? 5));
  const households: HouseholdTidy[] = [];
  for (const household of due) {
    // Claim the day first: whoever inserts the row tidies; anyone else finds it taken.
    const claim = await admin.from("homesend_tidy_runs").insert({ household_id: household.id, run_on: household.today, state: "running", started_at: now.toISOString() }).select("household_id");
    if (claim.error || (claim.data ?? []).length === 0) {
      households.push({ householdId: household.id, state: "skipped", archived: [], kept: 0, aiAsked: 0 });
      continue;
    }
    let result: HouseholdTidy;
    try {
      result = await tidyHousehold(admin, household, now, options);
    } catch (thrown) {
      log.warn("homesend tidy failed for a household", { reason: thrown instanceof Error ? thrown.name : "unknown" });
      result = { householdId: household.id, state: "failed", archived: [], kept: 0, aiAsked: 0 };
    }
    await admin
      .from("homesend_tidy_runs")
      .update({ state: result.state === "skipped" ? "done" : result.state, archived: result.archived, kept: result.kept, ai_asked: result.aiAsked, finished_at: new Date().toISOString() })
      .eq("household_id", household.id)
      .eq("run_on", household.today);
    // The grouped reminder carries today's line, or drops yesterday's.
    if (options.sweep !== false) await sweepNotices(admin, household.id, now);
    households.push(result);
  }
  return { ready: true, households };
}

const WAITING_COLUMNS =
  "id, status, classified_kind, extracted, created_by_member_id, sender_address, created_at, updated_at, failure_reason, retry_count, retry_requested_at, summary:understanding->>contentSummary, change:understanding->>change, document:understanding->document";
const ROUTED_COLUMNS =
  "id, status, classified_kind, extracted, created_by_member_id, sender_address, created_at, updated_at, failure_reason, retry_count, retry_requested_at, summary:understanding->>contentSummary, change:understanding->>change, document:understanding->document, checking:understanding->checking";

function toItem(row: Row): TidyItem {
  const memberId = (row.created_by_member_id as string | null) ?? null;
  const address = (row.sender_address as string | null) ?? null;
  return {
    id: row.id as string,
    status: row.status as HomeSendStatus,
    kind: (row.classified_kind as HomeSendKind | null) ?? null,
    extracted: (row.extracted as Partial<HomeSendExtraction> | null) ?? null,
    understanding: {
      contentSummary: (row.summary as string | null) ?? "",
      change: ((row.change as string | null) ?? "new") as IntakeUnderstanding["change"],
      document: (row.document as IntakeUnderstanding["document"] | null) ?? undefined,
    },
    sender: memberId ? `member:${memberId}` : address ? `address:${address.toLowerCase()}` : null,
    memberId,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    failureReason: (row.failure_reason as HomeSendFailureReason | null) ?? null,
    retryCount: Number(row.retry_count ?? 0) || 0,
    retryRequestedAt: (row.retry_requested_at as string | null) ?? null,
    checking: row.checking ?? null,
  };
}

async function judgeForHousehold(admin: SupabaseClient, householdId: string): Promise<TidyJudge | null> {
  const [policy, householdKey] = await Promise.all([loadDataUse(admin, householdId), readHouseholdKey(householdId).catch(() => null)]);
  const key = resolveModelKey(householdKey, platformKey());
  const route = routeToProvider({ provider: key.provider, keySource: key.source, policy, hasContent: true });
  return route.ok && key.provider && key.key ? createTidyJudge(key.provider, key.key) : null;
}

/** Whether a reading needs the records looked up: only where "already on record" could change the answer. */
function wantsReconcile(item: TidyItem, today: string): boolean {
  if (item.status !== "received" && item.status !== "classified") return false;
  if (!item.kind || !RECONCILABLE[item.kind] || !item.extracted?.title?.trim()) return false;
  const days = itemDays(item);
  const allPast = days.length > 0 && days.every((day) => isPastWithGrace(day, today));
  // Money and health: only "past AND on record", so only a past one is looked up. Everything else: only when not already past.
  return MONEY_OR_HEALTH.has(item.kind) ? allPast : !allPast;
}

export async function tidyHousehold(
  admin: SupabaseClient,
  household: { id: string; timeZone: string; today: string },
  now: Date,
  options: Pick<TidyOptions, "judgeFor"> = {},
): Promise<HouseholdTidy> {
  const householdId = household.id;
  const switchOn = await loadHomeSendTidy(admin, householdId);
  // Off, or not readable: nothing is tidied today (the careful answer).
  if (switchOn !== true) return { householdId, state: "off", archived: [], kept: 0, aiAsked: 0 };

  const since = new Date(now.getTime() - 60 * 86_400_000).toISOString();
  const [waiting, routed, members] = await Promise.all([
    admin.from("home_send_items").select(WAITING_COLUMNS).eq("household_id", householdId).in("status", ["received", "classified", "failed"]).order("created_at", { ascending: false }).limit(ITEMS_PER_HOUSEHOLD),
    // Recently added items: newer ones a waiting item may be superseded by, and Checking entries whose questions ended.
    admin.from("home_send_items").select(ROUTED_COLUMNS).eq("household_id", householdId).eq("status", "routed").gte("created_at", since).order("created_at", { ascending: false }).limit(ITEMS_PER_HOUSEHOLD),
    // Names are taken out of what the model is shown.
    listMembers(admin, householdId, null).catch(() => []),
  ]);
  if (waiting.error) throw new Error(`tidy read failed: ${waiting.error.code ?? "unknown"}`);
  const waitingItems = ((waiting.data ?? []) as Row[]).map(toItem);
  const routedItems = ((routed.data ?? []) as Row[]).map(toItem);

  // A routed item is in scope only while the entry it added is still Checking.
  const ended = routedItems.filter((item) => (item.checking as { done?: unknown } | null)?.done === "please_check");
  if (ended.length > 0) {
    const { data, error } = await admin
      .from("homesend_changes")
      .select("intake_id")
      .eq("household_id", householdId)
      .in("intake_id", ended.map((item) => item.id))
      .eq("confirmation_state", "unconfirmed")
      .is("undone_at", null);
    const unconfirmed = new Set(error ? [] : ((data ?? []) as Row[]).map((row) => row.intake_id as string));
    for (const item of ended) item.unconfirmed = unconfirmed.has(item.id);
  }

  const all = [...waitingItems, ...routedItems];
  const scope = [...waitingItems, ...ended.filter((item) => item.unconfirmed)];

  // What is already on record, for the few that need it.
  const reconciliations = new Map<string, HomeSendReconciliation | null>();
  let looked = 0;
  for (const item of scope) {
    if (looked >= RECONCILE_PER_RUN || !wantsReconcile(item, household.today)) continue;
    looked += 1;
    const candidate: HomeSendCandidate = {
      kind: RECONCILABLE[item.kind!]!,
      title: item.extracted!.title!,
      date: item.extracted?.dueDate ?? item.extracted?.documentDate ?? null,
      amount: item.extracted?.amount ?? null,
      payee: item.extracted?.payee ?? null,
      subjectMemberId: null,
      capturedAt: item.createdAt,
      change: item.understanding?.change ?? "new",
    };
    try {
      reconciliations.set(item.id, await reconcileHomeSend(admin, householdId, candidate, { timezone: household.timeZone, now, strict: true }));
    } catch {
      // Not able to check is never "on record": the item stays.
    }
  }

  const decisions = new Map<string, TidyDecision>();
  for (const item of scope) {
    decisions.set(item.id, decideByRules(item, { today: household.today, timeZone: household.timeZone, now, reconciliation: reconciliations.get(item.id), others: all }));
  }

  // The model, only for what the rules could not settle, and only where the household's key and policy allow it.
  const askable = scope.filter((item) => {
    const decision = decisions.get(item.id)!;
    return decision.action === "keep" && decision.askAi;
  }).slice(0, AI_ITEMS_PER_RUN);
  let aiAsked = 0;
  if (askable.length > 0) {
    const judge = options.judgeFor ? await options.judgeFor(householdId) : await judgeForHousehold(admin, householdId).catch(() => null);
    if (judge) {
      const names = members.flatMap((member) => [member.nickname, member.displayName]).filter((name): name is string => typeof name === "string" && name.trim().length > 1);
      const scrub = (text: string) => withoutNames(text, names);
      const questions: (TidyQuestion & { item: TidyItem; newerLabels: Map<string, string> })[] = askable.map((item, index) => {
        const newer = newerFromSameSender(item, all).slice(0, 3);
        const newerLabels = new Map(newer.map((other, n) => [`N${index + 1}.${n + 1}`, other.id]));
        return {
          label: `T${index + 1}`,
          kind: item.kind ?? "unknown",
          facts: tidyFacts(item, scrub),
          newer: newer.map((other, n) => ({ label: `N${index + 1}.${n + 1}`, facts: tidyFacts(other, scrub).filter((fact) => fact.id !== "sent") })),
          item,
          newerLabels,
        };
      });
      aiAsked = questions.length;
      const verdicts = await judge.judge(household.today, questions);
      for (const question of questions) {
        const verdict = verdicts.get(question.label);
        if (!verdict) {
          decisions.set(question.item.id, { action: "keep", why: "ai_unavailable", askAi: false });
          continue;
        }
        const checked = checkVerdict(verdict, question.item, { today: household.today, facts: question.facts, newerLabels: question.newerLabels, reconciliation: reconciliations.get(question.item.id) ?? null });
        decisions.set(question.item.id, checked.ok ? { action: "archive", reason: checked.reason, by: "ai", evidence: checked.evidence } : { action: "keep", why: checked.why === "kept" ? "ai_kept" : "ai_unchecked", askAi: false });
      }
    }
  }

  // Archive, each a compare-and-swap on what was read.
  const archived: TidiedEntry[] = [];
  for (const item of scope) {
    const decision = decisions.get(item.id)!;
    if (decision.action !== "archive") continue;
    const { data, error } = await admin
      .from("home_send_items")
      .update({ status: "archived", archived_from: item.status, archived_at: now.toISOString(), archive_reason: decision.reason, retry_requested_at: null })
      .eq("household_id", householdId)
      .eq("id", item.id)
      .eq("status", item.status)
      .eq("updated_at", item.updatedAt)
      .select("id");
    if (error || (data ?? []).length === 0) continue;
    archived.push({ id: item.id, reason: decision.reason, by: decision.by, memberId: item.memberId ?? null });
    await auditChange({
      householdId,
      eventType: "homesend.auto_archived",
      targetTable: "home_send_items",
      targetId: item.id,
      metadata: { reason: decision.reason, by: decision.by, from: item.status, evidence: decision.evidence.map((entry) => entry.field) },
    });
  }
  return { householdId, state: "done", archived, kept: scope.length - archived.length, aiAsked };
}
