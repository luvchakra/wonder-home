import { z } from "zod";

import { recordAuditEvent } from "@wonderhome/core/api/audit";
import { requireUser } from "@wonderhome/core/api/auth";
import { ApiError, toErrorBody } from "@wonderhome/core/api/errors";
import { adminClientFor, adminGrant } from "@wonderhome/core/db/admin-context";
import { createClient } from "@wonderhome/core/db/server";
import { archiveFilename, exportAvailable, householdArchiveEntries, type ExportProgress } from "@wonderhome/core/household/full-export";
import { isHouseholdOwner } from "@wonderhome/core/household/reset-policy";
import { zipReadableStream } from "@wonderhome/core/household/zip";
import { requireMembership } from "@wonderhome/core/identity/households";
import { log } from "@wonderhome/core/observability/logger";
import { NO_STORE } from "@wonderhome/core/security/cache-policy";

import { confirmStaffPassword } from "../../../../../../_lib/platform-step-up";
import { stepUpRefusal } from "../../../../../../_lib/platform-step-up-rules";

/**
 * "Download full data" (story 15-014): everything the home holds, as one ZIP.
 *
 * The owner only, and only after confirming it is them (their password, or a
 * Google sign-in in the last ten minutes for a Google-only account) — export is
 * a step-up action in the security baseline. The archive is streamed back to
 * this request and nowhere else: no stored copy, no link to leak, never cached.
 * It is read with the owner's own session, so it holds what they can see and
 * nothing more (`household/full-export.ts`); memory stays at one page or one
 * file however big the home is.
 */
type Params = { params: Promise<{ householdId: string }> };

const bodySchema = z.object({ password: z.string().max(200).optional() });

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: Params) {
  const { householdId } = await params;
  const headers = { "cache-control": NO_STORE };

  try {
    await requireUser();
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw new ApiError("bad_request", "Something was missing. Please try again.");

    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);
    if (!isHouseholdOwner(membership)) throw new ApiError("forbidden", "Only the home's owner can download all of its data.");

    const check = await confirmStaffPassword(parsed.data.password ?? "");
    if (check !== "ok") throw new ApiError(check === "limited" ? "rate_limited" : "forbidden", stepUpRefusal(check).replace("save", "download"), { stepUp: true });

    if (!(await exportAvailable(supabase, householdId))) {
      return Response.json({ error: { code: "not_available", message: "The full download isn't available yet. Nothing was changed." } }, { status: 503, headers });
    }

    const now = new Date();
    const progress: ExportProgress = { tables: [], files: [] };
    const stream = zipReadableStream(
      householdArchiveEntries({ supabase, householdId, householdName: membership.household.name, requestedBy: membership.displayName, now }, progress),
      now,
      () => log.error("full download failed part-way", { event: "household_export_failed", allow: ["event"] }),
    );

    // The record of who took a copy, and when, stays in the household's activity.
    await recordAuditEvent(adminClientFor(adminGrant.householdOwner(membership, "record the full download"), householdId), {
      householdId,
      eventType: "household.exported",
      actorMemberId: membership.memberId,
      targetTable: "households",
      targetId: householdId,
      metadata: { kind: "full" },
    });

    return new Response(stream, {
      headers: {
        ...headers,
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${archiveFilename(membership.household.name, now)}"`,
        "x-content-type-options": "nosniff",
      },
    });
  } catch (thrown) {
    const { status, body } = toErrorBody(thrown, "household-export");
    return Response.json(body, { status, headers });
  }
}
