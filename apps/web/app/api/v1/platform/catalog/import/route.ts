import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { importOpenFoodFacts, STAPLE_QUERIES } from "@wonderhome/core/commerce/catalog-import";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { log } from "@wonderhome/core/observability/logger";

/**
 * Fills the shared grocery catalog from Open Food Facts (HomeFood 25-006):
 * the staples by default, or the searches named in the body. The nightly
 * retention sweep refreshes a few staples a day; this is the full run, for
 * seeding or for a new search an operator wants covered.
 *
 * Authorised like every platform job, by `Authorization: Bearer $CRON_SECRET`
 * and never by a household session — the catalog is every household's.
 */
const bodySchema = z.object({ queries: z.array(z.string().trim().min(2).max(40)).max(60).optional() });

async function run(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json(
      { error: { code: "unauthenticated", message: "Authentication required.", requestId: "catalog" } },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }
  try {
    const raw = request.method === "POST" ? await request.json().catch(() => ({})) : {};
    const parsed = bodySchema.safeParse(raw);
    const queries = parsed.success && parsed.data.queries?.length ? parsed.data.queries : [...STAPLE_QUERIES];
    const report = await importOpenFoodFacts(createAdminClient(), fetch, queries);
    log.info("grocery catalog import", { report, allow: ["report"] });
    return Response.json({ report }, { headers: { "cache-control": "no-store" } });
  } catch (thrown) {
    const { status, body } = toErrorBody(thrown, "catalog");
    return Response.json(body, { status, headers: { "cache-control": "no-store" } });
  }
}

export const POST = run;
/** Vercel Cron sends GET (CLAUDE.md, Production hardening). */
export const GET = run;
export const maxDuration = 300;
