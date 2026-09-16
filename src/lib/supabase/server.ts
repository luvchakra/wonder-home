import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "./types";
import { getPublishableKey, getSupabaseUrl } from "./project";

/**
 * Supabase client for Server Components, Route Handlers and Server Actions.
 *
 * Uses the publishable key and the caller's cookies, so queries run as the
 * signed-in user and Row Level Security still applies. A new client must be
 * created per request — never cache or share one across requests.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(getSupabaseUrl(), getPublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies. The middleware refreshes the
          // session on every request, so this is safe to ignore here.
        }
      },
    },
  });
}
