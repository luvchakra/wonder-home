import { toErrorBody } from "@wonderhome/core/api/errors";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { log } from "@wonderhome/core/observability/logger";
import { purgeExpired, summarise } from "@wonderhome/core/privacy/purge";

/**
 * Applies the retention schedule (story 15-007).
 *
 * The Privacy Centre publishes how long each kind of thing is kept. This is
 * what makes that true — a published policy nothing applies is a promise, and
 * this endpoint is the difference.
 *
 * Authorised by a shared secret rather than a session, because there is no
 * person here: Vercel Cron calls it with `Authorization: Bearer $CRON_SECRET`.
 * It is deliberately not reachable from any household's own session — purging
 * crosses every household at once, which is the last thing a tenant should be
 * able to trigger.
 *
 * With no `CRON_SECRET` configured it refuses everything rather than running
 * open. A retention sweep anybody can invoke is a button that deletes a
 * household's history on demand.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  // 401 rather than 403: the credential is the Authorization header itself, so
  // a missing or wrong one is a failure to authenticate, not a permission this
  // caller lacks. It is also the answer every other endpoint here gives an
  // anonymous caller, and one endpoint answering differently is a way to tell
  // this one apart from the rest.
  const refuse = () =>
    Response.json(
      { error: { code: "unauthenticated", message: "Authentication required.", requestId: "retention" } },
      { status: 401, headers: { "cache-control": "no-store" } },
    );

  // Never says which part was wrong, and never says whether a secret is set
  // at all: both answers are information somebody probing would want.
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return refuse();

  try {
    const outcomes = await purgeExpired(createAdminClient());
    const failed = outcomes.filter((outcome) => outcome.error);

    log.info("retention sweep", {
      summary: summarise(outcomes),
      failed: failed.length,
      allow: ["summary", "failed"],
    });

    // Counts only. What was deleted is exactly what must not be reported back.
    return Response.json(
      { swept: outcomes.map(({ table, deleted, error }) => ({ table, deleted, error })) },
      { status: failed.length > 0 ? 207 : 200, headers: { "cache-control": "no-store" } },
    );
  } catch (thrown) {
    const { status, body } = toErrorBody(thrown, "retention");
    return Response.json(body, { status, headers: { "cache-control": "no-store" } });
  }
}

export const dynamic = "force-dynamic";
