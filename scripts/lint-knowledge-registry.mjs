#!/usr/bin/env node
/**
 * The household record index's coverage gate (design/HOUSEHOLD-RECORD-INDEX.md).
 *
 *   1. Every table a migration creates with a `household_id` is named in
 *      `packages/core/src/knowledge/registry.ts`: read by a builder, read by
 *      the registry, or excluded with a reason. A new feature cannot ship
 *      invisible to HomeTalk.
 *   2. The registry names no table that no migration creates (a stale entry).
 *   3. Every table read as knowledge (`builder` or `registry`) carries the
 *      `wh.mark_context_stale` trigger, so a write that goes round a service
 *      still marks HomeBrain's stored context stale.
 *   4. Every `registry` table in a stored domain (not people or health, which
 *      are read live for the person asking) carries the `wh.queue_knowledge`
 *      trigger, so its facts are written when its records are (Phase 2).
 */
import { readdirSync, readFileSync } from "node:fs";

const MIGRATIONS = new URL("../supabase/migrations/", import.meta.url).pathname;
const REGISTRY = new URL("../packages/core/src/knowledge/registry.ts", import.meta.url).pathname;

export function householdTables(migrations) {
  const tables = new Map();
  for (const [, raw] of migrations) {
    const sql = raw.replace(/--[^\n]*/g, "");
    for (const match of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)\s*\(/gi)) {
      const body = bodyAt(sql, match.index + match[0].length - 1);
      tables.set(match[1], /\bhousehold_id\b/.test(body ?? ""));
    }
    for (const match of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?(\w+)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?household_id\b/gi)) tables.set(match[1], true);
    for (const match of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?(\w+)\s+rename\s+to\s+(\w+)/gi)) {
      if (tables.has(match[1])) {
        tables.set(match[2], tables.get(match[1]));
        tables.delete(match[1]);
      }
    }
    for (const match of sql.matchAll(/drop\s+table\s+(?:if\s+exists\s+)?(?:public\.)?(\w+)/gi)) tables.delete(match[1]);
  }
  return new Set([...tables.entries()].filter(([, tenant]) => tenant).map(([name]) => name));
}

/** Tables a migration gives a trigger function (`wh.<fn>`), by name in an array or a direct `create trigger`. */
export function staleTriggered(migrations, fn = "mark_context_stale") {
  const triggered = new Set();
  const named = new RegExp(fn);
  const direct = new RegExp(`create\\s+(?:or\\s+replace\\s+)?trigger\\s+\\w+[\\s\\S]*?\\bon\\s+(?:public\\.)?(\\w+)[\\s\\S]*?execute\\s+function\\s+wh\\.${fn}`, "gi");
  for (const [, raw] of migrations) {
    const sql = raw.replace(/--[^\n]*/g, "");
    if (!named.test(sql)) continue;
    for (const block of sql.matchAll(/foreach\s+\w+\s+in\s+array\s+array\s*\[([\s\S]*?)\]\s*loop([\s\S]*?)end\s+loop/gi)) {
      if (!named.test(block[2])) continue;
      for (const name of block[1].matchAll(/'(\w+)'/g)) triggered.add(name[1]);
    }
    for (const match of sql.matchAll(direct)) triggered.add(match[1]);
  }
  return triggered;
}

/** Domains read live for the person asking (`homebrain/context-store.ts` LIVE_DOMAINS): their tables have no stored facts. */
const LIVE_DOMAINS = new Set(["people", "notifications", "hometalk", "health", "attention"]);

/** `registry` tables whose facts are written when their records are (`knowledge/facts.ts` FACT_TABLES). */
export function factTables(source) {
  const tables = new Set();
  const body = source.slice(source.indexOf("export const KNOWLEDGE_REGISTRY"));
  for (const match of body.matchAll(/^ {2}(\w+): \{\s*covered: "registry",\s*domain: "(\w+)"/gm)) if (!LIVE_DOMAINS.has(match[2])) tables.add(match[1]);
  return tables;
}

export function registryEntries(source) {
  const entries = new Map();
  const start = source.indexOf("export const KNOWLEDGE_REGISTRY");
  const body = source.slice(start);
  for (const match of body.matchAll(/^ {2}(\w+): \{\s*covered: "(builder|registry|excluded)"([^\n]*)/gm)) entries.set(match[1], /\blive: true\b/.test(match[3]) ? "live" : match[2]);
  return entries;
}

export function lintKnowledge(migrations, registrySource) {
  const problems = [];
  const tables = householdTables(migrations);
  const entries = registryEntries(registrySource);
  const triggered = staleTriggered(migrations);
  for (const table of [...tables].sort()) {
    if (!entries.has(table)) problems.push(`${table}: holds household records but is not in knowledge/registry.ts (add it as builder, registry or excluded with a reason)`);
  }
  for (const [table, covered] of [...entries.entries()].sort()) {
    if (!tables.has(table)) problems.push(`${table}: named in knowledge/registry.ts but no migration creates it with a household_id`);
    else if (covered !== "excluded" && covered !== "live" && !triggered.has(table)) problems.push(`${table}: read as knowledge (${covered}) but has no wh.mark_context_stale trigger; add it in a migration`);
  }
  const queued = staleTriggered(migrations, "queue_knowledge");
  for (const table of [...factTables(registrySource)].sort()) {
    if (tables.has(table) && !queued.has(table)) problems.push(`${table}: a registry table in a stored domain but has no wh.queue_knowledge trigger; add it in a migration so its facts are written`);
  }
  return problems;
}

function bodyAt(sql, open) {
  let depth = 0;
  for (let i = open; i < sql.length; i += 1) {
    if (sql[i] === "(") depth += 1;
    else if (sql[i] === ")") {
      depth -= 1;
      if (depth === 0) return sql.slice(open + 1, i);
    }
  }
  return null;
}

function main() {
  const files = readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql")).sort();
  const migrations = files.map((name) => [name, readFileSync(MIGRATIONS + name, "utf8")]);
  const problems = lintKnowledge(migrations, readFileSync(REGISTRY, "utf8"));
  if (problems.length > 0) {
    console.error(`Knowledge registry lint failed (${problems.length}):\n${problems.map((line) => `  - ${line}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`Knowledge registry lint passed (${householdTables(migrations).size} household tables, every one named).`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
