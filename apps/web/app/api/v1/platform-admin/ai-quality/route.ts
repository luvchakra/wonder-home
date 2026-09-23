import { ApiError } from "@wonderhome/core/api/errors";
import { defineRoute } from "@wonderhome/core/api/route";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { createClient } from "@wonderhome/core/db/server";
import { loadProductionMetrics } from "@wonderhome/core/evaluation/production";
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
 * window (1–365, default 30).
 */
export const GET = defineRoute(
  { authenticate: async () => requirePlatformAdmin(await createClient()) },
  async ({ actor, request }) => {
    if (!platformCan(actor, "ai_operations.read")) throw ApiError.forbidden("Your platform role cannot view AI quality metrics.");
    const days = Number(new URL(request.url).searchParams.get("days") ?? "30");
    return { metrics: await loadProductionMetrics(createAdminClient(), { windowDays: Number.isFinite(days) ? days : 30 }) };
  },
);

export const dynamic = "force-dynamic";
