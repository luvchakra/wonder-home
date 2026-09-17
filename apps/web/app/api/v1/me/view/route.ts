import { requireUser } from "@wonderhome/core/api/auth";
import { defineRoute } from "@wonderhome/core/api/route";
import { createClient } from "@wonderhome/core/db/server";
import { ApiError } from "@wonderhome/core/api/errors";
import { parseDateOfBirth, ageBandFor } from "@wonderhome/core/identity/age";
import { listMemberships } from "@wonderhome/core/identity/households";
import { buildPersonalView } from "@wonderhome/core/identity/views";

/**
 * The caller's own view of their household.
 *
 * Filtering happens here rather than in the client: a section this member may
 * not see is absent from the response, not hidden by it.
 */
export const GET = defineRoute({}, async ({ request }) => {
  await requireUser();
  const supabase = await createClient();

  const memberships = await listMemberships(supabase);
  if (memberships.length === 0) throw ApiError.notFound("You do not belong to a household yet.");

  const requested = new URL(request.url).searchParams.get("householdId");
  const membership = requested
    ? memberships.find((entry) => entry.household.id === requested)
    : memberships[0];

  if (!membership) throw ApiError.notFound();

  const { data } = await supabase
    .from("household_members")
    .select("date_of_birth")
    .eq("id", membership.memberId)
    .maybeSingle();

  const ageBand = ageBandFor(parseDateOfBirth(data?.date_of_birth as string | null));

  return { view: buildPersonalView(membership, ageBand) };
});

export const dynamic = "force-dynamic";
