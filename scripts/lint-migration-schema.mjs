#!/usr/bin/env node
/**
 * Migration conventions lint (CI gate for stories 00-004 and 00-006).
 *
 * Enforces the rules in database/SUPABASE-DATABASE.md that are cheap to check
 * statically and expensive to discover in production:
 *
 *   1. Migration filenames are `<14-digit timestamp>_<snake_case>.sql`, so the
 *      apply order is unambiguous, and no two files share a timestamp: the
 *      live history (`supabase_migrations.schema_migrations`) keys on it.
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
 *   plans                     — platform-level plan catalogue
 *   plan_features             — what a plan allows; a property of the plan, not a tenant
 *   plan_policy_events        — staff changes to a plan's usage policy; a plan belongs to no household
 *   entitlement_experiments   — an experiment spans every household on the plans it names; assignment is computed, not stored
 *   entitlement_experiment_events — staff changes to an experiment; platform-level like the experiment itself
 *   platform_admins           — the separate platform-admin boundary
 *   homesend_share_handoffs   — a share sheet staged before sign-in; no household is known yet
 *   rate_limit_counters       — request counters keyed by a bucket and a subject (member, household or IP hash); some subjects have no household
 *   plan_prices               — what a plan costs; a property of the plan, not a tenant
 *   payment_provider_plans    — which provider plan/price backs one of those prices; platform configuration
 *   public_holidays           — a sourced, read-only list of a country's holidays; the same for every household
 */
const NON_TENANT_TABLES = new Set([
  "households",
  "profiles",
  "plans",
  "plan_features",
  "plan_policy_events",
  "entitlement_experiments",
  "entitlement_experiment_events",
  "platform_admins",
  "homesend_share_handoffs",
  "rate_limit_counters",
  // Keyed by an API key's fingerprint: one key can serve the platform or several households; households are matched at read time.
  "ai_key_alerts",
  "plan_prices",
  "payment_provider_plans",
  "public_holidays",
  // One reconciliation pass per provider across every household (story 20-011); its findings carry household_id.
  "billing_reconciliation_runs",
  // The shared grocery catalog (HomeFood 25-006): open data every household reads and none writes.
  "grocery_catalog",
  // USDA FoodData Central foods (25-006/25-031): public-domain reference data a member reads once a curated item links to it.
  "usda_foods",
  // IFCT 2017 (ICMR-NIN) Indian foods, linked from the catalog (25-009): reference data every household reads.
  "ifct_foods",
  // The shared recipe catalog (HomeFood 25-022): dishes every household reads and none writes; a household's own copy is a `recipes` row.
  "recipe_catalog",
  "recipe_catalog_ingredients",
  // The cat's sayings (08-018): WonderHome's own list every household reads and none writes; what a child heard is per household.
  "companion_sayings",
  // The WonderJobs career-site key setting and its audit trail (careers, 2026-10-21): one per deployment, service role only.
  "careers_settings",
  "platform_settings",
  "platform_setting_events",
  "careers_key_events",
  // The OAuth client Swiggy registered for this deployment's Instamart redirect URI (25-032): one per deployment, service role only.
  "instamart_oauth_clients",
  // When each background step last ran on the GitHub runner (2026-11-07): platform-level, service role only, counts only.
  "platform_job_heartbeats",
  // Settings saved in the platform admin instead of Vercel (16-010): one per deployment, service role only.
  "platform_config",
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

/**
 * Two files with one timestamp apply in an order their names no longer state,
 * and only one of them can be recorded in `supabase_migrations.schema_migrations`,
 * whose primary key is the version (the 2026-11-07 clash of `child_trivia`
 * and `homesend_learned_defaults`, both 20261107233000).
 */
export function duplicateVersions(filenames) {
  const byVersion = new Map();
  for (const name of filenames) {
    const version = name.slice(0, 14);
    if (!/^\d{14}$/.test(version)) continue;
    byVersion.set(version, [...(byVersion.get(version) ?? []), name]);
  }
  return [...byVersion.entries()]
    .filter(([, names]) => names.length > 1)
    .map(
      ([version, names]) =>
        `version ${version} is used by ${names.length} files: ${names.join(", ")} (rename all but one)`,
    );
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

  const problems = [
    ...duplicateVersions(files),
    ...files.flatMap((name) => lintMigrationSource(name, readFileSync(join(MIGRATIONS_DIR, name), "utf8"))),
  ];

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
