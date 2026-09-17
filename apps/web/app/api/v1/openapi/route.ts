import { buildOpenApiDocument } from "@wonderhome/core/api/openapi";

/**
 * The API's own description. Unauthenticated on purpose: it documents shapes
 * and status codes, never household content.
 */
export function GET() {
  return new Response(JSON.stringify(buildOpenApiDocument(), null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
