import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "./types";
import { getPublishableKey, getSupabaseUrl } from "./project";

/**
 * Supabase client for Client Components and other browser-side code.
 *
 * Uses the publishable key, so every query is subject to Row Level Security.
 */
export function createClient() {
  return createBrowserClient<Database>(getSupabaseUrl(), getPublishableKey());
}
