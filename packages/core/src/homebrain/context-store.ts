import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "../db/admin";
import { listHouseholdHolidays } from "../calendar/holidays";
import { listEvents } from "../family/repository";
import type { HomeSendChange } from "../homesend/items";
import { listMeals } from "../meals/repository";
import { log } from "../observability/logger";
import { buildContextItems, type ContextRecords } from "../context/builders";
import { isoDateIn } from "../context/format";
import { applyFreshness } from "../context/freshness";
import { householdMemory, setContextWriteListener } from "../context/invalidation";
import { filterForViewer } from "../context/privacy";
import { attachLinks, type LinkKind } from "./sleep/links";
import { attachHomeSendEvidence } from "../context/provenance";
import { FACT_TABLE_NAMES, factsAvailable, factsForTurn, readFacts, scheduleKnowledgeDrain } from "../knowledge/facts";
import { CONTEXT_ADAPTERS, mergeRecords, gatherHouseholdContext, HOLIDAYS_AHEAD_DAYS, listAbsences, listBeliefs, listEventGuests, listFoodPreferences, listMemories, setContextStoreReader, type ContextSnapshot, type GatherOptions } from "../context/repository";
import type { ContextDomain, ContextScope, ContextViewer, HouseholdContextItem } from "../context/types";

/**
 * The Household Context Store (HomeBrain 3.0 phase A, design
 * `design/HOMEBRAIN-3.0-HOUSEHOLD-CONTEXT.md` §3.1–§3.2).
 *
 * The owner's reports on 2026-10-18 — a birthday two months out whose guests
 * HomeTalk "knew nothing" about, a preference remembered and then forgotten,
 * replies that took four to sixteen seconds — were one design limit: the
 * household's context was rebuilt from about twenty domain reads on every
 * turn, seven days ahead and twelve records to a list.
 *
 * So the whole context is built once and kept: one row per household
 * (`household_context`), every active record with no horizon and no cap,
 * as the same canonical items `buildContextItems` has always made. A turn
 * reads that one row. A domain write marks it stale (through
 * `invalidateHouseholdContext`'s listener) and the rebuild runs right after
 * that response (`schedule`, Next's `after()` in the app); a turn that still
 * finds it stale rebuilds it inline, once, and stores the result, so the
 * next turn does not.
 *
 * What stays per viewer, read live on the turn as before: who is asking
 * (people, which also decides guardianship), their own notifications, their
 * own HomeTalk proposals, health (its rows carry per-person visibility that
 * RLS decides), and the agenda. Everything else comes from the store and is
 * then held to the same lines a live read is: the domain gates
 * (`CONTEXT_ADAPTERS`' `permitted`), a child's own school items only, and
 * `filterForViewer` — in memory, before anything leaves the server.
 *
 * The store is derived and rebuildable. Nothing in it is a second source of
 * truth, and no row in it is readable by any session (deny-all RLS).
 */

/** The domains the store holds: the household's own records, the same for every member who may read them. */
export const STORE_DOMAINS: readonly ContextDomain[] = [
  "household", "pets", "responsibilities", "outcomes", "preferences", "calendar", "absences", "meals", "groceries", "orders", "bills",
  "school", "home", "laundry", "pet_care", "homesend", "agents", "integrations", "places",
];

/** The domains read live for the person asking, every turn. */
export const LIVE_DOMAINS: readonly ContextDomain[] = ["people", "notifications", "hometalk", "health", "attention"];

/** The calendar, meals and absences the store reaches: a month back, more than a year ahead (§3.1). */
export const STORE_PAST_DAYS = 30;
export const STORE_AHEAD_DAYS = 400;
/** A stored context is rebuilt when it is older than this, so wording like "due today" never drifts far (§3.2's hourly cron, until phase D). */
export const STORE_MAX_AGE_MS = 60 * 60_000;
/** The store's size cap (§3.1); past it, history is let go first. */
export const STORE_MAX_BYTES = 2 * 1024 * 1024;

const DAY_MS = 86_400_000;

/** Who the store is built as: nobody in particular, with every domain gate open. The viewer's own gates run at read time. */
const BUILDER: ContextViewer = { memberId: "", permissions: ["finance.view", "school.manage"], tone: "adult", guardianOf: [] };

export type StoredContext = {
  version: number;
  items: HouseholdContextItem[];
  unavailable: string[];
  /** When the build that made this row began reading. */
  builtAt: Date;
  /** When a write last changed the household, or null. Later than `builtAt` means the row is behind. */
  staleSince: Date | null;
};

type StoreRow = { version: number; document: unknown; unavailable: unknown; built_at: string; stale_since: string | null };

// --- reading -------------------------------------------------------------------

/** The stored row; null when there is none; "unavailable" when it cannot be read (no table yet), which the caller treats as "no store". */
export async function readStoredContext(admin: SupabaseClient, householdId: string): Promise<StoredContext | null | "unavailable"> {
  const { data, error } = await admin.from("household_context").select("version, document, unavailable, built_at, stale_since").eq("household_id", householdId).maybeSingle();
  if (error) {
    // 42P01: the table is not there. Anything else is also "no store today".
    log.warn("household_context read failed", { reason: error.code ?? "unknown", allow: ["reason"] });
    return "unavailable";
  }
  if (!data) return null;
  const row = data as StoreRow;
  return {
    version: Number(row.version),
    items: Array.isArray(row.document) ? (row.document as HouseholdContextItem[]) : [],
    unavailable: Array.isArray(row.unavailable) ? (row.unavailable as string[]) : [],
    builtAt: new Date(row.built_at),
    staleSince: row.stale_since ? new Date(row.stale_since) : null,
  };
}

/** Whether a stored context can be read as it is: no write since its build began, not too old, and built on the household's own day. */
export function storeIsCurrent(stored: Pick<StoredContext, "staleSince" | "builtAt">, now: Date, timezone: string): boolean {
  if (stored.staleSince && stored.staleSince.getTime() >= stored.builtAt.getTime()) return false;
  if (now.getTime() - stored.builtAt.getTime() > STORE_MAX_AGE_MS) return false;
  return isoDateIn(stored.builtAt, timezone) === isoDateIn(now, timezone);
}

/**
 * Behind only by age: nothing marked it since it was built and it was built
 * today, so it holds what a rebuild would hold, short of a change no write
 * announced (which the age limit exists to catch). Such a row may answer
 * this turn while it is rebuilt after the response (performance audit B5).
 * A row a write marked, or one built on an earlier day, never answers: it is
 * rebuilt first.
 */
export function storeIsOnlyAged(stored: Pick<StoredContext, "staleSince" | "builtAt">, now: Date, timezone: string): boolean {
  if (stored.staleSince && stored.staleSince.getTime() >= stored.builtAt.getTime()) return false;
  return isoDateIn(stored.builtAt, timezone) === isoDateIn(now, timezone) && !storeIsCurrent(stored, now, timezone);
}

// --- building ------------------------------------------------------------------

export type BuildScope = { householdId: string; householdName: string; timezone: string; now: Date };

/** Everything the store holds, read with the service role and built whole. Pure once the records are in hand (`buildStoreItems`). */
export type StoredLink = { from: string; to: string; kind: LinkKind; reason: string };

export async function readStoreRecords(admin: SupabaseClient, scope: BuildScope): Promise<{ records: ContextRecords; homeSendChanges: HomeSendChange[]; unavailable: string[]; links: StoredLink[] }> {
  const fullScope: ContextScope = { ...scope, viewer: BUILDER };
  const from = new Date(scope.now.getTime() - STORE_PAST_DAYS * DAY_MS);
  const to = new Date(scope.now.getTime() + STORE_AHEAD_DAYS * DAY_MS);
  const fromDay = isoDateIn(from, scope.timezone);
  const toDay = isoDateIn(to, scope.timezone);
  const unavailable: string[] = [];
  const records: ContextRecords = {};
  const homeSendChanges: HomeSendChange[] = [];
  const links: StoredLink[] = [];

  const guard = async <T>(label: string, read: () => Promise<T>): Promise<T | null> => {
    try {
      return await read();
    } catch {
      unavailable.push(label);
      return null;
    }
  };

  // The adapters whose reads need no window and no viewer: the same code a
  // live read runs. People are read too — every summary names its people —
  // though their items are the live read's at turn time, never the store's.
  // Registry adapters (`knowledge/registry.ts`) read with no window, so every store domain's run here too.
  // Once the record index is there (14-037), registered tables are facts of their own, written when their records are, and the rebuild no longer reads them.
  const registryAsFacts = await factsAvailable(admin);
  const plain = CONTEXT_ADAPTERS.filter(
    (adapter) =>
      (adapter.domain === "people" || STORE_DOMAINS.includes(adapter.domain)) &&
      (adapter.registry === true ? !registryAsFacts : !["calendar", "absences", "meals", "preferences"].includes(adapter.domain)),
  );
  const results = await Promise.all([
    ...plain.map((adapter) => guard(adapter.label, () => adapter.read(admin, fullScope))),
    guard("the calendar", async () => {
      const [events, guests, holidays] = await Promise.all([
        listEvents(admin, scope.householdId, { from, to }),
        listEventGuests(admin, scope.householdId),
        listHouseholdHolidays(admin, scope.householdId, { from: isoDateIn(scope.now, scope.timezone), to: isoDateIn(new Date(scope.now.getTime() + HOLIDAYS_AHEAD_DAYS * DAY_MS), scope.timezone) }).catch(() => []),
      ]);
      return { events, eventGuests: guests, holidays };
    }),
    guard("who is away", async () => ({ absences: await listAbsences(admin, scope.householdId, fromDay, toDay) })),
    guard("meals", async () => ({ meals: await listMeals(admin, scope.householdId, { from: fromDay, to: toDay }) })),
    guard("what the household has said", async () => {
      const [memories, beliefs, foodPreferences] = await Promise.all([
        listMemories(admin, scope.householdId, { limit: 1000 }),
        listBeliefs(admin, scope.householdId, { limit: 1000 }),
        listFoodPreferences(admin, scope.householdId),
      ]);
      return { memories, beliefs, foodPreferences };
    }),
    // What a night's sleep linked across the home (HomeBrain Sleep): no table yet is no links.
    (async () => {
      const { data } = await admin.from("homebrain_links").select("from_item, to_item, kind, reason").eq("household_id", scope.householdId).limit(2000);
      for (const row of (data ?? []) as { from_item: string; to_item: string; kind: LinkKind; reason: string }[]) links.push({ from: row.from_item, to: row.to_item, kind: row.kind, reason: row.reason });
      return null;
    })(),
  ]);
  for (const result of results) {
    if (!result) continue;
    const { homeSendChanges: changes, guardianOf: _guardianOf, ...rest } = result as ContextRecords & { homeSendChanges?: HomeSendChange[]; guardianOf?: string[] };
    if (changes) homeSendChanges.push(...changes);
    mergeRecords(records, rest);
  }
  return { records, homeSendChanges, unavailable, links };
}

/** Records → the store's items: whole lists, no horizon, nobody in particular asking. */
export function buildStoreItems(records: ContextRecords, homeSendChanges: readonly HomeSendChange[], scope: BuildScope, links: readonly StoredLink[] = []): HouseholdContextItem[] {
  const built = buildContextItems(records, { householdId: scope.householdId, householdName: scope.householdName, timezone: scope.timezone, now: scope.now, viewerMemberId: "", limitLists: false });
  return attachLinks(attachHomeSendEvidence(built, [...homeSendChanges]), links);
}

/**
 * Keeps the document under the cap by letting history go first — the
 * oldest historical items, then the oldest tier-3 ones — never a current
 * fact. Returns the items kept and the JSON they make.
 */
export function fitToCap(items: readonly HouseholdContextItem[], maxBytes: number = STORE_MAX_BYTES): { items: HouseholdContextItem[]; json: string } {
  let kept = [...items];
  let json = JSON.stringify(kept);
  const byAge = (a: HouseholdContextItem, b: HouseholdContextItem) => a.freshnessAt.localeCompare(b.freshnessAt);
  for (const expendable of [
    (item: HouseholdContextItem) => item.freshness === "historical" || item.freshness === "superseded",
    (item: HouseholdContextItem) => item.tier >= 3,
  ]) {
    if (json.length <= maxBytes) break;
    const candidates = kept.filter(expendable).sort(byAge);
    while (json.length > maxBytes && candidates.length > 0) {
      const batch = new Set(candidates.splice(0, Math.max(1, Math.ceil(candidates.length / 8))).map((item) => item.id));
      kept = kept.filter((item) => !batch.has(item.id));
      json = JSON.stringify(kept);
    }
  }
  return { items: kept, json };
}

/**
 * Rebuilds a household's stored context and writes it. `built_at` is when
 * the reading began, so a write that lands while it reads still leaves the
 * row behind (`stale_since` later than `built_at`).
 */
export async function rebuildStoredContext(admin: SupabaseClient, scope: BuildScope): Promise<StoredContext> {
  const { records, homeSendChanges, unavailable, links } = await readStoreRecords(admin, scope);
  const built = buildStoreItems(records, homeSendChanges, scope, links);
  const { items, json } = fitToCap(built);
  const sections: Record<string, { count: number; builtAt: string }> = {};
  for (const item of items) {
    sections[item.domain] = { count: (sections[item.domain]?.count ?? 0) + 1, builtAt: scope.now.toISOString() };
  }
  const { data: current } = await admin.from("household_context").select("version").eq("household_id", scope.householdId).maybeSingle();
  const version = Number((current as { version?: number } | null)?.version ?? 0) + 1;
  const { error } = await admin.from("household_context").upsert(
    {
      household_id: scope.householdId,
      version,
      document: JSON.parse(json),
      sections,
      unavailable,
      size_bytes: json.length,
      built_at: scope.now.toISOString(),
    },
    { onConflict: "household_id" },
  );
  if (error) throw new Error(`household_context write failed: ${error.code ?? "unknown"}`);
  return { version, items, unavailable, builtAt: scope.now, staleSince: null };
}

/**
 * A rebuild of one household, by its own name and zone; nothing when the
 * household is gone. The items returned also carry the household's facts
 * (record index Phase 2), so the nightly sleep sees every record; the stored
 * row holds only what the rebuild read.
 */
export async function rebuildHousehold(admin: SupabaseClient, householdId: string, now: Date = new Date()): Promise<StoredContext | null> {
  const { data } = await admin.from("households").select("name, timezone").eq("id", householdId).maybeSingle();
  const household = data as { name: string; timezone: string } | null;
  if (!household) return null;
  const scope = { householdId, householdName: household.name, timezone: household.timezone, now };
  const [stored, facts] = await Promise.all([rebuildStoredContext(admin, scope), readFacts(admin, scope)]);
  return { ...stored, items: withFacts(stored.items, facts) };
}

/**
 * Stored items with the household's facts in place of whatever the store
 * read from the same tables (a row built before the record index existed).
 * "unavailable" facts leave the stored items as they are.
 */
export function withFacts(items: readonly HouseholdContextItem[], facts: readonly HouseholdContextItem[] | "unavailable"): HouseholdContextItem[] {
  if (facts === "unavailable") return [...items];
  return [...items.filter((item) => !FACT_TABLE_NAMES.has(item.source.type)), ...facts];
}

/** At most this many stored contexts are rebuilt per delivery tick: the clock is every five minutes, and a turn rebuilds its own anyway. */
export const KEEP_WARM_PER_TICK = 4;
/** A store nobody has read for this long is left to the next turn rather than kept warm. */
const KEEP_WARM_IDLE_MS = 7 * DAY_MS;

/**
 * Keeping it whole (HomeBrain 4.0 §3.8, story 14-031): the stores that are
 * behind — a write marked them (a service, or the database's own trigger for
 * a write that went round one) — or older than an hour, rebuilt off the
 * request path, oldest first, so the next turn reads a current row instead
 * of rebuilding while someone waits. Run from the delivery clock. Returns how
 * many were rebuilt; a failure costs only that household's warm row.
 */
export async function keepStoresWarm(admin: SupabaseClient, now: Date = new Date(), limit: number = KEEP_WARM_PER_TICK): Promise<number> {
  const { data, error } = await admin
    .from("household_context")
    .select("household_id, built_at, stale_since")
    .gte("built_at", new Date(now.getTime() - KEEP_WARM_IDLE_MS).toISOString())
    .order("built_at", { ascending: true })
    .limit(200);
  if (error) {
    if (error.code !== "42P01") log.warn("household_context keep-warm read failed", { reason: error.code ?? "unknown", allow: ["reason"] });
    return 0;
  }
  const behind = ((data ?? []) as { household_id: string; built_at: string; stale_since: string | null }[]).filter((row) => {
    const builtAt = Date.parse(row.built_at);
    return (row.stale_since !== null && Date.parse(row.stale_since) >= builtAt) || now.getTime() - builtAt > STORE_MAX_AGE_MS;
  });
  let rebuilt = 0;
  for (const row of behind.slice(0, limit)) {
    if (await runRebuild(row.household_id, () => rebuildHousehold(admin, row.household_id, now))) rebuilt += 1;
  }
  return rebuilt;
}

// --- one rebuild at a time per household, on this instance ------------------------------

const inflight = new Map<string, Promise<StoredContext | null>>();
/** Households written to while their rebuild was already reading: one more pass after it. */
const again = new Set<string>();

function runRebuild(householdId: string, start: () => Promise<StoredContext | null>): Promise<StoredContext | null> {
  const running = inflight.get(householdId);
  if (running) {
    again.add(householdId);
    return running;
  }
  const rebuilding = start()
    .catch((thrown: unknown) => {
      log.warn("household_context rebuild failed", { reason: thrown instanceof Error ? thrown.message.slice(0, 80) : "unknown", allow: ["reason"] });
      return null;
    })
    .finally(() => {
      inflight.delete(householdId);
      if (again.delete(householdId)) void runRebuild(householdId, start);
    });
  inflight.set(householdId, rebuilding);
  return rebuilding;
}

// --- the stale mark ---------------------------------------------------------------------

/** How the app runs work after the response that wrote (Next's `after()`); null runs nothing then, and the next turn rebuilds. */
export type Schedule = (task: () => Promise<unknown>) => void;

/**
 * After a domain write: the stored row is marked behind, and its rebuild is
 * scheduled for after the response. Only a household that already has a
 * stored row is touched; the first turn builds one. Never awaited by the
 * write, and nothing here can fail it.
 */
export function markStoredContextStale(householdId: string, schedule: Schedule | null): void {
  let admin: SupabaseClient;
  try {
    admin = createAdminClient();
  } catch {
    return;
  }
  const marked = admin
    .from("household_context")
    .update({ stale_since: new Date().toISOString() })
    .eq("household_id", householdId)
    .select("household_id")
    .then(({ data, error }) => {
      if (error) {
        if (error.code !== "42P01") log.warn("household_context stale mark failed", { reason: error.code ?? "unknown", allow: ["reason"] });
        return false;
      }
      return (data ?? []).length > 0;
    });
  if (!schedule) {
    void marked;
    return;
  }
  try {
    schedule(async () => {
      if (await marked) await runRebuild(householdId, () => rebuildHousehold(admin, householdId));
    });
  } catch {
    // Outside a request (a script, a test): the mark stands and the next turn rebuilds.
    void marked;
  }
}

/** After a write: its household's queued records become facts once the response has gone (record index Phase 2). */
function drainAfterWrite(householdId: string, schedule: Schedule | null): void {
  if (!schedule) return;
  try {
    scheduleKnowledgeDrain(createAdminClient(), householdId, schedule);
  } catch {
    // No service role: the delivery clock drains it.
  }
}

// --- the turn's read ------------------------------------------------------------------

/** How the app runs work after the response, as `enableContextStore` was given it; null rebuilds every stale row inline. */
let afterResponse: Schedule | null = null;

/**
 * The stored context as it is, rebuilt first when it is missing or behind —
 * once per household at a time on this instance. A row behind only by age
 * answers now and is rebuilt after the response (`storeIsOnlyAged`).
 */
async function currentStoredContext(admin: SupabaseClient, scope: BuildScope): Promise<StoredContext | null> {
  const stored = await readStoredContext(admin, scope.householdId);
  if (stored === "unavailable") return null;
  if (stored && storeIsCurrent(stored, scope.now, scope.timezone)) return stored;
  if (stored && afterResponse && storeIsOnlyAged(stored, scope.now, scope.timezone)) {
    try {
      afterResponse(() => runRebuild(scope.householdId, () => rebuildStoredContext(admin, scope)));
      return stored;
    } catch {
      // Outside a request: rebuild it now, as before.
    }
  }
  return runRebuild(scope.householdId, () => rebuildStoredContext(admin, scope));
}

/**
 * The viewer's own gates over stored items, the same lines a live read
 * draws: each domain's `permitted`, and for a member who does not manage
 * school, only their own school items and none of the school's notes.
 * The household's own item comes from the live read, never the store.
 */
export function storedItemsForViewer(items: readonly HouseholdContextItem[], viewer: ContextViewer, wanted: ReadonlySet<ContextDomain> | null): HouseholdContextItem[] {
  const permitted = new Map(CONTEXT_ADAPTERS.map((adapter) => [adapter.domain, adapter.permitted(viewer)]));
  const schoolManager = viewer.permissions.includes("school.manage");
  return items.filter((item) => {
    if (item.domain === "household" || !STORE_DOMAINS.includes(item.domain)) return false;
    if (wanted && !wanted.has(item.domain)) return false;
    if (permitted.has(item.domain) && !permitted.get(item.domain)) return false;
    if (item.domain === "school" && !schoolManager && (item.entityType === "school_communication" || !item.subjectMemberIds.includes(viewer.memberId))) return false;
    return true;
  });
}

/**
 * `loadHouseholdContext` through the store: one row for the household's
 * records, live reads for the viewer's own, the same filters as before.
 * Null means "no store today" (no service role, no table yet), and the
 * caller reads as it always has.
 */
export async function readContextThroughStore(supabase: SupabaseClient, scope: ContextScope, options: GatherOptions = {}): Promise<ContextSnapshot | null> {
  let admin: SupabaseClient;
  try {
    admin = createAdminClient();
  } catch {
    return null;
  }
  // The household's own queue is drained while the stored row is read, so a record saved just before this turn is known to it.
  const [stored, facts] = await Promise.all([
    currentStoredContext(admin, { householdId: scope.householdId, householdName: scope.householdName, timezone: scope.timezone, now: scope.now }),
    factsForTurn(admin, scope),
  ]);
  if (!stored) return null;

  const wanted = options.domains ? new Set<ContextDomain>(options.domains) : null;
  const liveDomains = LIVE_DOMAINS.filter((domain) => domain !== "people" && (!wanted || wanted.has(domain)));
  const live = await gatherHouseholdContext(supabase, scope, { agenda: options.agenda, domains: liveDomains });

  const fromStore = storedItemsForViewer(withFacts(stored.items, facts), live.scope.viewer, wanted);
  const liveIds = new Set(live.items.map((item) => item.id));
  const merged = [...live.items, ...fromStore.filter((item) => !liveIds.has(item.id))];
  const fresh = applyFreshness(merged, scope.now);
  const { items, withheld } = filterForViewer(fresh, live.scope);
  return {
    scope: live.scope,
    items,
    unavailable: Array.from(new Set([...live.unavailable, ...stored.unavailable])),
    withheld: [...live.withheld, ...withheld],
    heldForAdults: live.heldForAdults,
    gatheredAt: scope.now,
  };
}

/**
 * Turns the store on for this process: reads go through it, writes mark it
 * behind and schedule its rebuild with `schedule`. Idempotent. Off unless
 * a deployment sets nothing to turn it off: `WONDERHOME_CONTEXT_STORE=off`
 * keeps every read live, as before.
 */
export function enableContextStore(options: { schedule?: Schedule | null } = {}): boolean {
  if (process.env.WONDERHOME_CONTEXT_STORE === "off") return false;
  const schedule = options.schedule ?? null;
  afterResponse = schedule;
  setContextStoreReader((supabase, scope, gather) =>
    householdMemory(scope.householdId, `store:${scope.viewer.memberId}${gather.domains ? `:${[...gather.domains].sort().join(",")}` : ""}`, () =>
      readContextThroughStore(supabase, scope, gather),
    ),
  );
  setContextWriteListener((householdId) => {
    markStoredContextStale(householdId, schedule);
    drainAfterWrite(householdId, schedule);
  });
  return true;
}
