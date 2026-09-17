import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { cache } from "react";

import { publicEnv } from "../config/env";

/**
 * Server Supabase client for Server Components, Route Handlers and Server
 * Actions. Runs as the authenticated member through the session cookies, so RLS
 * applies. This is the client nearly all server code should use.
 *
 * Memoised per request with React's `cache`: a screen's shell, its sections
 * and its helpers all share one client, one cookie read and one JWKS cache
 * rather than each building their own.
 */
export const createClient = cache(async (): Promise<SupabaseClient> => {
  const cookieStore = await cookies();
  const env = publicEnv();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component; middleware refreshes the session.
          }
        },
      },
    },
  );
});

export type VerifiedUser = { id: string; email: string | null };

/**
 * Who is signed in, verified without a round trip.
 *
 * The project signs sessions with an asymmetric key (ES256), so the token is
 * checked locally against the JWKS — cached process-wide by auth-js — instead
 * of asking the auth server on every request. That one network hop was paid
 * by the middleware and again by every page and API route; now it is paid
 * once per warm instance. A token that fails local verification is treated as
 * signed out; `getUser()` remains the fallback for a project still on a
 * symmetric secret, where local verification is not possible.
 *
 * Memoised per request, so the shell, the page and its sections agree on the
 * answer without repeating the work.
 */
export const getVerifiedUser = cache(async (): Promise<VerifiedUser | null> => {
  const supabase = await createClient();
  return verifyUser(supabase);
});

export async function verifyUser(supabase: SupabaseClient): Promise<VerifiedUser | null> {
  const { data, error } = await supabase.auth.getClaims();

  if (!error && data?.claims?.sub) {
    return { id: data.claims.sub, email: typeof data.claims.email === "string" ? data.claims.email : null };
  }

  // No session at all comes back as no data and no error: signed out, and
  // nothing to ask the auth server about. Only a verification *failure* —
  // a symmetric key, an unreachable JWKS — is worth the fallback round trip.
  if (!error) return null;
  if (/invalid jwt|signature|expired|malformed/i.test(error.message)) return null;

  const fallback = await supabase.auth.getUser();
  if (fallback.error || !fallback.data.user) return null;
  return { id: fallback.data.user.id, email: fallback.data.user.email ?? null };
}
