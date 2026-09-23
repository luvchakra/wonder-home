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
  "household_ai_credentials",
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
  "step_up_verifications",
  "privacy_requests",
  "household_feature_flags",
  "home_send_items",
  "homesend_changes",
  "homesend_addresses",
  "homesend_share_handoffs",
  "household_webhooks",
  "webhook_deliveries",
  "health_profiles",
  "health_provenance",
  "health_consents",
  "health_appointments",
  "health_issues",
  "health_checkups",
  "health_records",
  "health_measurement_routines",
  "health_vitals",
  "health_fitness_goals",
  "health_fitness_sessions",
];

/**
 * A column from an `alter table` migration, checked the same way a table is:
 * a missing table means a migration never landed, and a missing column is
 * the exact same failure for the migrations that only add to one — nothing
 * in `SHIPPED_TABLES` would ever catch it, since the table it alters
 * already existed. Found the hard way: three stories' migrations sat as
 * files only, `Done` in the trackers, never once applied to this project,
 * until a fourth story tried to actually use one of them.
 */
const SHIPPED_COLUMNS = [
  { table: "agent_runs", column: "contracts" },
  { table: "household_members", column: "nickname" },
  { table: "household_members", column: "avatar_path" },
  { table: "household_members", column: "gender" },
  { table: "pets", column: "gender" },
  { table: "notification_preferences", column: "target" },
  { table: "recipes", column: "calories_per_serving" },
  { table: "households", column: "key_member_id" },
  { table: "home_send_items", column: "security_status" },
  { table: "home_send_items", column: "external_id" },
  { table: "home_send_items", column: "understanding" },
  { table: "home_send_items", column: "content_hash" },
  { table: "home_send_items", column: "failure_reason" },
  { table: "home_send_items", column: "source_url" },
  { table: "home_send_items", column: "transcript_confidence" },
  { table: "home_send_items", column: "parent_item_id" },
  { table: "homesend_share_handoffs", column: "ip_hash" },
  { table: "homesend_changes", column: "change_type" },
  { table: "homesend_changes", column: "previous" },
  { table: "home_send_items", column: "review_decision" },
  { table: "home_send_items", column: "review_proposal" },
  { table: "home_send_items", column: "review_subject" },
  { table: "home_send_items", column: "review_corrected" },
  { table: "home_send_items", column: "reviewed_at" },
  { table: "health_appointments", column: "checkup_id" },
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

  for (const { table, column } of SHIPPED_COLUMNS) {
    const { error } = await admin.from(table).select(column, { head: true, count: "exact" });
    check(`migration landed: ${table}.${column}`, !error, error?.message ?? "");
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

  const seen = await anon.rpc("mark_member_seen", { p_household_id: "00000000-0000-4000-8000-000000000000" });
  check("anonymous cannot record a first sign-in", Boolean(seen.error), seen.error?.code ?? "no error");

  // The table that holds a household's own model key has no SELECT policy at
  // all. Row level security answers that by returning no rows rather than by
  // raising — so "no rows and no error" is the property to assert, and an
  // error here would actually be the weaker result.
  const keys = await anon.from("household_ai_credentials").select("api_key").limit(1);
  check(
    "nobody can read a household's model key",
    Boolean(keys.error) || (Array.isArray(keys.data) && keys.data.length === 0),
    keys.error ? keys.error.code : `${keys.data?.length ?? "?"} rows`,
  );

  // household_webhooks has no client reach at all (story 18-007) -- not just
  // no SELECT policy, no INSERT/UPDATE/DELETE policy either, for the reason
  // its own migration comment gives: only the service-role client ever
  // writes it, and a WHERE-conditioned write on a no-SELECT-policy table
  // silently no-ops for every session anyway.
  const webhookSecrets = await anon.from("household_webhooks").select("secret").limit(1);
  check(
    "nobody can read a webhook signing secret",
    Boolean(webhookSecrets.error) || (Array.isArray(webhookSecrets.data) && webhookSecrets.data.length === 0),
    webhookSecrets.error ? webhookSecrets.error.code : `${webhookSecrets.data?.length ?? "?"} rows`,
  );
  const forgedWebhook = await anon.from("household_webhooks").insert({
    household_id: "00000000-0000-4000-8000-000000000000",
    url: "https://example.com/forged",
    secret: "a-secret-that-is-at-least-thirty-two-characters",
    event_types: ["member.added"],
  });
  check("anonymous cannot create a webhook subscription", Boolean(forgedWebhook.error), forgedWebhook.error?.code ?? "no error");

  // Health profiles (story 21-001). RLS gates SELECT through wh.may_see_health,
  // which never grants an anonymous caller (not a household member at all)
  // anything — asserted the same way as every other RLS-only table: no rows
  // and no error, since RLS answers by filtering, not by raising.
  const healthProfiles = await anon.from("health_profiles").select("id, privacy_scope").limit(1);
  check(
    "anonymous cannot read a household's health profiles",
    Boolean(healthProfiles.error) || (Array.isArray(healthProfiles.data) && healthProfiles.data.length === 0),
    healthProfiles.error ? healthProfiles.error.code : `${healthProfiles.data?.length ?? "?"} rows`,
  );
  const forgedHealthProfile = await anon.from("health_profiles").insert({
    household_id: "00000000-0000-4000-8000-000000000000",
    member_id: "00000000-0000-4000-8000-000000000000",
    privacy_scope: "private",
  });
  check(
    "anonymous cannot create a health profile",
    Boolean(forgedHealthProfile.error),
    forgedHealthProfile.error?.code ?? "no error",
  );

  // Health appointments (story 21-002) — same RLS shape as health_profiles.
  const healthAppointments = await anon.from("health_appointments").select("id, appointment_type").limit(1);
  check(
    "anonymous cannot read a household's health appointments",
    Boolean(healthAppointments.error) || (Array.isArray(healthAppointments.data) && healthAppointments.data.length === 0),
    healthAppointments.error ? healthAppointments.error.code : `${healthAppointments.data?.length ?? "?"} rows`,
  );

  // Health issues (story 21-003) — same RLS shape as health_profiles.
  const healthIssues = await anon.from("health_issues").select("id, label").limit(1);
  check(
    "anonymous cannot read a household's health issues",
    Boolean(healthIssues.error) || (Array.isArray(healthIssues.data) && healthIssues.data.length === 0),
    healthIssues.error ? healthIssues.error.code : `${healthIssues.data?.length ?? "?"} rows`,
  );
  const forgedHealthIssue = await anon.from("health_issues").insert({
    household_id: "00000000-0000-4000-8000-000000000000",
    member_id: "00000000-0000-4000-8000-000000000000",
    label: "Forged",
  });
  check(
    "anonymous cannot create a health issue",
    Boolean(forgedHealthIssue.error),
    forgedHealthIssue.error?.code ?? "no error",
  );

  // Health checkups (story 21-004) — same RLS shape as health_profiles.
  const healthCheckups = await anon.from("health_checkups").select("id, label").limit(1);
  check(
    "anonymous cannot read a household's health checkups",
    Boolean(healthCheckups.error) || (Array.isArray(healthCheckups.data) && healthCheckups.data.length === 0),
    healthCheckups.error ? healthCheckups.error.code : `${healthCheckups.data?.length ?? "?"} rows`,
  );
  const forgedHealthCheckup = await anon.from("health_checkups").insert({
    household_id: "00000000-0000-4000-8000-000000000000",
    member_id: "00000000-0000-4000-8000-000000000000",
    label: "Forged",
    next_due_on: new Date().toISOString().slice(0, 10),
  });
  check(
    "anonymous cannot create a health checkup",
    Boolean(forgedHealthCheckup.error),
    forgedHealthCheckup.error?.code ?? "no error",
  );

  // Health records (story 21-005) — same RLS shape as health_profiles.
  const healthRecords = await anon.from("health_records").select("id, label").limit(1);
  check(
    "anonymous cannot read a household's health records",
    Boolean(healthRecords.error) || (Array.isArray(healthRecords.data) && healthRecords.data.length === 0),
    healthRecords.error ? healthRecords.error.code : `${healthRecords.data?.length ?? "?"} rows`,
  );
  const forgedHealthRecord = await anon.from("health_records").insert({
    household_id: "00000000-0000-4000-8000-000000000000",
    member_id: "00000000-0000-4000-8000-000000000000",
    label: "Forged",
    record_type: "other",
  });
  check(
    "anonymous cannot create a health record",
    Boolean(forgedHealthRecord.error),
    forgedHealthRecord.error?.code ?? "no error",
  );

  // Measurement routines (story 21-007) — same RLS shape as health_profiles.
  const healthRoutines = await anon.from("health_measurement_routines").select("id, vital_type").limit(1);
  check(
    "anonymous cannot read a household's measurement routines",
    Boolean(healthRoutines.error) || (Array.isArray(healthRoutines.data) && healthRoutines.data.length === 0),
    healthRoutines.error ? healthRoutines.error.code : `${healthRoutines.data?.length ?? "?"} rows`,
  );
  const forgedHealthRoutine = await anon.from("health_measurement_routines").insert({
    household_id: "00000000-0000-4000-8000-000000000000",
    member_id: "00000000-0000-4000-8000-000000000000",
    vital_type: "weight",
    cadence_days: 7,
    next_due_on: new Date().toISOString().slice(0, 10),
  });
  check(
    "anonymous cannot create a measurement routine",
    Boolean(forgedHealthRoutine.error),
    forgedHealthRoutine.error?.code ?? "no error",
  );

  // Vitals (story 21-007) — same RLS shape as health_profiles.
  const healthVitals = await anon.from("health_vitals").select("id, vital_type").limit(1);
  check(
    "anonymous cannot read a household's vitals",
    Boolean(healthVitals.error) || (Array.isArray(healthVitals.data) && healthVitals.data.length === 0),
    healthVitals.error ? healthVitals.error.code : `${healthVitals.data?.length ?? "?"} rows`,
  );
  const forgedHealthVital = await anon.from("health_vitals").insert({
    household_id: "00000000-0000-4000-8000-000000000000",
    member_id: "00000000-0000-4000-8000-000000000000",
    vital_type: "weight",
    value: 72,
    unit: "kg",
  });
  check(
    "anonymous cannot create a vital",
    Boolean(forgedHealthVital.error),
    forgedHealthVital.error?.code ?? "no error",
  );

  // Fitness goals & sessions (story 21-008) — same RLS shape as health_profiles.
  const fitnessGoals = await anon.from("health_fitness_goals").select("id, activity_type").limit(1);
  check(
    "anonymous cannot read a household's fitness goals",
    Boolean(fitnessGoals.error) || (Array.isArray(fitnessGoals.data) && fitnessGoals.data.length === 0),
    fitnessGoals.error ? fitnessGoals.error.code : `${fitnessGoals.data?.length ?? "?"} rows`,
  );
  const forgedFitnessGoal = await anon.from("health_fitness_goals").insert({
    household_id: "00000000-0000-4000-8000-000000000000",
    member_id: "00000000-0000-4000-8000-000000000000",
    activity_type: "walk",
    target_count: 3,
    frequency_period: "week",
  });
  check(
    "anonymous cannot create a fitness goal",
    Boolean(forgedFitnessGoal.error),
    forgedFitnessGoal.error?.code ?? "no error",
  );

  const fitnessSessions = await anon.from("health_fitness_sessions").select("id, activity_type").limit(1);
  check(
    "anonymous cannot read a household's fitness sessions",
    Boolean(fitnessSessions.error) || (Array.isArray(fitnessSessions.data) && fitnessSessions.data.length === 0),
    fitnessSessions.error ? fitnessSessions.error.code : `${fitnessSessions.data?.length ?? "?"} rows`,
  );
  const forgedFitnessSession = await anon.from("health_fitness_sessions").insert({
    household_id: "00000000-0000-4000-8000-000000000000",
    member_id: "00000000-0000-4000-8000-000000000000",
    activity_type: "walk",
    duration_minutes: 30,
  });
  check(
    "anonymous cannot create a fitness session",
    Boolean(forgedFitnessSession.error),
    forgedFitnessSession.error?.code ?? "no error",
  );

  // Step-up verifications (story 15-007). The table has no INSERT policy at
  // all, deliberately: a client that could write one could hand itself the
  // very proof the check exists to demand. Both halves are asserted, because
  // "cannot read" without "cannot write" would still leave the control open.
  const forgedProof = await anon.from("step_up_verifications").insert({
    household_id: "00000000-0000-4000-8000-000000000000",
    member_id: "00000000-0000-4000-8000-000000000000",
    purpose: "payment",
    expires_at: new Date(Date.now() + 600_000).toISOString(),
  });
  check(
    "anonymous cannot forge a step-up verification",
    Boolean(forgedProof.error),
    forgedProof.error?.code ?? "no error",
  );

  const proofs = await anon.from("step_up_verifications").select("id").limit(1);
  check(
    "nobody can read another person's step-up verifications",
    Boolean(proofs.error) || (Array.isArray(proofs.data) && proofs.data.length === 0),
    proofs.error ? proofs.error.code : `${proofs.data?.length ?? "?"} rows`,
  );

  const requests = await anon.from("privacy_requests").select("id").limit(1);
  check(
    "anonymous cannot read privacy requests",
    Boolean(requests.error) || (Array.isArray(requests.data) && requests.data.length === 0),
    requests.error ? requests.error.code : `${requests.data?.length ?? "?"} rows`,
  );

  const forgedRequest = await anon.from("privacy_requests").insert({
    household_id: "00000000-0000-4000-8000-000000000000",
    subject_member_id: "00000000-0000-4000-8000-000000000000",
    requested_by_member_id: "00000000-0000-4000-8000-000000000000",
    kind: "deletion",
  });
  check(
    "anonymous cannot ask for somebody else's data to be deleted",
    Boolean(forgedRequest.error),
    forgedRequest.error?.code ?? "no error",
  );

  // Plan changes (story 20-004). Administrators only, and the application
  // checks first — this is the second line that still holds if a route is ever
  // added that forgets.
  const forgedPlan = await anon.from("household_subscriptions").upsert({
    household_id: "00000000-0000-4000-8000-000000000000",
    plan_key: "max",
    status: "active",
  });
  check(
    "anonymous cannot put a household on another plan",
    Boolean(forgedPlan.error),
    forgedPlan.error?.code ?? "no error",
  );

  // Public RPC wrappers for wh.* (20260924120000). The server must reach
  // autonomy_for and record_usage — before the wrappers, both answered
  // PGRST202 and every household silently ran as "observe" — and nobody
  // without the service role may reach either.
  const nobody = "00000000-0000-4000-8000-000000000000";
  const serverAutonomy = await admin.rpc("autonomy_for", { p_household_id: nobody, p_outcome_key: "groceries.stocked" });
  check(
    "the server reads autonomy through public.autonomy_for (observe when unconfigured)",
    !serverAutonomy.error && serverAutonomy.data === "observe",
    serverAutonomy.error?.code ?? `value=${JSON.stringify(serverAutonomy.data)}`,
  );
  const anonAutonomy = await anon.rpc("autonomy_for", { p_household_id: nobody, p_outcome_key: "groceries.stocked" });
  check("anonymous cannot read a household's autonomy", anonAutonomy.error?.code === "42501", anonAutonomy.error?.code ?? "no error");
  const anonUsage = await anon.rpc("record_usage", {
    p_household_id: nobody,
    p_feature_key: "ai.agent_runs",
    p_period_start: new Date().toISOString(),
  });
  check("anonymous cannot record usage", anonUsage.error?.code === "42501", anonUsage.error?.code ?? "no error");
  const anonBusy = await anon.rpc("busy_windows", { p_household_id: nobody, p_from: new Date().toISOString(), p_to: new Date().toISOString() });
  check("anonymous cannot read free/busy", anonBusy.error?.code === "42501", anonBusy.error?.code ?? "no error");

  // Correction evidence and approval fingerprints (20260924140000, Wave 5
  // §13, §20): the server can read both; nobody signed out can read or
  // plant evidence.
  const serverCorrections = await admin.from("ai_corrections").select("id").limit(1);
  check("the server can read correction evidence", !serverCorrections.error, serverCorrections.error?.code ?? "ok");
  const anonCorrections = await anon.from("ai_corrections").select("id").limit(1);
  check(
    "anonymous cannot read correction evidence",
    Boolean(anonCorrections.error) || (Array.isArray(anonCorrections.data) && anonCorrections.data.length === 0),
    anonCorrections.error ? anonCorrections.error.code : `${anonCorrections.data?.length ?? "?"} rows`,
  );
  const plantedCorrection = await anon.from("ai_corrections").insert({ household_id: nobody, surface: "hometalk", source_type: "conversation_action", error_type: "wrong_date", field: "when" });
  check("anonymous cannot plant correction evidence", Boolean(plantedCorrection.error), plantedCorrection.error?.code ?? "inserted");
  const fingerprints = await admin.from("conversation_actions").select("approval_fingerprint").limit(1);
  check("conversation actions carry an approval fingerprint", !fingerprints.error, fingerprints.error?.code ?? "ok");

  // Rate limits, email telemetry and the job queue wrappers (20260924150000,
  // Wave 5 §14–§17). The limiter check spends one hit in a bucket of its
  // own, so it never touches a real member's limit. `claim_jobs` is not
  // called here: claiming would take real queued work.
  const serverLimit = await admin.rpc("rate_limit_hit", { p_bucket: "verify.live", p_subject: "verify-live", p_window_seconds: 60, p_max: 1000 });
  check("the server can count a rate-limit hit", !serverLimit.error && serverLimit.data === true, serverLimit.error?.code ?? `value=${JSON.stringify(serverLimit.data)}`);
  const anonLimit = await anon.rpc("rate_limit_hit", { p_bucket: "verify.live", p_subject: "verify-live", p_window_seconds: 60, p_max: 1000 });
  check("anonymous cannot spend or probe a rate limit", anonLimit.error?.code === "42501", anonLimit.error?.code ?? "no error");
  const serverEmailEvents = await admin.from("homesend_email_events").select("id").limit(1);
  check("the server can read email forwarding telemetry", !serverEmailEvents.error, serverEmailEvents.error?.code ?? "ok");
  const anonEmailEvents = await anon.from("homesend_email_events").select("id").limit(1);
  check(
    "anonymous cannot read email forwarding telemetry",
    Boolean(anonEmailEvents.error) || (Array.isArray(anonEmailEvents.data) && anonEmailEvents.data.length === 0),
    anonEmailEvents.error ? anonEmailEvents.error.code : `${anonEmailEvents.data?.length ?? "?"} rows`,
  );
  const anonClaim = await anon.rpc("claim_jobs", { p_worker_id: "verify-live", p_limit: 1, p_lease_seconds: 5 });
  check("anonymous cannot claim queued work", anonClaim.error?.code === "42501", anonClaim.error?.code ?? "no error");

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
