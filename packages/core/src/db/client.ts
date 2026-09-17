import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client, authenticated as the signed-in member via the
 * publishable key. RLS applies to every query made through it.
 *
 * RLS is defense in depth only — application authorization in the /api/v1 layer
 * remains authoritative (architecture/SECURITY-BASELINE.md).
 */
export function createClient(): SupabaseClient {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
