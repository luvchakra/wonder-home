#!/usr/bin/env node
/**
 * Migration conventions lint (CI gate for stories 00-004 and 00-006).
 *
 * Enforces the rules in database/SUPABASE-DATABASE.md that are cheap to check
 * statically and expensive to discover in production:
 *
 *   1. Migration filenames are `<14-digit timestamp>_<snake_case>.sql`, so the
 *      apply order is unambiguous.
 *   2. Every created table enables row level security. RLS is defense in depth,
 *      but a table that never enables it has no second line at all.
 *   3. Every household-owned table carries a household_id column.
 *   4. Every SECURITY DEFINER function pins search_path, so a caller cannot
 *      redirect the identifiers a policy helper resolves.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = new URL("../supabase/migrations/", import.meta.url).pathname;
const FILENAME = /^\d{14}_[a-z0-9_]+\.sql$/;

/**
 * Tables that legitimately carry no household_id, each for a stated reason:
 *   households      — the tenant root; its own id IS the household id
 *   profiles        — a person, who may belong to several households
 *   plans           — platform-level plan catalogue
 *   plan_features   — what a plan allows; a property of the plan, not a tenant
 *   platform_admins — the separate platform-admin boundary
 */
const NON_TENANT_TABLES = new Set([
  "households",
  "profiles",
  "plans",
  "plan_features",
  "platform_admins",
]);

export function lintMigrationSource(filename, sql) {
  const problems = [];

  if (!FILENAME.test(filename)) {
    problems.push(`${filename}: filename must match <14-digit timestamp>_<snake_case>.sql`);
  }

  const stripped = sql.replace(/--[^\n]*/g, "");

  const created = [...stripped.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([\w.]+)/gi)].map(
    (match) => match[1],
  );
  const rlsEnabled = new Set(
    [...stripped.matchAll(/alter\s+table\s+([\w.]+)\s+enable\s+row\s+level\s+security/gi)].map(
      (match) => match[1],
    ),
  );

  for (const table of created) {
    const bare = table.includes(".") ? table.split(".").pop() : table;
    if (!rlsEnabled.has(table)) {
      problems.push(`${filename}: table ${table} is created but never enables row level security`);
    }
    if (!NON_TENANT_TABLES.has(bare)) {
      const body = tableBody(stripped, table);
      if (body !== null && !/\bhousehold_id\b/.test(body)) {
        problems.push(
          `${filename}: table ${table} has no household_id column ` +
            `(add one, or list it in NON_TENANT_TABLES with a reason)`,
        );
      }
    }
  }

  const definers = [...stripped.matchAll(/create\s+(?:or\s+replace\s+)?function\s+([\w.]+)[\s\S]*?\$\$/gi)];
  for (const match of definers) {
    const block = match[0];
    if (/security\s+definer/i.test(block) && !/set\s+search_path/i.test(block)) {
      problems.push(`${filename}: SECURITY DEFINER function ${match[1]} does not pin search_path`);
    }
  }

  return problems;
}

/** Returns the parenthesised column list of a `create table` statement. */
function tableBody(sql, table) {
  const start = sql.search(
    new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?${table.replace(".", "\\.")}\\s*\\(`, "i"),
  );
  if (start === -1) return null;
  const open = sql.indexOf("(", start);
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
  let files;
  try {
    files = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql"));
  } catch {
    console.log("No supabase/migrations directory yet — nothing to lint.");
    return;
  }

  const problems = files.flatMap((name) =>
    lintMigrationSource(name, readFileSync(join(MIGRATIONS_DIR, name), "utf8")),
  );

  if (problems.length > 0) {
    console.error("Migration lint failed:");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log(`Migration lint passed (${files.length} migration${files.length === 1 ? "" : "s"}).`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  main();
}
