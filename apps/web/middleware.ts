import type { NextRequest } from "next/server";

import { updateSession } from "@wonderhome/core/db/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Every path except static assets and image optimization. API routes are
     * included so their session cookie is refreshed too — but the gate there is
     * the handler's own requireUser(), not this middleware.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
