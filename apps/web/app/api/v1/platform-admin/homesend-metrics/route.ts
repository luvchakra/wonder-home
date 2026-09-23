import { ApiError } from "@wonderhome/core/api/errors";
import { defineRoute } from "@wonderhome/core/api/route";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { createClient } from "@wonderhome/core/db/server";
import { loadHomeSendMetrics } from "@wonderhome/core/homesend/metrics";
import { platformCan, requirePlatformAdmin } from "@wonderhome/core/platform/admin";

/**
 * HomeSend's outcome metrics (story 14-011, Wave 3 §19), platform-wide.
 *
 * Counted only from closed-word columns — source, status, kind and the
 * review outcome a person's confirm recorded — never from anything a
 * household sent, so, like AI operations, it needs `ai_operations.read` and
 * no support-access grant. `?days=` sets the window (1–365, default 30).
 */
export const GET = defineRoute(
  { authenticate: async () => requirePlatformAdmin(await createClient()) },
  async ({ actor, request }) => {
    if (!platformCan(actor, "ai_operations.read")) throw ApiError.forbidden("Your platform role cannot view HomeSend metrics.");
    const days = Number(new URL(request.url).searchParams.get("days") ?? "30");
    return { metrics: await loadHomeSendMetrics(createAdminClient(), { windowDays: Number.isFinite(days) ? days : 30 }) };
  },
);

export const dynamic = "force-dynamic";
