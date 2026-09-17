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
 */
export function createAdminClient(): SupabaseClient {
  const { SUPABASE_SERVICE_ROLE_KEY } = serverEnv();

  return createSupabaseClient(
    publicEnv().NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
