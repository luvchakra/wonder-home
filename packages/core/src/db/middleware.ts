import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { publicEnv } from "../config/env";
import { redirectFor } from "../security/route-policy";

/**
 * Refreshes the Supabase session cookie on every request and applies the
 * route-level gate.
 *
 * getUser() is called deliberately: it verifies the token with the auth server
 * instead of trusting whatever the cookie decodes to, and it is also what keeps
 * the refreshed cookies flowing onto the response.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
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
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, { ...options, sameSite: "lax", httpOnly: true }),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

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
