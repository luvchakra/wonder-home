#!/usr/bin/env node
/**
 * PostgREST embed ambiguity lint.
 *
 * This exists because of a bug that reached production and that no other gate
 * could have caught. `listMemberships` embedded `households(...)` from
 * `household_members`, and two foreign keys connect those tables — a member
 * belongs to a household, and a household names one member as its owner. Faced
 * with two candidates PostgREST does not guess: it rejects the entire request
 * with PGRST201, so every signed-in page returned a server error.
 *
 * Nothing in the SQL is wrong, which is why the database tests passed. The
 * ambiguity is a property of the REST layer, and it only appears when a real
 * PostgREST resolves the query — which no unit test, typecheck or migration
 * lint does.
 *
 * So the check is done statically instead: read the foreign keys out of the
 * committed migrations, read the embeds out of the `.select()` strings, and
 * require an explicit constraint name wherever more than one relationship could
 * satisfy the embed.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const MIGRATIONS = join(ROOT, "supabase/migrations");
const SOURCE = /\.(ts|tsx)$/;
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build", "coverage"]);

/** Embed modifiers that are not constraint names. */
const MODIFIERS = new Set(["inner", "left"]);

/**
 * Every foreign key in the schema as { child, parent, constraint }.
 *
 * Both spellings are collected: the inline `col uuid references public.t(id)`
 * form and the `add constraint name foreign key (col) references public.t(id)`
 * form, since the schema uses whichever reads better at the point of use.
 */
export function foreignKeysIn(sql) {
  const keys = [];
  const stripped = sql.replace(/--[^\n]*/g, "");

  // create table public.x ( ... ) blocks, for the inline references form.
  const tableBlocks = [...stripped.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)\s*\(/gi)];
  for (const block of tableBlocks) {
    const table = block[1];
    const body = balancedBody(stripped, block.index + block[0].length - 1);
    if (body === null) continue;

    for (const match of body.matchAll(/references\s+public\.(\w+)\s*\(/gi)) {
      keys.push({ child: table, parent: match[1], constraint: null });
    }
  }

  for (const match of stripped.matchAll(
    /alter\s+table\s+(?:only\s+)?public\.(\w+)\s+add\s+constraint\s+(\w+)\s+foreign\s+key\s*\([^)]*\)\s*references\s+public\.(\w+)/gi,
  )) {
    keys.push({ child: match[1], parent: match[3], constraint: match[2] });
  }

  return keys;
}

function balancedBody(text, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < text.length; i += 1) {
    if (text[i] === "(") depth += 1;
    else if (text[i] === ")") {
      depth -= 1;
      if (depth === 0) return text.slice(openIndex + 1, i);
    }
  }
  return null;
}

/** How many relationships connect two tables, in either direction. */
export function relationshipCount(keys, a, b) {
  return keys.filter(
    (key) => (key.child === a && key.parent === b) || (key.child === b && key.parent === a),
  ).length;
}

/**
 * The `.from("table")` / `.select("…")` pairs in a source file.
 *
 * The chain is read in order rather than parsed: a `.select()` always follows
 * the `.from()` it belongs to, and this lint only needs the pairing.
 */
export function selectCalls(source) {
  const calls = [];
  const pattern = /\.from\(\s*"(\w+)"\s*\)([\s\S]{0,400}?)\.select\(\s*(?:\n\s*)?"([^"]*)"/g;

  for (const match of source.matchAll(pattern)) {
    calls.push({ table: match[1], select: match[3] });
  }
  return calls;
}

/** Top-level embedded resources in a select string, ignoring nested columns. */
export function embedsIn(select) {
  const embeds = [];
  let depth = 0;
  let token = "";

  for (const character of select) {
    if (character === "(") {
      if (depth === 0 && token.trim()) embeds.push(token.trim());
      depth += 1;
      token = "";
      continue;
    }
    if (character === ")") {
      depth -= 1;
      token = "";
      continue;
    }
    if (depth === 0) {
      if (character === ",") token = "";
      else token += character;
    }
  }

  return embeds.map((raw) => {
    const [name, ...modifiers] = raw.split("!").map((part) => part.trim());
    return {
      raw,
      table: name ?? raw,
      // A modifier that is not `inner`/`left` is a constraint name, which is
      // exactly what disambiguates the embed.
      constraint: modifiers.find((modifier) => !MODIFIERS.has(modifier)) ?? null,
    };
  });
}

export function lintSelects(file, source, keys) {
  const problems = [];

  for (const call of selectCalls(source)) {
    for (const embed of embedsIn(call.select)) {
      const relationships = relationshipCount(keys, call.table, embed.table);
      if (relationships <= 1 || embed.constraint) continue;

      problems.push(
        `${file}: embedding "${embed.table}" in a query on "${call.table}" is ambiguous — ` +
          `${relationships} foreign keys connect them, so PostgREST rejects the request (PGRST201). ` +
          `Name the relationship, e.g. "${embed.table}!<constraint_name>(…)".`,
      );
    }
  }

  return problems;
}

function* walk(directory) {
  for (const entry of readdirSync(directory)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (SOURCE.test(entry)) yield full;
  }
}

function main() {
  const keys = readdirSync(MIGRATIONS)
    .filter((file) => file.endsWith(".sql"))
    .flatMap((file) => foreignKeysIn(readFileSync(join(MIGRATIONS, file), "utf8")));

  const problems = [];
  let checked = 0;

  for (const base of ["apps", "packages"]) {
    let exists = true;
    try {
      statSync(join(ROOT, base));
    } catch {
      exists = false;
    }
    if (!exists) continue;

    for (const full of walk(join(ROOT, base))) {
      checked += 1;
      problems.push(...lintSelects(relative(ROOT, full), readFileSync(full, "utf8"), keys));
    }
  }

  if (problems.length > 0) {
    console.error("PostgREST embed lint failed:");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }

  console.log(`PostgREST embed lint passed (${checked} files, ${keys.length} foreign keys).`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  main();
}
