import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { publicEnv } from "../config/env";
import { redirectFor } from "../security/route-policy";
import { verifyUser } from "./server";

/**
 * Refreshes the Supabase session cookie on every request and applies the
 * route-level gate.
 *
 * The token is verified locally against the project's signing keys rather
 * than by a round trip to the auth server; a refresh, when the token is about
 * to expire, still flows through the cookie adapter onto the response.
 */
export async function updateSession(request: NextRequest, forwardHeaders: Record<string, string> = {}): Promise<NextResponse> {
  // Headers handed on to the page render (the CSP whose nonce Next stamps on its scripts), built
  // fresh each time so a refreshed session cookie set on the request below is included.
  const next = () => {
    const headers = new Headers(request.headers);
    for (const [key, value] of Object.entries(forwardHeaders)) headers.set(key, value);
    return NextResponse.next({ request: { headers } });
  };
  let response = next();
  const env = publicEnv();

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = next();
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, { ...options, sameSite: "lax", httpOnly: true }),
          );
        },
      },
    },
  );

  const user = await verifyUser(supabase);

  const decision = redirectFor(request.nextUrl.pathname, Boolean(user));
  if (decision) {
    const url = request.nextUrl.clone();
    const [pathname, search = ""] = decision.redirectTo.split("?");
    url.pathname = pathname ?? "/";
    url.search = search;
    const redirect = NextResponse.redirect(url);
    // Carry the refreshed session cookies onto the redirect.
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  return response;
}
