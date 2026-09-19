import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

import { publicEnv } from "../config/env";

/**
 * A Supabase client with the anonymous key and no session of its own.
 *
 * It exists for one job: checking a password without disturbing the caller
 * (story 15-007). Calling `signInWithPassword` on the request's own client
 * would mint new tokens and write new cookies — logging somebody into the
 * session they are already in, and invalidating the one the rest of the
 * request is holding. `persistSession: false` means this client keeps nothing:
 * it answers yes or no and is thrown away.
 *
 * It is not the admin client and must never be used as one. It carries the
 * publishable key, so every query through it is still subject to RLS as an
 * anonymous caller — which is to say, almost nothing. That is the point.
 */
export function createIsolatedClient(): SupabaseClient {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY } = publicEnv();

  return createSupabaseClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}
