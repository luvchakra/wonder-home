#!/usr/bin/env node
/**
 * Verifies the privileged server paths against a real Supabase project.
 *
 * The database tests prove the policies; this proves the deployment actually
 * matches them — that every migration reached the project, that the service-role
 * path works, and that an anonymous caller is refused the things it should be.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY, so it never runs in CI: the key bypasses
 * RLS entirely and does not belong in a shared runner. Without it the script
 * skips rather than failing, because "we could not check" and "the check failed"
 * are different answers.
 *
 *   npm run verify:live
 */
import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

/** Tables the application ships. A missing one means a migration never landed. */
const SHIPPED_TABLES = [
  "profiles",
  "households",
  "household_members",
  "household_roles",
  "household_invitations",
  "member_guardians",
  "audit_events",
  "idempotency_keys",
  "platform_admins",
  "support_access_grants",
  "home_assets",
  "service_requests",
  "laundry_needs",
  "pets",
  "pet_care_needs",
  "home_device_signals",
  "plans",
  "plan_features",
  "household_subscriptions",
  "usage_counters",
  "integrations",
  "integration_events",
  "integration_identities",
  "school_enrolments",
  "school_items",
  "study_sessions",
  "school_documents",
  "school_communications",
  "consumables",
  "consumable_purchases",
  "purchase_policies",
  "cart_suggestions",
  "merchant_offers",
  "orders",
  "order_items",
  "recipes",
  "recipe_ingredients",
  "food_preferences",
  "meals",
  "meal_ingredient_needs",
  "obligations",
  "obligation_history",
  "payment_intents",
  "payment_attempts",
  "spend_anomalies",
  "budgets",
  "family_events",
  "event_participants",
  "schedule_conflicts",
  "gift_plans",
];

/**
 * Every embedded read the application performs, run against the real PostgREST.
 *
 * This exists because an embed can be perfectly valid SQL and still be rejected
 * by PostgREST: where two foreign keys connect the same pair of tables it
 * answers PGRST201 rather than guessing which one was meant. That happened to
 * `household_members` -> `households`, and it broke every signed-in page while
 * every SQL-level test stayed green.
 *
 * The ambiguity is resolved before RLS, so the publishable key is enough to
 * check it — no session, and no rows required.
 */
const EMBEDDED_READS = [
  {
    name: "memberships embed resolves",
    table: "household_members",
    select:
      "id, display_name, member_type, households!household_members_household_id_fkey(id, name, timezone, status, owner_member_id), household_roles(role)",
  },
  {
    name: "members embed resolves",
    table: "household_members",
    select: "id, display_name, member_type, status, household_roles(role)",
  },
  {
    name: "children embed resolves",
    table: "household_members",
    select:
      "id, display_name, date_of_birth, member_guardians!member_guardians_child_member_id_fkey(guardian_member_id)",
  },
  {
    name: "family events embed resolves",
    table: "family_events",
    select:
      "id, title, kind, starts_at, ends_at, protected, owner_member_id, status, action_state, action_due_at, event_participants(member_id, response, required)",
  },
  {
    name: "meals embed resolves",
    table: "meals",
    select:
      "id, name, slot, on_date, ready_by, cook_member_id, status, ready_at, recipes(id, name, active_minutes, total_minutes, serves), meal_ingredient_needs(name, consumable_id, quantity, unit, essential, status, substitute_name)",
  },
  {
    name: "pet care embed resolves",
    table: "pet_care_needs",
    select:
      "id, kind, interval_days, last_done_on, due_on, responsible_member_id, supply_days_remaining, pets!inner(id, name, species)",
  },
];

function loadEnv() {
  const fromProcess = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishable: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    serviceRole: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  if (fromProcess.url && fromProcess.publishable && fromProcess.serviceRole) return fromProcess;

  try {
    const file = readFileSync(`${ROOT}/apps/web/.env.local`, "utf8");
    const parsed = Object.fromEntries(
      file
        .split("\n")
        .filter((line) => line.includes("=") && !line.trimStart().startsWith("#"))
        .map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim()]),
    );
    return {
      url: fromProcess.url ?? parsed.NEXT_PUBLIC_SUPABASE_URL,
      publishable: fromProcess.publishable ?? parsed.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      serviceRole: fromProcess.serviceRole ?? parsed.SUPABASE_SERVICE_ROLE_KEY,
    };
  } catch {
    return fromProcess;
  }
}

async function main() {
  const env = loadEnv();

  if (!env.serviceRole || !env.url || !env.publishable) {
    console.log(
      "Skipping live verification: set NEXT_PUBLIC_SUPABASE_URL, " +
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY to run it.",
    );
    return;
  }

  const admin = createClient(env.url, env.serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anon = createClient(env.url, env.publishable);

  const results = [];
  const check = (name, ok, detail = "") => results.push({ name, ok, detail });

  const adminRead = await admin.from("households").select("id").limit(1);
  check("service-role client reaches the schema", !adminRead.error, adminRead.error?.message ?? "");

  const anonRead = await anon.from("households").select("id").limit(1);
  check(
    "anonymous client sees no households",
    !anonRead.error && (anonRead.data?.length ?? 0) === 0,
    anonRead.error?.message ?? `rows=${anonRead.data?.length}`,
  );

  for (const table of SHIPPED_TABLES) {
    const { error } = await admin.from(table).select("*", { head: true, count: "exact" });
    check(`migration landed: ${table}`, !error, error?.message ?? "");
  }

  for (const read of EMBEDDED_READS) {
    const { error } = await anon.from(read.table).select(read.select).limit(1);
    // PGRST201 is the ambiguity; anything else here would be a real failure too.
    check(read.name, !error, error?.code ? `${error.code}: ${error.message}` : "");
  }

  const rpc = await anon.rpc("create_household", {
    p_household_name: "Should Not Exist",
    p_display_name: "Nobody",
    p_timezone: "Asia/Kolkata",
  });
  check("anonymous cannot create a household", Boolean(rpc.error), rpc.error?.code ?? "no error");

  const forged = await anon.from("audit_events").insert({
    household_id: "00000000-0000-4000-8000-000000000000",
    event_type: "forged.event",
  });
  check("anonymous cannot forge an audit event", Boolean(forged.error), forged.error?.code ?? "no error");

  for (const { name, ok, detail } of results) {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  }

  const passed = results.filter((result) => result.ok).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  if (passed !== results.length) process.exit(1);
}

main().catch((error) => {
  // Never print the error object: it can carry request headers, and those carry keys.
  console.error(`Live verification failed: ${error instanceof Error ? error.name : "unknown error"}`);
  process.exit(1);
});
