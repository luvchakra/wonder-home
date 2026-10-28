import type { NextRequest } from "next/server";

import { updateSession } from "@wonderhome/core/db/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
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
