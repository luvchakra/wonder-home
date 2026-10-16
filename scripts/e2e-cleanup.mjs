#!/usr/bin/env node
/**
 * Clears what earlier E2E runs left in the test environment, at the start of
 * every nightly run (docs/CI.md), so a run killed halfway never leaves the
 * next one a dirty start.
 *
 * Today's suite needs no cleanup: it runs against a placeholder Supabase URL
 * and creates nothing anywhere. This is the place for that to happen the day
 * a spec signs in for real. It acts only when the nightly is given a
 * dedicated test project (E2E_SUPABASE_URL + E2E_SUPABASE_SERVICE_ROLE_KEY),
 * and then deletes only:
 *
 *   - auth users whose email is on E2E_EMAIL_DOMAIN — the address every E2E
 *     account must be created with — and that are older than E2E_MAX_AGE_HOURS.
 *     The age keeps a run that is still going from losing its own accounts.
 *
 * Anything else a spec creates belongs to such a user, so it goes with it, or
 * gets its own rule here. Shared settings a spec changes temporarily are
 * reset here too, under the same guard. None exist yet.
 *
 * It refuses the production project unless E2E_ALLOW_LIVE_PROJECT=1 is set,
 * which the owner allows only while WonderHome is pre-launch (CLAUDE.md).
 */
export const E2E_EMAIL_DOMAIN = "e2e.wonderhome-test.internal";
/** The live project (CLAUDE.md, "Where it is hosted"). E2E never runs against it. */
export const PRODUCTION_PROJECT_REFS = ["kqxndableyysxqhxiorz"];

export function guard(url) {
  if (!url) return { ok: false, reason: "no E2E test project configured (E2E_SUPABASE_URL unset); nothing to clean" };
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    return { ok: false, reason: `E2E_SUPABASE_URL is not a URL: ${url}`, refuse: true };
  }
  const ref = host.split(".")[0];
  if (PRODUCTION_PROJECT_REFS.includes(ref) && process.env.E2E_ALLOW_LIVE_PROJECT !== "1") {
    return { ok: false, reason: `refusing: ${host} is the production project`, refuse: true };
  }
  return { ok: true, ref };
}

export function isStale(user, { now = Date.now(), maxAgeHours = 2 } = {}) {
  const email = (user.email ?? "").toLowerCase();
  if (!email.endsWith(`@${E2E_EMAIL_DOMAIN}`)) return false;
  const created = Date.parse(user.created_at ?? "");
  return Number.isFinite(created) && now - created > maxAgeHours * 3_600_000;
}

async function main() {
  const check = guard(process.env.E2E_SUPABASE_URL);
  if (!check.ok) {
    console.log(`e2e-cleanup: ${check.reason}`);
    process.exitCode = check.refuse ? 1 : 0;
    return;
  }
  const key = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    console.error("e2e-cleanup: E2E_SUPABASE_URL is set but E2E_SUPABASE_SERVICE_ROLE_KEY is not");
    process.exitCode = 1;
    return;
  }
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(process.env.E2E_SUPABASE_URL, key, { auth: { persistSession: false } });
  const maxAgeHours = Number(process.env.E2E_MAX_AGE_HOURS ?? 2);
  // Collect first, delete after: deleting while paging shifts the pages.
  const stale = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listing users failed: ${error.message}`);
    stale.push(...data.users.filter((user) => isStale(user, { maxAgeHours })));
    if (data.users.length < 200) break;
  }
  for (const user of stale) {
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw new Error(`deleting ${user.id} failed: ${error.message}`);
  }
  console.log(`e2e-cleanup: removed ${stale.length} E2E account(s) older than ${maxAgeHours}h from ${check.ref}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
