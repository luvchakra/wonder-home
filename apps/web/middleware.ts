import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@wonderhome/core/db/middleware";
import { log } from "@wonderhome/core/observability/logger";
import { checkCsrf, configuredHosts } from "@wonderhome/core/security/csrf";
import { contentSecurityPolicyHeaders, generateNonce } from "@wonderhome/core/security/headers";

export async function middleware(request: NextRequest) {
  const csrf = checkCsrf({ method: request.method, pathname: request.nextUrl.pathname, headers: request.headers, extraHosts: configuredHosts() });
  if (!csrf.allowed) {
    // Which route and why; never the origin, which is the caller's to choose.
    log.warn("cross-site request refused", { route: request.nextUrl.pathname.replace(/\/[0-9a-f-]{20,}(?=\/|$)/gi, "/:id"), reason: csrf.reason });
    return NextResponse.json({ error: { code: "forbidden", message: "This request did not come from WonderHome." } }, { status: 403, headers: { "cache-control": "no-store" } });
  }

  // Next reads the nonce off the request's policy header and puts it on its own scripts.
  const nonce = generateNonce();
  const csp = contentSecurityPolicyHeaders(nonce);
  const response = await updateSession(request, { [csp.request.key]: csp.request.value });
  for (const { key, value } of csp.response) response.headers.set(key, value);
  return response;
}

export const config = {
  matcher: [
    /*
     * Every path except what never carries a member's session (audit B9):
     * built assets and image optimisation; files by their extension (the
     * public images, the service worker, the web manifest, robots.txt,
     * fonts, scripts and styles, all public in `security/route-policy.ts`);
     * and the webhooks other services call, which carry no cookie and
     * authenticate the sender themselves. Every other API route stays, so
     * a member's session cookie is refreshed on it too — but the gate there
     * is the handler's own requireUser(), not this middleware.
     * `middleware-matcher.test.ts` pins which paths this skips.
     */
    "/((?!_next/static|_next/image|favicon.ico|api/v1/(?:whatsapp/webhook|billing/webhook|homesend/email/webhook|platform/webhook-delivery)(?:/|$)|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|js|css|woff2?|json|txt|map|webmanifest)$).*)",
  ],
};
