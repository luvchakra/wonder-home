import type { SupabaseClient } from "@supabase/supabase-js";

import type { HomeSendExtraction } from "../homesend/items";
import { log } from "../observability/logger";
import { refreshKindBars } from "./kind-bar-repository";
import { kindOfDomain } from "./kind-bar";
import { normalizeWords } from "./rules";
import { listHouseholdRules } from "./rules-repository";
import { planVerification, type Conflict, type SourceItem, type VerifyEntry } from "./verify-night";

/**
 * Runs the nightly check (`verify-night.ts`) for one household inside the
 * HomeBrain sleep job, with the service role: refreshes each kind's bar,
 * confirms the Checking entries evidence supports, and hands real conflicts
 * to the household's "Needs you" list (`NeedsSink`, part A's list).
 *
 * Never throws: a night that can't check simply checks the next night.
 */

/** Where conflicts go: the one "Needs you" list. Injected so the sleep job and tests choose. */
export type NeedsSink = {
  /** Change ids already raised by HomeBrain, so nothing is asked twice. */
  alreadyRaised(admin: SupabaseClient, householdId: string, entries: readonly { changeId: string; itemId: string }[]): Promise<Set<string>>;
  raise(admin: SupabaseClient, householdId: string, conflict: Conflict, now: Date): Promise<boolean>;
};

export type VerifyCounts = { checked: number; confirmed: number; conflicts: number; raised: number; bars: number };

const HISTORY_DAYS = 180;
const SOURCE_DAYS = 30;

type ChangeRow = { id: string; intake_id: string; domain: string; created_at: string; confirmation_state?: string | null; created_by_member_id: string | null };
type ItemRow = { id: string; classified_kind: string | null; extracted: HomeSendExtraction | null; sender_address: string | null; content_hash: string | null; created_by_member_id: string | null; created_at: string };

function chunks<T>(values: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < values.length; index += size) out.push(values.slice(index, index + size));
  return out;
}

function memberByName(names: Map<string, string>, said: string | null | undefined): string | null {
  const word = normalizeWords(said)?.split(" ")[0];
  if (!word) return null;
  const found = [...names.entries()].filter(([, name]) => name.toLowerCase() === word);
  return found.length === 1 ? found[0]![0] : null;
}

export async function verifyHousehold(admin: SupabaseClient, householdId: string, now: Date, sink: NeedsSink | null): Promise<VerifyCounts> {
  const counts: VerifyCounts = { checked: 0, confirmed: 0, conflicts: 0, raised: 0, bars: 0 };
  try {
    const since = new Date(now.getTime() - HISTORY_DAYS * 86_400_000).toISOString();
    const [changes, rules, members, bars] = await Promise.all([
      admin
        .from("homesend_changes")
        .select("id, intake_id, domain, created_at, confirmation_state, created_by_member_id")
        .eq("household_id", householdId)
        .is("undone_at", null)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(2000),
      listHouseholdRules(admin, householdId),
      admin.from("household_members").select("id, display_name").eq("household_id", householdId).limit(200),
      refreshKindBars(admin, householdId, now),
    ]);
    counts.bars = bars.length;
    if (changes.error || !changes.data) return counts;
    const changeRows = (changes.data as ChangeRow[]).filter((row) => kindOfDomain(row.domain) !== null);
    const names = new Map(((members.data ?? []) as { id: string; display_name: string }[]).map((row) => [row.id, row.display_name.split(/\s+/)[0]!]));

    // The items behind every entry, and anything else sent lately (a possible second source), in one wave.
    const intakeIds = [...new Set(changeRows.map((row) => row.intake_id))];
    const sourceSince = new Date(now.getTime() - SOURCE_DAYS * 86_400_000).toISOString();
    const columns = "id, classified_kind, extracted, sender_address, content_hash, created_by_member_id, created_at";
    const [itemPages, recentItems] = await Promise.all([
      Promise.all(chunks(intakeIds, 200).map((ids) => admin.from("home_send_items").select(columns).eq("household_id", householdId).in("id", ids))),
      admin.from("home_send_items").select(columns).eq("household_id", householdId).gte("created_at", sourceSince).limit(1000),
    ]);
    const items = new Map<string, ItemRow>();
    for (const page of itemPages) for (const row of (page.data ?? []) as ItemRow[]) items.set(row.id, row);

    const entries: VerifyEntry[] = [];
    for (const row of changeRows) {
      const item = items.get(row.intake_id);
      const extracted = item?.extracted ?? null;
      const label = (extracted?.title ?? "").trim();
      if (!label) continue;
      entries.push({
        changeId: row.id,
        itemId: row.intake_id,
        kind: kindOfDomain(row.domain)!,
        title: normalizeWords(label) ?? "",
        label,
        date: extracted?.dueDate ?? extracted?.documentDate ?? null,
        time: extracted?.dueTime ?? null,
        amount: typeof extracted?.amount === "number" ? extracted.amount : null,
        payee: extracted?.payee ?? extracted?.merchant ?? null,
        sender: item?.sender_address ?? null,
        subjectMemberId: memberByName(names, extracted?.subjectMemberName),
        createdByMemberId: row.created_by_member_id ?? item?.created_by_member_id ?? null,
        contentHash: item?.content_hash ?? null,
        unconfirmed: row.confirmation_state === "unconfirmed",
        createdAt: row.created_at,
      });
    }
    counts.checked = entries.length;
    const live = new Set(entries.map((entry) => entry.itemId));
    const sources: SourceItem[] = ((recentItems.data ?? []) as ItemRow[])
      .filter((row) => !live.has(row.id) && row.extracted?.title)
      .map((row) => ({
        itemId: row.id,
        kind: row.classified_kind,
        title: row.extracted!.title!,
        date: row.extracted?.dueDate ?? row.extracted?.documentDate ?? null,
        amount: typeof row.extracted?.amount === "number" ? row.extracted.amount : null,
        payee: row.extracted?.payee ?? row.extracted?.merchant ?? null,
        contentHash: row.content_hash,
      }));

    const recent = entries.filter((entry) => Date.parse(entry.createdAt) >= now.getTime() - 48 * 3_600_000).map((entry) => ({ changeId: entry.changeId, itemId: entry.itemId }));
    const alreadyRaised = sink && recent.length > 0 ? await sink.alreadyRaised(admin, householdId, recent).catch(() => new Set(recent.map((entry) => entry.changeId))) : new Set<string>();
    const plan = planVerification({ entries, sources, rules, names, alreadyRaised, now });
    counts.conflicts = plan.conflicts.length;

    for (const confirmation of plan.confirm) {
      const { error, count } = await admin
        .from("homesend_changes")
        .update({ confirmation_state: "confirmed", confirmed_at: now.toISOString(), confirmed_basis: confirmation.basis }, { count: "exact" })
        .eq("household_id", householdId)
        .eq("id", confirmation.changeId)
        .eq("confirmation_state", "unconfirmed")
        .is("undone_at", null);
      if (!error && (count ?? 0) > 0) counts.confirmed += 1;
    }
    if (sink) {
      for (const conflict of plan.conflicts) {
        if (await sink.raise(admin, householdId, conflict, now).catch(() => false)) counts.raised += 1;
      }
    }
  } catch (thrown) {
    log.warn("homebrain verify failed", { reason: thrown instanceof Error ? thrown.name : "unknown", allow: ["reason"] });
  }
  return counts;
}
