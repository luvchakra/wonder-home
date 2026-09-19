import { requireUser } from "@wonderhome/core/api/auth";
import { toErrorBody } from "@wonderhome/core/api/errors";
import { createClient } from "@wonderhome/core/db/server";
import { requireMembership } from "@wonderhome/core/identity/households";
import { buildPersonalView } from "@wonderhome/core/identity/views";
import { exportFilename } from "@wonderhome/core/privacy/export";
import { buildExport } from "@wonderhome/core/privacy/repository";

/**
 * A copy of your data, as a file (story 15-007).
 *
 * Deliberately a POST that returns the file directly rather than a job that
 * returns a link. A link is a second way to reach the data — one that outlives
 * the session that asked for it, and that has to be guessed at, expired and
 * guarded all over again. Streaming it back to the request that proved itself
 * means the export exists only in the reply to the person who asked.
 *
 * `buildExport` spends the step-up before reading a single row, so a request
 * without a fresh confirmation never touches the database.
 *
 * This route does not use `defineRoute`: that wrapper renders a JSON envelope,
 * and what belongs here is a downloadable file. The two things it would have
 * contributed — authentication and the error envelope — are done explicitly.
 */
type Params = { params: Promise<{ householdId: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { householdId } = await params;

  try {
    await requireUser();
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);
    const view = buildPersonalView(membership);
    const now = new Date();

    const file = await buildExport(
      supabase,
      {
        householdId,
        householdName: membership.household.name,
        memberId: membership.memberId,
        displayName: view.displayName,
        permissions: view.permissions,
      },
      now,
    );

    return new Response(JSON.stringify(file, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${exportFilename(membership.household.name, now)}"`,
        // A copy of somebody's household is never a thing to keep in a cache,
        // shared or otherwise.
        "cache-control": "no-store, private",
      },
    });
  } catch (thrown) {
    const { status, body } = toErrorBody(thrown, "privacy-export");
    return Response.json(body, { status, headers: { "cache-control": "no-store" } });
  }
}

export const dynamic = "force-dynamic";
