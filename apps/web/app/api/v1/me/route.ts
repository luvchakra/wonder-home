import { requireUser } from "@wonderhome/core/api/auth";
import { defineRoute } from "@wonderhome/core/api/route";

/**
 * The authenticated example endpoint that proves the /api/v1 contract end to
 * end: session verification, the standard envelope on failure, and a typed JSON
 * body on success.
 *
 * It returns the authenticated identity only. Household membership, roles and
 * personalized views arrive with module 01, which owns those resources.
 */
export const GET = defineRoute({}, async () => {
  const actor = await requireUser();
  return { userId: actor.userId, email: actor.email };
});

export const dynamic = "force-dynamic";
