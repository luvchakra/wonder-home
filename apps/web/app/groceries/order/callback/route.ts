import { NextResponse, type NextRequest } from "next/server";

import { hashState } from "@wonderhome/core/commerce/instamart/oauth";
import { completeInstamartSignIn, InstamartUnavailable } from "@wonderhome/core/commerce/instamart/service";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { createClient, getVerifiedUser } from "@wonderhome/core/db/server";
import { requireMembership } from "@wonderhome/core/identity/households";

/**
 * Where Swiggy sends a person back after they signed in (story 25-032).
 *
 * The state names the sign-in this person started here in the last ten
 * minutes; it must belong to the member whose session is making this
 * request, and it is spent whatever happens. The code is exchanged on the
 * server and the tokens never reach the browser. Swiggy allowlists this
 * exact URL for production.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const back = (query: string) => NextResponse.redirect(new URL(`/groceries/order?${query}`, request.nextUrl.origin));
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  // Swiggy's own "no" (the person cancelled on its page) comes back as an error.
  if (request.nextUrl.searchParams.get("error") || !code || !state || code.length > 2000 || state.length > 200) return back("problem=declined");

  const user = await getVerifiedUser();
  if (!user) return NextResponse.redirect(new URL(`/sign-in?next=${encodeURIComponent("/groceries/order")}`, request.nextUrl.origin));

  const admin = createAdminClient();
  const { data } = await admin.from("instamart_oauth_states").select("household_id").eq("state_hash", hashState(state)).maybeSingle();
  const householdId = (data as { household_id: string } | null)?.household_id;
  if (!householdId) return back("problem=expired");

  try {
    const membership = await requireMembership(await createClient(), householdId);
    const outcome = await completeInstamartSignIn(admin, { householdId, memberId: membership.memberId, memberType: membership.memberType }, { state, code });
    return back(outcome === "connected" ? "done=connected" : outcome === "expired" ? "problem=expired" : "problem=declined");
  } catch (thrown) {
    return back(`problem=${thrown instanceof InstamartUnavailable ? thrown.reason : "declined"}`);
  }
}
