import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { InstamartUnavailable, startInstamartSignIn } from "@wonderhome/core/commerce/instamart/service";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { createClient, getVerifiedUser } from "@wonderhome/core/db/server";
import { requireMembership } from "@wonderhome/core/identity/households";
import { siteOrigin } from "@wonderhome/core/notifications/email";

/**
 * Connect Swiggy (story 25-032): a plain link, so the browser leaves for
 * Swiggy's sign-in page as a whole-page navigation. It only starts a sign-in
 * for the member whose session asks — a ten-minute, single-use state — and
 * changes nothing else, so following it twice is harmless.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const back = (query: string) => NextResponse.redirect(new URL(`/groceries/order?${query}`, request.nextUrl.origin));
  const householdId = z.uuid().safeParse(request.nextUrl.searchParams.get("household"));
  if (!householdId.success) return back("problem=invalid");
  const user = await getVerifiedUser();
  if (!user) return NextResponse.redirect(new URL(`/sign-in?next=${encodeURIComponent("/groceries/order")}`, request.nextUrl.origin));
  try {
    const membership = await requireMembership(await createClient(), householdId.data);
    // Production signs in against the one allowlisted origin; development against localhost.
    const origin = process.env.VERCEL_ENV === "production" ? siteOrigin() : /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(request.nextUrl.origin) ? request.nextUrl.origin : siteOrigin();
    const target = await startInstamartSignIn(createAdminClient(), { householdId: householdId.data, memberId: membership.memberId, memberType: membership.memberType }, origin);
    return NextResponse.redirect(target);
  } catch (thrown) {
    return back(`problem=${thrown instanceof InstamartUnavailable ? thrown.reason : "unreachable"}`);
  }
}
