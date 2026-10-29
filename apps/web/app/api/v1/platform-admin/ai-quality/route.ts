import { z } from "zod";

import { ApiError } from "@wonderhome/core/api/errors";
import { parseQuery } from "@wonderhome/core/api/query";
import { defineRoute } from "@wonderhome/core/api/route";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { createClient } from "@wonderhome/core/db/server";
import { loadProductionMetrics } from "@wonderhome/core/evaluation/production";
import { loadHomeBrainKeeping } from "@wonderhome/core/homebrain/misses";
import { platformCan, requirePlatformAdmin } from "@wonderhome/core/platform/admin";

/**
 * HomeTalk and HomeBrain quality in production (story 14-013, Wave 5 §23),
 * platform-wide: outcomes handled, model understanding and failures,
 * clarification, update success, grounded answers, corrections, refused
 * approvals and the unsafe-action count.
 *
 * Counted only from closed words (reply metadata codes, action type and
 * status, correction surface and error type), never from anything a
 * household said. So, like AI operations and HomeSend metrics, it needs
 * `ai_operations.read` and no support-access grant. `?days=` sets the
 * window (1–365, default 30). `homeBrainKeeping` (HomeBrain 4.0 §3.8) adds
 * the deeper looks HomeBrain took and what they found that its stored
 * context lacked, by part of the home, and how far behind the stores are.
 */
export const GET = defineRoute(
  { authenticate: async () => requirePlatformAdmin(await createClient()) },
  async ({ actor, request }) => {
    if (!platformCan(actor, "ai_operations.read")) throw ApiError.forbidden("Your platform role cannot view AI quality metrics.");
    const { days: windowDays } = parseQuery(request, z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }).strict());
    const admin = createAdminClient();
    const [metrics, homeBrainKeeping] = await Promise.all([loadProductionMetrics(admin, { windowDays }), loadHomeBrainKeeping(admin, { windowDays })]);
    return { metrics, homeBrainKeeping };
  },
);

export const dynamic = "force-dynamic";
