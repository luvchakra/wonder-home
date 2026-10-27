import type { SupabaseClient } from "@supabase/supabase-js";

import { isoDateIn } from "../context/format";
import type { ContextDomain, HouseholdContextItem } from "../context/types";
import { log } from "../observability/logger";
import { describeRow, describeWords } from "./describe";
import { REGISTRY_READ, type RegistrySpec, type RegistryTable, type Row } from "./registry";

/**
 * The household record index, Phase 2 (story 14-037,
 * `design/HOUSEHOLD-RECORD-INDEX.md` §4): facts written when records are
 * written.
 *
 * A write to a registered table queues `(household, table, id)` in
 * `knowledge_outbox` (the `wh.queue_knowledge` trigger, so a write that goes
 * round a service is queued too). `drainKnowledge` claims queued rows, reads
 * each record once with the service role, runs the registry's own describer
 * and upserts its fact into `household_facts`, or deletes the fact when the
 * record is gone, inactive or out of its window. It runs after the response
 * that wrote (`scheduleKnowledgeDrain`), on the delivery clock, and, for its
 * own household's short queue, before a turn answers (`drainBeforeTurn`).
 *
 * Facts are household data: deny-all to every session, never cached across
 * requests, read by the server after `requireMembership` and held to the
 * viewer's gates and `filterForViewer` like every stored item.
 */

/** Domains read live for the person asking (`homebrain/context-store.ts` LIVE_DOMAINS): no stored facts. */
const READ_LIVE: readonly ContextDomain[] = ["people", "notifications", "hometalk", "health", "attention"];

/** The registered tables whose facts are written when their records are. The migration's trigger list; `lint:knowledge` checks it. */
export const FACT_TABLES: readonly (RegistrySpec & { table: RegistryTable })[] = REGISTRY_READ.filter((spec) => !READ_LIVE.includes(spec.domain));
const FACT_SPEC = new Map<string, RegistrySpec & { table: RegistryTable }>(FACT_TABLES.map((spec) => [spec.table, spec]));
export const FACT_TABLE_NAMES: ReadonlySet<string> = new Set(FACT_TABLES.map((spec) => spec.table));

/** A turn waits for at most this many of its household's queued records, in one claim. */
export const TURN_DRAIN_LIMIT = 100;
/** The delivery clock drains this many per tick, across households. */
export const CLOCK_DRAIN_LIMIT = 300;
/** Facts read for one turn: every list is bounded. */
export const FACTS_READ_LIMIT = 3000;

const DAY_MS = 86_400_000;

/** The columns a record is read with: the describer's own, plus what decides whether it is still known. */
export function factSelect(spec: RegistrySpec): string {
  const extra = [spec.activeOnly ? "active" : null, spec.since?.column ?? null].filter((column): column is string => column !== null && !new RegExp(`(^|[\\s,])${column}([\\s,]|$)`).test(spec.select));
  return [spec.select, ...extra].join(", ");
}

/** When a record leaves its table's window, or null when it never does. */
function expiresAt(spec: RegistrySpec, row: Row): string | null {
  if (!spec.since) return null;
  const value = row[spec.since.column];
  if (typeof value !== "string") return null;
  const at = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value);
  return Number.isNaN(at) ? null : new Date(at + spec.since.days * DAY_MS).toISOString();
}

export type FactRow = {
  household_id: string;
  source_table: string;
  source_id: string;
  fact_key: string;
  domain: string;
  entity_type: string;
  title: string;
  summary: string;
  privacy: string;
  health_scope: string | null;
  subjects: string[];
  day: string | null;
  current: boolean | null;
  expires_at: string | null;
  item: HouseholdContextItem;
  written_at: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One record as its fact row, or null when the household should not know it
 * (gone, inactive, out of its window, or nothing to say). Pure.
 */
export function factFor(
  spec: RegistrySpec & { table: RegistryTable },
  row: Row | undefined,
  context: { householdId: string; timezone: string; now: Date; names: ReadonlyMap<string, string> },
): FactRow | null {
  if (!row) return null;
  if (spec.activeOnly && row.active !== true) return null;
  const expires = expiresAt(spec, row);
  if (expires && expires <= context.now.toISOString()) return null;
  const words = describeWords(context.timezone, context.names);
  const nowIso = context.now.toISOString();
  const item = describeRow(spec, row, { householdId: context.householdId, words, today: isoDateIn(context.now, context.timezone), nowIso });
  if (!item) return null;
  const described = spec.describe(row, words);
  const day = typeof item.attributes.date === "string" ? item.attributes.date : null;
  return {
    household_id: context.householdId,
    source_table: spec.table,
    source_id: String(row.id),
    fact_key: "",
    domain: item.domain,
    entity_type: item.entityType,
    title: typeof item.attributes.title === "string" ? item.attributes.title : "",
    summary: item.summary,
    privacy: item.privacyClass,
    health_scope: item.healthScope ?? null,
    subjects: item.subjectMemberIds.filter((id) => UUID.test(id)),
    day,
    current: described?.current ?? null,
    expires_at: expires,
    item,
    written_at: nowIso,
  };
}

/** A stored fact as the item a turn reads: current or history by its own word or its day, today. */
export function factItem(row: Pick<FactRow, "item" | "day" | "current">, today: string): HouseholdContextItem {
  const current = row.current ?? !(row.day && row.day < today);
  return { ...row.item, freshness: current ? "current" : "historical", tier: current ? 2 : 3 };
}

// --- the worker --------------------------------------------------------------------

type Claimed = { household_id: string; source_table: string; source_id: string };
export type DrainResult = { claimed: number; written: number; removed: number; failed: number };
const NOTHING: DrainResult = { claimed: 0, written: 0, removed: 0, failed: 0 };

/** Whether an error means "this database has no record index yet" (the migration not applied). */
const notThere = (code: string | undefined) => code === "42P01" || code === "42883" || code === "PGRST202" || code === "PGRST205";

/**
 * Claims up to `limit` queued records (one household's, or anyone's), makes
 * or removes each one's fact, and lets the claim go. Nothing here throws: a
 * record that fails stays queued for the next drain, five tries at most.
 */
export async function drainKnowledge(admin: SupabaseClient, options: { householdId?: string | null; limit: number; now?: Date }): Promise<DrainResult> {
  const now = options.now ?? new Date();
  const token = globalThis.crypto.randomUUID();
  const { data, error } = await admin.rpc("claim_knowledge_outbox", { p_household_id: options.householdId ?? null, p_limit: options.limit, p_token: token });
  if (error) {
    if (!notThere(error.code)) log.warn("knowledge outbox claim failed", { reason: error.code ?? "unknown", allow: ["reason"] });
    return NOTHING;
  }
  const claimed = (data ?? []) as Claimed[];
  if (claimed.length === 0) return NOTHING;

  const failed: { table: string; id: string }[] = [];
  let written = 0;
  let removed = 0;
  const byHousehold = new Map<string, Claimed[]>();
  for (const row of claimed) byHousehold.set(row.household_id, [...(byHousehold.get(row.household_id) ?? []), row]);

  await Promise.all(
    [...byHousehold.entries()].map(async ([householdId, rows]) => {
      const result = await factsForHousehold(admin, householdId, rows, now);
      written += result.written;
      removed += result.removed;
      failed.push(...result.failed);
    }),
  );

  const { error: finishError } = await admin.rpc("finish_knowledge_outbox", { p_token: token, p_failed: failed });
  if (finishError) log.warn("knowledge outbox finish failed", { reason: finishError.code ?? "unknown", allow: ["reason"] });
  return { claimed: claimed.length, written, removed, failed: failed.length };
}

async function factsForHousehold(admin: SupabaseClient, householdId: string, rows: readonly Claimed[], now: Date): Promise<{ written: number; removed: number; failed: { table: string; id: string }[] }> {
  const failed: { table: string; id: string }[] = [];
  const byTable = new Map<string, string[]>();
  for (const row of rows) byTable.set(row.source_table, [...(byTable.get(row.source_table) ?? []), row.source_id]);
  const failAll = () => ({ written: 0, removed: 0, failed: rows.map((row) => ({ table: row.source_table, id: row.source_id })) });

  const [household, members, ...reads] = await Promise.all([
    admin.from("households").select("timezone").eq("id", householdId).maybeSingle(),
    admin.from("household_members").select("id, display_name").eq("household_id", householdId).limit(200),
    ...[...byTable.entries()].map(async ([table, ids]) => {
      const spec = FACT_SPEC.get(table);
      if (!spec) return { table, ids, spec: null, found: new Map<string, Row>(), ok: true };
      const { data, error } = await admin.from(table).select(factSelect(spec)).eq("household_id", householdId).in("id", ids);
      const found = new Map<string, Row>(((data ?? []) as unknown as Row[]).map((row) => [String(row.id), row]));
      return { table, ids, spec, found, ok: !error };
    }),
  ]);
  if (household.error || members.error) return failAll();
  // The household is gone: its facts went with it, and its queue goes now.
  if (!household.data) return { written: 0, removed: 0, failed: [] };

  const timezone = (household.data as { timezone: string }).timezone;
  const names = new Map(((members.data ?? []) as { id: string; display_name: string }[]).map((member) => [member.id, member.display_name]));
  const upserts: FactRow[] = [];
  const removals: { table: string; ids: string[] }[] = [];
  for (const read of reads) {
    if (!read.ok) {
      failed.push(...read.ids.map((id) => ({ table: read.table, id })));
      continue;
    }
    const gone: string[] = [];
    for (const id of read.ids) {
      const fact = read.spec ? factFor(read.spec, read.found.get(id), { householdId, timezone, now, names }) : null;
      if (fact) upserts.push(fact);
      else gone.push(id);
    }
    if (gone.length > 0) removals.push({ table: read.table, ids: gone });
  }

  const [upserted, ...deleted] = await Promise.all([
    upserts.length > 0 ? admin.from("household_facts").upsert(upserts, { onConflict: "household_id,source_table,source_id,fact_key" }) : Promise.resolve({ error: null }),
    ...removals.map((removal) => admin.from("household_facts").delete().eq("household_id", householdId).eq("source_table", removal.table).in("source_id", removal.ids)),
  ]);
  if (upserted.error) failed.push(...upserts.map((fact) => ({ table: fact.source_table, id: fact.source_id })));
  let removed = 0;
  deleted.forEach((result, index) => {
    const removal = removals[index]!;
    if (result.error) failed.push(...removal.ids.map((id) => ({ table: removal.table, id })));
    else removed += removal.ids.length;
  });
  return { written: upserted.error ? 0 : upserts.length, removed, failed };
}

// --- one drain at a time per household, on this instance ----------------------------

const inflight = new Map<string, Promise<DrainResult>>();

/** Drains one household's queue; a drain already running for it is joined, then the rest is drained. */
export function drainHousehold(admin: SupabaseClient, householdId: string, limit: number = TURN_DRAIN_LIMIT): Promise<DrainResult> {
  const running = inflight.get(householdId);
  const draining = (running ? running.catch(() => NOTHING) : Promise.resolve(NOTHING))
    .then(() => drainKnowledge(admin, { householdId, limit }))
    .catch(() => NOTHING)
    .finally(() => {
      if (inflight.get(householdId) === draining) inflight.delete(householdId);
    });
  inflight.set(householdId, draining);
  return draining;
}

/** How the app runs work after the response (Next's `after()`). */
export type Schedule = (task: () => Promise<unknown>) => void;

/** After a write: its household's queue is drained once the response has gone. Never awaited by the write. */
export function scheduleKnowledgeDrain(admin: SupabaseClient, householdId: string, schedule: Schedule | null): void {
  if (!schedule) return;
  try {
    schedule(() => drainHousehold(admin, householdId));
  } catch {
    // Outside a request: the next turn or the delivery clock drains it.
  }
}

// --- the turn's read ---------------------------------------------------------------

/**
 * A turn's facts: its household's queue drained first (at most
 * `TURN_DRAIN_LIMIT` records), then every fact still in its window, as items.
 * "unavailable" when the record index is not there yet; the caller then reads
 * these tables as it did before.
 */
export async function factsForTurn(admin: SupabaseClient, scope: { householdId: string; timezone: string; now: Date }): Promise<HouseholdContextItem[] | "unavailable"> {
  await drainHousehold(admin, scope.householdId);
  return readFacts(admin, scope);
}

export async function readFacts(admin: SupabaseClient, scope: { householdId: string; timezone: string; now: Date }): Promise<HouseholdContextItem[] | "unavailable"> {
  const { data, error } = await admin
    .from("household_facts")
    .select("item, day, current")
    .eq("household_id", scope.householdId)
    .or(`expires_at.is.null,expires_at.gt.${scope.now.toISOString()}`)
    .order("written_at", { ascending: false })
    .limit(FACTS_READ_LIMIT);
  if (error) {
    if (!notThere(error.code)) log.warn("household_facts read failed", { reason: error.code ?? "unknown", allow: ["reason"] });
    return "unavailable";
  }
  const today = isoDateIn(scope.now, scope.timezone);
  factsReady = true;
  return ((data ?? []) as Pick<FactRow, "item" | "day" | "current">[]).map((row) => factItem(row, today));
}

let factsReady: boolean | null = null;
let probedAt = 0;

/**
 * Whether this database has the record index (the migration applied): the
 * schema, not any household's data, so it is remembered per process. A "no"
 * is asked again after five minutes.
 */
export async function factsAvailable(admin: SupabaseClient, now: number = Date.now()): Promise<boolean> {
  if (factsReady === true) return true;
  if (factsReady === false && now - probedAt < 5 * 60_000) return false;
  probedAt = now;
  const { error } = await admin.from("household_facts").select("household_id", { head: true }).limit(1);
  factsReady = !error;
  return factsReady;
}

/** For tests: forget what was learned about the schema. */
export function resetFactsAvailability(): void {
  factsReady = null;
  probedAt = 0;
}
