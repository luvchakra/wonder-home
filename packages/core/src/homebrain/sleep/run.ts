import type { SupabaseClient } from "@supabase/supabase-js";

import { readHouseholdKey } from "../../ai/credentials";
import { platformKey, resolveModelKey } from "../../ai/model-key";
import { routeToProvider, type DataUsePolicy } from "../../ai/privacy";
import { loadDataUse } from "../../ai/privacy-repository";
import { isoDateIn } from "../../context/format";
import { contentClassFor } from "../../context/privacy";
import type { HouseholdContextItem } from "../../context/types";
import { remember } from "../../conversation/repository";
import type { Memory } from "../../conversation/memory";
import { log } from "../../observability/logger";
import { rebuildHousehold } from "../context-store";
import { pairKey, planSleep, statementOf, type SleepMemory, type SleepOperation, type SleepPerson, type SleepPlan, type Stance } from "./consolidate";
import { embedderFor, namesIn, readVectors, refreshEmbeddings, withoutNames } from "./embeddings";
import { ruleLinks, validModelLinks, type HomeBrainLink } from "./links";
import { createSleepModel, type SleepModel } from "./sleep-model";
import { cosine } from "./similarity";

/**
 * One household's night (HomeBrain Sleep): read everything it remembers,
 * plan the night (`planSleep`), let a model judge what rules cannot, apply
 * each change with what it was before, link records across the home, bring
 * meaning up to date, and rebuild the household's context. Runs with the
 * service role, once per household per local day (`homebrain_runs`).
 *
 * Nothing here decides alone what only a person should: a contradiction is
 * put to the household in HomeBrain Review, and every other change is listed
 * there with Undo.
 */

export type SleepResult = {
  householdId: string;
  localDate: string;
  counts: Record<string, number>;
  modelProvider: string | null;
};

type Row = Record<string, unknown>;

const MEMORY_COLUMNS = "id, scope, member_id, category, key, value, status, tier, salience, valid_until, merged_into, source_type, source_id, confidence, created_at, updated_at";

function toSleepMemory(row: Row, recall: Map<string, { count: number; at: string }>): SleepMemory {
  const recalled = recall.get(row.id as string);
  return {
    id: row.id as string,
    scope: row.scope as SleepMemory["scope"],
    memberId: (row.member_id as string | null) ?? null,
    category: row.category as string,
    key: row.key as string,
    value: row.value,
    status: row.status as SleepMemory["status"],
    tier: ((row.tier as string | null) ?? "active") as SleepMemory["tier"],
    salience: Number(row.salience ?? 1),
    validUntil: (row.valid_until as string | null) ?? null,
    sourceType: (row.source_type as string | null) ?? "conversation",
    sourceId: (row.source_id as string | null) ?? null,
    confidence: Number(row.confidence ?? 0.8),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    recallCount: recalled?.count ?? 0,
    lastRecalledAt: recalled?.at ?? null,
  };
}

async function readMemories(admin: SupabaseClient, householdId: string): Promise<{ memories: SleepMemory[]; rows: Map<string, Row> }> {
  const [memories, recall] = await Promise.all([
    admin.from("memories").select(MEMORY_COLUMNS).eq("household_id", householdId).in("status", ["learned", "confirmed"]).limit(2000),
    admin.from("homebrain_recall").select("memory_id, recall_count, last_recalled_at").eq("household_id", householdId).limit(2000),
  ]);
  if (memories.error) throw new Error(`sleep memories read failed: ${memories.error.code ?? "unknown"}`);
  const recalled = new Map(((recall.data ?? []) as Row[]).map((row) => [row.memory_id as string, { count: Number(row.recall_count), at: row.last_recalled_at as string }]));
  const rows = new Map(((memories.data ?? []) as Row[]).map((row) => [row.id as string, row]));
  return { memories: [...rows.values()].map((row) => toSleepMemory(row, recalled)), rows };
}

async function readPeople(admin: SupabaseClient, householdId: string): Promise<SleepPerson[]> {
  const { data, error } = await admin.from("household_members").select("id, display_name, nickname, relationship, member_type, status").eq("household_id", householdId).neq("status", "inactive");
  if (error) throw new Error(`sleep people read failed: ${error.code ?? "unknown"}`);
  return ((data ?? []) as Row[]).map((row) => ({
    id: row.id as string,
    displayName: row.display_name as string,
    nickname: (row.nickname as string | null) ?? null,
    relationship: (row.relationship as string | null) ?? null,
    memberType: row.member_type as string,
  }));
}

/** A memory's item id in the store. */
const itemIdOf = (memoryId: string) => `memory:${memoryId}`;

/** Whether this household lets a memory's words reach a provider: its class, as the store tagged it. */
function mayLeave(memoryId: string, items: ReadonlyMap<string, HouseholdContextItem>, policy: DataUsePolicy): boolean {
  const item = items.get(itemIdOf(memoryId));
  return item ? policy.allowedClasses.includes(contentClassFor(item.privacyClass)) : false;
}

// --- applying -------------------------------------------------------------------

type Before = { id: string; status: string; tier: string; member_id: string | null; scope: string; merged_into: string | null };
type ItemBefore = { id: string; status: string; member_id: string | null; scope: string };

async function snapshot(admin: SupabaseClient, householdId: string, ids: readonly string[]): Promise<{ memories: Before[]; items: ItemBefore[] }> {
  if (ids.length === 0) return { memories: [], items: [] };
  const [memories, items] = await Promise.all([
    admin.from("memories").select("id, status, tier, member_id, scope, merged_into").eq("household_id", householdId).in("id", [...ids]),
    admin.from("certification_items").select("id, status, member_id, scope, memory_id").eq("household_id", householdId).in("memory_id", [...ids]),
  ]);
  return {
    memories: ((memories.data ?? []) as Before[]),
    items: ((items.data ?? []) as (ItemBefore & { memory_id: string })[]).map(({ memory_id: _memoryId, ...item }) => item),
  };
}

async function setItems(admin: SupabaseClient, householdId: string, memoryIds: readonly string[], patch: Row, onlyLive = true): Promise<void> {
  if (memoryIds.length === 0) return;
  let query = admin.from("certification_items").update(patch).eq("household_id", householdId).in("memory_id", [...memoryIds]);
  if (onlyLive) query = query.not("status", "in", "(removed,corrected)");
  await query;
}

async function logChange(admin: SupabaseClient, row: { householdId: string; runId: string; kind: string; memoryIds: string[]; statement: string; detail: Row; byModel: boolean }): Promise<void> {
  const { error } = await admin.from("homebrain_consolidations").insert({
    household_id: row.householdId,
    run_id: row.runId,
    kind: row.kind,
    memory_ids: row.memoryIds,
    statement: row.statement.slice(0, 400) || "—",
    detail: row.detail,
    by_model: row.byModel,
  });
  if (error) log.warn("homebrain consolidation log failed", { reason: error.code ?? "unknown", allow: ["reason"] });
}

async function createdId(admin: SupabaseClient, householdId: string, memberId: string | null, key: string): Promise<string | null> {
  let query = admin.from("memories").select("id").eq("household_id", householdId).eq("key", key).in("status", ["learned", "confirmed"]);
  query = memberId ? query.eq("member_id", memberId) : query.is("member_id", null);
  const { data } = await query.maybeSingle();
  return ((data as Row | null)?.id as string | undefined) ?? null;
}

/** Applies one planned change and records it. Returns whether anything changed. */
async function applyOperation(admin: SupabaseClient, householdId: string, runId: string, operation: SleepOperation, sourceOf: Map<string, SleepMemory>): Promise<boolean> {
  switch (operation.kind) {
    case "salience":
      await admin.from("memories").update({ salience: operation.salience }).eq("household_id", householdId).eq("id", operation.id);
      return false;
    case "valid_until":
      await admin.from("memories").update({ valid_until: operation.validUntil }).eq("household_id", householdId).eq("id", operation.id);
      return false;
    case "woke":
      await admin.from("memories").update({ tier: "active" }).eq("household_id", householdId).eq("id", operation.id);
      return true;
    case "merged": {
      const before = await snapshot(admin, householdId, [operation.keep, ...operation.drop]);
      const { error } = await admin.from("memories").update({ status: "superseded", merged_into: operation.keep }).eq("household_id", householdId).in("id", operation.drop);
      if (error) return false;
      await setItems(admin, householdId, operation.drop, { status: "corrected" });
      await logChange(admin, { householdId, runId, kind: "merged", memoryIds: [operation.keep, ...operation.drop], statement: operation.statement, detail: { before, kept: operation.keep, folded: operation.drop.map((id) => statementOf(sourceOf.get(id)!)) }, byModel: operation.byModel });
      return true;
    }
    case "split": {
      const original = sourceOf.get(operation.drop)!;
      const before = await snapshot(admin, householdId, [operation.drop]);
      const created: string[] = [];
      for (const part of operation.create) {
        const memory: Memory = {
          scope: part.memberId ? "member" : "household",
          memberId: part.memberId,
          category: "preference",
          key: part.key,
          value: { statement: part.statement, subject: part.subject, object: part.object, stance: part.stance, splitFrom: original.id },
          sourceType: (original.sourceType as Memory["sourceType"]) ?? "conversation",
          sourceId: original.sourceId,
          confidence: original.confidence,
          status: "confirmed",
        };
        try {
          await remember(admin, householdId, memory);
          const id = await createdId(admin, householdId, part.memberId, part.key);
          if (id) created.push(id);
        } catch (thrown) {
          log.warn("homebrain split write failed", { reason: thrown instanceof Error ? thrown.name : "unknown", allow: ["reason"] });
        }
      }
      // The original goes only once every part it held is on record.
      if (created.length !== operation.create.length) return created.length > 0;
      const { error } = await admin.from("memories").update({ status: "superseded" }).eq("household_id", householdId).eq("id", operation.drop);
      if (error) return false;
      await setItems(admin, householdId, [operation.drop], { status: "corrected" });
      await logChange(admin, {
        householdId,
        runId,
        kind: "split",
        memoryIds: [operation.drop, ...created],
        statement: operation.statement,
        detail: { before, created, parts: [...operation.create.map((part) => part.statement), ...operation.known], known: operation.known },
        byModel: operation.byModel,
      });
      return true;
    }
    case "reattributed": {
      const before = await snapshot(admin, householdId, [operation.id]);
      const { error } = await admin.from("memories").update({ member_id: operation.memberId, scope: "member" }).eq("household_id", householdId).eq("id", operation.id);
      if (error) return false;
      await setItems(admin, householdId, [operation.id], { member_id: operation.memberId, scope: "member" });
      await logChange(admin, { householdId, runId, kind: "reattributed", memoryIds: [operation.id], statement: operation.statement, detail: { before, memberId: operation.memberId }, byModel: false });
      return true;
    }
    case "expired": {
      const before = await snapshot(admin, householdId, [operation.id]);
      await admin.from("memories").update({ tier: "expired" }).eq("household_id", householdId).eq("id", operation.id);
      await setItems(admin, householdId, [operation.id], { status: "removed" });
      await logChange(admin, { householdId, runId, kind: "expired", memoryIds: [operation.id], statement: operation.statement, detail: { before, reason: operation.reason }, byModel: false });
      return true;
    }
    case "rested": {
      const before = await snapshot(admin, householdId, [operation.id]);
      await admin.from("memories").update({ tier: "resting" }).eq("household_id", householdId).eq("id", operation.id);
      await logChange(admin, { householdId, runId, kind: "rested", memoryIds: [operation.id], statement: operation.statement, detail: { before }, byModel: false });
      return true;
    }
    case "conflict": {
      // Already put to the household: nothing more to say tonight.
      const { data } = await admin.from("certification_items").select("id, status").eq("household_id", householdId).in("memory_id", operation.ids);
      const items = (data ?? []) as Row[];
      if (items.some((item) => item.status === "needs_review")) return false;
      const newer = [...operation.ids].sort((a, b) => (sourceOf.get(b)?.updatedAt ?? "").localeCompare(sourceOf.get(a)?.updatedAt ?? ""))[0]!;
      await setItems(admin, householdId, [newer], { status: "needs_review" });
      await logChange(admin, { householdId, runId, kind: "conflict", memoryIds: [...operation.ids], statement: operation.statement, detail: {}, byModel: false });
      return true;
    }
  }
}

// --- links ------------------------------------------------------------------------

async function saveLinks(admin: SupabaseClient, householdId: string, links: readonly HomeBrainLink[], liveItemIds: ReadonlySet<string>): Promise<number> {
  const { data } = await admin.from("homebrain_links").select("id, from_item, to_item").eq("household_id", householdId).limit(5000);
  const existing = (data ?? []) as Row[];
  // A link whose record has gone goes with it.
  const gone = existing.filter((row) => !liveItemIds.has(row.from_item as string) || !liveItemIds.has(row.to_item as string)).map((row) => row.id as string);
  for (let index = 0; index < gone.length; index += 100) await admin.from("homebrain_links").delete().eq("household_id", householdId).in("id", gone.slice(index, index + 100));
  const have = new Set(existing.map((row) => `${row.from_item}|${row.to_item}`));
  const fresh = links.filter((link) => !have.has(`${link.from}|${link.to}`));
  if (fresh.length === 0) return 0;
  const { error } = await admin.from("homebrain_links").insert(
    fresh.map((link) => ({ household_id: householdId, from_item: link.from, to_item: link.to, kind: link.kind, reason: link.reason, strength: link.strength, by_model: link.byModel })),
  );
  return error ? 0 : fresh.length;
}

/** Records a model may be shown for links: what the household lets leave, the things that make plans, at most 80. */
function linkCandidates(items: readonly HouseholdContextItem[], policy: DataUsePolicy, today: string): HouseholdContextItem[] {
  const wanted = new Set(["memory", "food_preference", "meal", "event", "consumable", "responsibility", "school_item"]);
  return items
    .filter((item) => wanted.has(item.entityType) && item.freshness !== "superseded" && policy.allowedClasses.includes(contentClassFor(item.privacyClass)))
    .filter((item) => !["meal", "event", "school_item"].includes(item.entityType) || String(item.attributes.date ?? "9999") >= today)
    .slice(0, 80);
}

// --- the night ------------------------------------------------------------------------

/** One household's sleep. Null when it already slept today, or when another instance is sleeping it. */
export async function sleepHousehold(admin: SupabaseClient, householdId: string, now: Date = new Date(), options: { model?: SleepModel | null } = {}): Promise<SleepResult | null> {
  const { data: household } = await admin.from("households").select("name, timezone").eq("id", householdId).maybeSingle();
  if (!household) return null;
  const timezone = (household as Row).timezone as string;
  const today = isoDateIn(now, timezone);

  const { data: run, error: claimError } = await admin.from("homebrain_runs").insert({ household_id: householdId, local_date: today }).select("id").single();
  if (claimError || !run) return null;
  const runId = (run as Row).id as string;
  const counts: Record<string, number> = {};
  const count = (key: string, by = 1) => {
    counts[key] = (counts[key] ?? 0) + by;
  };

  try {
    const [stored, { memories }, people, policy] = await Promise.all([
      rebuildHousehold(admin, householdId, now),
      readMemories(admin, householdId),
      readPeople(admin, householdId),
      loadDataUse(admin, householdId),
    ]);
    const items = stored?.items ?? [];
    const byItem = new Map(items.map((item) => [item.id, item]));

    // Meaning, where the household has a key that makes it and lets the words leave.
    const embedder = await embedderFor(householdId).catch(() => null);
    const embedding = embedder && routeToProvider({ provider: embedder.provider, keySource: "household", policy, hasContent: true }).ok ? embedder : null;
    if (embedding) {
      const refreshed = await refreshEmbeddings(admin, { householdId, items, embedder: embedding, allowed: policy.allowedClasses });
      count("embedded", refreshed.embedded);
    }
    const vectors = embedding ? await readVectors(admin, householdId, embedding.model, memories.map((memory) => itemIdOf(memory.id))) : new Map<string, number[]>();
    const similarity = vectors.size > 0 ? (a: string, b: string) => {
      const left = vectors.get(itemIdOf(a));
      const right = vectors.get(itemIdOf(b));
      return left && right ? cosine(left, right) : null;
    } : undefined;

    // The model, where the household's key and policy allow it.
    let model: SleepModel | null = options.model ?? null;
    if (options.model === undefined) {
      const key = resolveModelKey(await readHouseholdKey(householdId).catch(() => null), platformKey());
      const route = routeToProvider({ provider: key.provider, keySource: key.source, policy, hasContent: true });
      model = route.ok && key.provider && key.key ? createSleepModel(key.provider, key.key) : null;
    }

    const planOptions = { today, localDate: (iso: string) => isoDateIn(new Date(iso), timezone), similarity };
    let plan: SleepPlan = planSleep(memories, people, planOptions);
    const sourceOf = new Map(memories.map((memory) => [memory.id, memory]));
    if (model && (plan.borderline.length > 0 || plan.unread.length > 0)) {
      const names = namesIn(items);
      const pairs = plan.borderline
        .filter((pair) => mayLeave(pair.a, byItem, policy) && mayLeave(pair.b, byItem, policy))
        .map((pair) => ({ key: pairKey(pair.a, pair.b), a: withoutNames(statementOf(sourceOf.get(pair.a)!), names), b: withoutNames(statementOf(sourceOf.get(pair.b)!), names) }));
      const clauses = [...new Set(plan.unread.filter((entry) => mayLeave(entry.memoryId, byItem, policy)).map((entry) => entry.clause))];
      const labelled = people.map((person, index) => ({ label: `P${index + 1}`, id: person.id, name: person.displayName.split(/\s+/)[0]! }));
      const [judged, readByModel] = await Promise.all([model.judgeSame(pairs), model.readClauses(clauses, labelled)]);
      count("judged", judged.size);
      count("read_by_model", readByModel.size);
      plan = planSleep(memories, people, { ...planOptions, judged, readByModel: readByModel as Map<string, { subject: string; stance: Stance; object: string }[]> });
    }

    for (const operation of plan.operations) {
      try {
        if (await applyOperation(admin, householdId, runId, operation, sourceOf)) count(operation.kind);
      } catch (thrown) {
        count("failed");
        log.warn("homebrain sleep change failed", { kind: operation.kind, reason: thrown instanceof Error ? thrown.name : "unknown", allow: ["kind", "reason"] });
      }
    }

    // Associations across the home (REM): rules, then the model's, checked.
    const fresh = (await rebuildHousehold(admin, householdId, now))?.items ?? items;
    const links = ruleLinks(fresh);
    if (model) {
      const candidates = linkCandidates(fresh, policy, today);
      const names = namesIn(fresh);
      const labels = new Map(candidates.map((item, index) => [`I${index + 1}`, item]));
      const proposals = await model.proposeLinks([...labels.entries()].map(([label, item]) => ({ label, domain: item.domain, text: withoutNames(item.summary, names).slice(0, 200) })));
      // Names never left; the household reads its own back in the reason.
      const firstName = new Map(people.map((person) => [person.id, person.displayName.split(/\s+/)[0]!]));
      const named = validModelLinks(proposals, labels).map((link) => {
        const about = labels.size > 0 ? fresh.find((item) => item.id === link.from)?.subjectMemberIds ?? [] : [];
        const name = about.length === 1 ? firstName.get(about[0]!) : undefined;
        return name ? { ...link, reason: link.reason.replace(/\b[Ss]omeone\b/, name) } : link;
      });
      links.push(...named.filter((link) => !links.some((rule) => (rule.from === link.from && rule.to === link.to) || (rule.from === link.to && rule.to === link.from))));
    }
    count("linked", await saveLinks(admin, householdId, links, new Set(fresh.map((item) => item.id))));

    await admin.from("homebrain_runs").update({ outcome: "done", finished_at: new Date().toISOString(), counts, model_provider: model?.provider ?? null }).eq("id", runId);
    return { householdId, localDate: today, counts, modelProvider: model?.provider ?? null };
  } catch (thrown) {
    log.warn("homebrain sleep failed", { reason: thrown instanceof Error ? thrown.message.slice(0, 80) : "unknown", allow: ["reason"] });
    await admin.from("homebrain_runs").update({ outcome: "failed", finished_at: new Date().toISOString(), counts }).eq("id", runId);
    return null;
  }
}

// --- the body clock -----------------------------------------------------------------

/** The household's night: between 2 and 5 in the morning on its own clock. */
export const SLEEP_HOURS = { from: 2, to: 5 };

export function hourIn(now: Date, timezone: string): number {
  const hour = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: timezone }).format(now);
  return Number(hour);
}

/**
 * The households whose night it is and who have not slept yet today, at most
 * `limit` per tick of the delivery clock. Only households someone has used
 * this week are put to sleep: their stored context is warm.
 */
export async function sleepDueHouseholds(admin: SupabaseClient, now: Date = new Date(), limit = 2): Promise<SleepResult[]> {
  const { data: active } = await admin.from("household_context").select("household_id").gte("built_at", new Date(now.getTime() - 7 * 86_400_000).toISOString()).limit(500);
  const ids = ((active ?? []) as Row[]).map((row) => row.household_id as string);
  if (ids.length === 0) return [];
  const { data: households } = await admin.from("households").select("id, timezone").in("id", ids);
  const night = ((households ?? []) as Row[]).filter((row) => {
    const hour = hourIn(now, row.timezone as string);
    return hour >= SLEEP_HOURS.from && hour < SLEEP_HOURS.to;
  });
  if (night.length === 0) return [];
  const { data: runs } = await admin.from("homebrain_runs").select("household_id, local_date").in("household_id", night.map((row) => row.id as string)).gte("local_date", isoDateIn(new Date(now.getTime() - 86_400_000), "UTC"));
  const slept = new Set(((runs ?? []) as Row[]).map((row) => `${row.household_id}|${row.local_date}`));
  const due = night.filter((row) => !slept.has(`${row.id}|${isoDateIn(now, row.timezone as string)}`)).slice(0, limit);
  const results: SleepResult[] = [];
  for (const row of due) {
    const result = await sleepHousehold(admin, row.id as string, now);
    if (result) results.push(result);
  }
  return results;
}

