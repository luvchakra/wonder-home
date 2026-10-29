import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

import { publicEnv, serverEnv } from "../config/env";

/**
 * Service-role Supabase client. BYPASSES Row Level Security entirely.
 *
 * Server-only. There is no "use client" guard because the build fails if client
 * code imports SUPABASE_SERVICE_ROLE_KEY — it is deliberately not NEXT_PUBLIC_.
 *
 * Use only where crossing a household boundary is the design (background jobs,
 * platform admin, support access) AND the caller performs its own explicit
 * authorization check first. Everything else uses db/server.ts.
 *
 * New call sites go through `adminClientFor(adminGrant.…)` in db/admin-context.ts,
 * which takes the authorization as an argument (SEC-04); `npm run lint:service-role`
 * fails a raw call outside the documented list in security/service-role-baseline.json.
 *
 * Memoised into a process-wide singleton. The service-role client carries no
 * per-request state — no cookies, no user session (`persistSession: false`), no
 * realtime socket unless one is opened — so one instance is safe to share across
 * every request on a warm instance. This matters: `createAdminClient()` is
 * called from ~100 sites, several times within a single request in the hot
 * paths (HomeTalk, reminders), and each call otherwise built a fresh client with
 * its own fetch/auth machinery. Built lazily so env is read on first use, not at
 * import time.
 */
let adminClientSingleton: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  if (adminClientSingleton) return adminClientSingleton;

  const { SUPABASE_SERVICE_ROLE_KEY } = serverEnv();
  adminClientSingleton = createSupabaseClient(
    publicEnv().NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  return adminClientSingleton;
}
