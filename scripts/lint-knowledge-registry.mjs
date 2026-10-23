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

/** Tables a migration gives the context-stale trigger, by name in an array or a direct `create trigger`. */
export function staleTriggered(migrations) {
  const triggered = new Set();
  for (const [, raw] of migrations) {
    const sql = raw.replace(/--[^\n]*/g, "");
    if (!/mark_context_stale/.test(sql)) continue;
    for (const block of sql.matchAll(/foreach\s+\w+\s+in\s+array\s+array\s*\[([\s\S]*?)\]\s*loop([\s\S]*?)end\s+loop/gi)) {
      if (!/mark_context_stale/.test(block[2])) continue;
      for (const name of block[1].matchAll(/'(\w+)'/g)) triggered.add(name[1]);
    }
    for (const match of sql.matchAll(/create\s+(?:or\s+replace\s+)?trigger\s+\w+[\s\S]*?\bon\s+(?:public\.)?(\w+)[\s\S]*?execute\s+function\s+wh\.mark_context_stale/gi)) triggered.add(match[1]);
  }
  return triggered;
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
