import { z } from "zod";

import { requireUser } from "@wonderhome/core/api/auth";
import { ApiError } from "@wonderhome/core/api/errors";
import { defineRoute } from "@wonderhome/core/api/route";
import { may } from "@wonderhome/core/billing/repository";
import { createClient } from "@wonderhome/core/db/server";
import { ISSUE_STATUSES, getIssue, setIssueStatus, updateIssue } from "@wonderhome/core/health/issues";
import { requireMembership } from "@wonderhome/core/identity/households";

/** One health issue — its own content, or a status move through its lifecycle (story 21-003). */
type Params = { params: Promise<{ householdId: string; issueId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { householdId, issueId } = await params;

  return defineRoute({}, async () => {
    await requireUser();
    const supabase = await createClient();
    await requireMembership(supabase, householdId);

    const entitlement = await may(supabase, householdId, "health.tracking");
    if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

    const issue = await getIssue(supabase, householdId, issueId);
    if (!issue) throw ApiError.notFound("That issue could not be found.");
    return { issue };
  })(request);
}

const updateSchema = z.object({
  action: z.literal("update"),
  label: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

const statusSchema = z.object({
  action: z.literal("set_status"),
  status: z.enum(ISSUE_STATUSES),
});

const patchSchema = z.discriminatedUnion("action", [updateSchema, statusSchema]);

export async function PATCH(request: Request, { params }: Params) {
  const { householdId, issueId } = await params;

  return defineRoute({ input: patchSchema, authenticate: requireUser }, async ({ body }) => {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);

    const entitlement = await may(supabase, householdId, "health.tracking");
    if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

    const actor = { householdId, memberId: membership.memberId };

    if (body.action === "update") {
      const { label, description, notes } = body;
      const result = await updateIssue(supabase, actor, issueId, { label, description, notes });
      return result;
    }

    const issue = await setIssueStatus(supabase, actor, issueId, body.status);
    return { issue };
  })(request);
}

export const dynamic = "force-dynamic";
