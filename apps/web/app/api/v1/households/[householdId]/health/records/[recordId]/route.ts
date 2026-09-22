import { z } from "zod";

import { requireUser } from "@wonderhome/core/api/auth";
import { ApiError } from "@wonderhome/core/api/errors";
import { defineRoute } from "@wonderhome/core/api/route";
import { may } from "@wonderhome/core/billing/repository";
import { createClient } from "@wonderhome/core/db/server";
import { archiveRecord, getRecord, reactivateRecord, RECORD_TYPES, updateRecord } from "@wonderhome/core/health/records";
import { PRIVACY_SCOPES } from "@wonderhome/core/health/repository";
import { requireMembership } from "@wonderhome/core/identity/households";

/**
 * One record — its own details, or removing it and bringing it back
 * (story 21-005, CLAUDE.md rule 12). `action` discriminates which a PATCH
 * means, the same pattern checkups/appointments already use.
 */
type Params = { params: Promise<{ householdId: string; recordId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { householdId, recordId } = await params;

  return defineRoute({}, async () => {
    await requireUser();
    const supabase = await createClient();
    await requireMembership(supabase, householdId);

    const entitlement = await may(supabase, householdId, "health.tracking");
    if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

    const record = await getRecord(supabase, householdId, recordId);
    if (!record) throw ApiError.notFound("That record could not be found.");
    return { record };
  })(request);
}

const updateSchema = z.object({
  action: z.literal("update"),
  label: z.string().trim().min(1).max(160).optional(),
  recordType: z.enum(RECORD_TYPES).optional(),
  documentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  privacyScope: z.enum(PRIVACY_SCOPES).optional(),
});

const archiveSchema = z.object({ action: z.literal("archive") });
const reactivateSchema = z.object({ action: z.literal("reactivate") });

const patchSchema = z.discriminatedUnion("action", [updateSchema, archiveSchema, reactivateSchema]);

export async function PATCH(request: Request, { params }: Params) {
  const { householdId, recordId } = await params;

  return defineRoute({ input: patchSchema, authenticate: requireUser }, async ({ body }) => {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);

    const entitlement = await may(supabase, householdId, "health.tracking");
    if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

    const actor = { householdId, memberId: membership.memberId };

    if (body.action === "update") {
      const { label, recordType, documentDate, notes, privacyScope } = body;
      const record = await updateRecord(supabase, actor, recordId, { label, recordType, documentDate, notes, privacyScope });
      return { record };
    }

    if (body.action === "archive") {
      const record = await archiveRecord(supabase, actor, recordId);
      return { record };
    }

    const record = await reactivateRecord(supabase, actor, recordId);
    return { record };
  })(request);
}

export const dynamic = "force-dynamic";
