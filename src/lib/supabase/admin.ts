import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types";
import { getSecretKey, getSupabaseUrl } from "./project";

/**
 * Supabase client holding the secret (service_role) key.
 *
 * This client **bypasses Row Level Security**. Only use it in trusted
 * server-side code for work a signed-in user could not do themselves, and
 * always scope the query yourself — there is no policy left to catch a
 * mistake. For anything acting on behalf of a user, use `./server` instead.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(getSupabaseUrl(), getSecretKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
