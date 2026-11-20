import { z } from "zod";

import { recordAuditEvent } from "@wonderhome/core/api/audit";
import { requireUser } from "@wonderhome/core/api/auth";
import { ApiError, toErrorBody } from "@wonderhome/core/api/errors";
import { adminClientFor, adminGrant } from "@wonderhome/core/db/admin-context";
import { createClient } from "@wonderhome/core/db/server";
import {
  archiveFilename,
  exportAvailable,
  hasHealthContent,
  HEALTH_PASSWORD_MIN,
  healthPasswordProblem,
  householdArchiveEntries,
  type ExportProgress,
} from "@wonderhome/core/household/full-export";
import { isHouseholdOwner, mayDownloadOwnData } from "@wonderhome/core/household/reset-policy";
import { zipReadableStream } from "@wonderhome/core/household/zip";
import { requireMembership } from "@wonderhome/core/identity/households";
import { log } from "@wonderhome/core/observability/logger";
import { NO_STORE } from "@wonderhome/core/security/cache-policy";
import { hitRateLimit, rateLimitMessage, retryAfterSeconds } from "@wonderhome/core/security/rate-limit";

import { confirmStaffPassword } from "../../../../../../_lib/platform-step-up";
import { stepUpRefusal } from "../../../../../../_lib/platform-step-up-rules";

/**
 * "Download my data" / "Download full data" (story 15-014): everything the
 * person can see in the home, as one ZIP.
 *
 * Every adult and helper (never a child), five an hour, and only after confirming it is them (their password, or a
 * Google sign-in in the last ten minutes for a Google-only account) — export is
 * a step-up action in the security baseline. The archive is streamed back to
 * this request and nowhere else: no stored copy, no link to leak, never cached.
 * It is read with the owner's own session, so it holds what they can see and
 * nothing more (`household/full-export.ts`); memory stays at one page or one
 * file however big the home is.
 *
 * Health records the owner can see are written only inside an AES-256 ZIP
 * locked with a password the owner types here (owner, 2026-11-20); the
 * password lives only for this request.
 */
type Params = { params: Promise<{ householdId: string }> };

const bodySchema = z.object({
  password: z.string().max(200).optional(),
  // The password that locks the health part (owner, 2026-11-20). Only ever in
  // this POST body: never in a URL, a log line, the audit trail or storage.
  healthPassword: z.string().max(400).optional(),
  healthPasswordRepeat: z.string().max(400).optional(),
});

const HEALTH_PROBLEM: Record<NonNullable<ReturnType<typeof healthPasswordProblem>>, string> = {
  too_short: `Choose a password of at least ${HEALTH_PASSWORD_MIN} characters for the health records. Nothing was downloaded.`,
  too_long: "That health records password is too long. Nothing was downloaded.",
  mismatch: "The two health records passwords don't match. Nothing was downloaded.",
};

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
    // Every adult and helper (owner, 2026-11-20: "everyone should have similar option to download the
    // data"); never a child. What the file holds is what this person's own session can read.
    if (!mayDownloadOwnData(membership, "app", householdId).ok) throw new ApiError("forbidden", "A parent or an Admin can download what WonderHome holds for you.");

    let audit: ReturnType<typeof adminClientFor> | null = null;
    try {
      audit = adminClientFor(adminGrant.member(membership, "rate-limit and record a data download"), householdId);
    } catch {
      audit = null;
    }
    const check = await confirmStaffPassword(parsed.data.password ?? "");
    if (check !== "ok") throw new ApiError(check === "limited" ? "rate_limited" : "forbidden", stepUpRefusal(check).replace("save", "download"), { stepUp: true });

    // Counted once the person has proved it is them, so a mistyped password never uses up a download.
    if (audit && !(await hitRateLimit(audit, "household.export", membership.memberId))) {
      return Response.json(
        { error: { code: "rate_limited", message: rateLimitMessage("household.export") } },
        { status: 429, headers: { ...headers, "retry-after": String(retryAfterSeconds("household.export")) } },
      );
    }

    if (!(await exportAvailable(supabase, householdId))) {
      return Response.json({ error: { code: "not_available", message: "The full download isn't available yet. Nothing was changed." } }, { status: 503, headers });
    }

    // Health records leave only locked with a password this person types. With
    // none they can see, there is nothing to lock and nothing is asked.
    const healthPresent = await hasHealthContent(supabase, householdId);
    let healthPassword: string | undefined;
    if (healthPresent) {
      const problem = healthPasswordProblem(parsed.data.healthPassword ?? "", parsed.data.healthPasswordRepeat ?? "");
      if (problem) {
        return Response.json({ error: { code: "health_password", message: HEALTH_PROBLEM[problem] } }, { status: 400, headers });
      }
      healthPassword = parsed.data.healthPassword;
    }

    const now = new Date();
    const progress: ExportProgress = { tables: [], files: [] };
    const owner = isHouseholdOwner(membership);

    // One entry per download in the household's activity: who, when, and counts, never values.
    // A trail that can't be written is logged, not a reason to refuse the person their data.
    const record = async (completed: boolean) => {
      try {
        if (!audit) throw new Error("no service client");
        await recordAuditEvent(audit, {
          householdId,
          eventType: "household.exported",
          actorMemberId: membership.memberId,
          targetTable: "households",
          targetId: householdId,
          metadata: {
            kind: owner ? "owner" : "member",
            completed,
            health_encrypted: healthPassword !== undefined,
            tables: progress.tables.length,
            records: progress.tables.reduce((sum, table) => sum + table.rows, 0),
            files: progress.files.filter((file) => !file.error).length,
          },
        });
      } catch {
        log.error("data download not audited", { event: "household_export_unaudited", allow: ["event"] });
      }
    };

    const stream = zipReadableStream(
      householdArchiveEntries({ supabase, householdId, householdName: membership.household.name, requestedBy: membership.displayName, now, healthPassword }, progress),
      now,
      () => {
        log.error("data download failed part-way", { event: "household_export_failed", allow: ["event"] });
        void record(false);
      },
      () => void record(true),
    );

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
