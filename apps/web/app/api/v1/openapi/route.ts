import { buildOpenApiDocument } from "@wonderhome/core/api/openapi";
import { getVerifiedUser } from "@wonderhome/core/db/server";
import { apiDocsNeedSession } from "@wonderhome/core/security/exposure";

/**
 * The API's own description. It documents shapes and status codes, never
 * household content — but a full map of every endpoint is a blueprint of the
 * product, so in production it is for signed-in members only, and an
 * anonymous caller gets the same 404 as a path that does not exist
 * (`security/exposure.ts`). Local builds, CI and previews keep it open for
 * the API contract tests.
 */
export async function GET() {
  if (apiDocsNeedSession() && !(await getVerifiedUser())) {
    return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  }
  return new Response(JSON.stringify(buildOpenApiDocument(), null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": apiDocsNeedSession() ? "private, no-store" : "public, max-age=300",
    },
  });
}

export const dynamic = "force-dynamic";
