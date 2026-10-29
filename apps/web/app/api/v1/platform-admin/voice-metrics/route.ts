import { z } from "zod";

import { ApiError } from "@wonderhome/core/api/errors";
import { parseQuery } from "@wonderhome/core/api/query";
import { defineRoute } from "@wonderhome/core/api/route";
import { adminClientFor, adminGrant } from "@wonderhome/core/db/admin-context";
import { createClient } from "@wonderhome/core/db/server";
import { loadChannelMetrics } from "@wonderhome/core/hometalk/channel-events";
import { platformCan, requirePlatformAdmin } from "@wonderhome/core/platform/admin";

/**
 * HomeTalk by channel (voice integration phase 6, "Observability"),
 * platform-wide: web, mobile, Gemini Voice and Alexa side by side.
 *
 * Counted only from `hometalk_channel_events` — closed words and numbers,
 * never anything a household said — so, like AI operations, it needs
 * `ai_operations.read` and no support-access grant. `?hours=` sets the
 * window (1–2160, default 24). Each channel reports:
 *   - requests;
 *   - success, failure, clarification and approval rates;
 *   - action success and failure;
 *   - duplicate (replayed) deliveries;
 *   - p50/p95 latency;
 *   - provider errors and Live sessions opened (Gemini usage);
 *   - unlinked speakers and rate limits.
 */
export const GET = defineRoute(
  { authenticate: async () => requirePlatformAdmin(await createClient()) },
  async ({ actor, request }) => {
    if (!platformCan(actor, "ai_operations.read")) throw ApiError.forbidden("Your platform role cannot view voice metrics.");
    const { hours } = parseQuery(request, z.object({ hours: z.coerce.number().int().min(1).max(24 * 90).default(24) }).strict());
    return loadChannelMetrics(adminClientFor(adminGrant.platformAdmin(actor, "read voice channel metrics")), { windowHours: hours });
  },
);

export const dynamic = "force-dynamic";
