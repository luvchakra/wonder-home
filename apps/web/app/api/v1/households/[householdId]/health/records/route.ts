import { z } from "zod";

import { requireUser } from "@wonderhome/core/api/auth";
import { ApiError } from "@wonderhome/core/api/errors";
import { defineRoute } from "@wonderhome/core/api/route";
import { may } from "@wonderhome/core/billing/repository";
import { createClient } from "@wonderhome/core/db/server";
import { createRecord, listRecords, RECORD_STATUSES, RECORD_TYPES } from "@wonderhome/core/health/records";
import { PRIVACY_SCOPES } from "@wonderhome/core/health/repository";
import { requireMembership } from "@wonderhome/core/identity/households";

/**
 * A household's health records (story 21-005) — a document filed against
 * exactly one member. Never written directly by HomeSend's extraction; see
 * `home-send-actions.ts`'s `routeHomeSendItemAction` for the one place a
 * confirm actually calls `createRecord`.
 */
type Params = { params: Promise<{ householdId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { householdId } = await params;
  const url = new URL(request.url);
  const memberId = url.searchParams.get("memberId") ?? undefined;
  const statusParam = url.searchParams.getAll("status");
  const statuses = statusParam.filter((value): value is (typeof RECORD_STATUSES)[number] => (RECORD_STATUSES as readonly string[]).includes(value));

  return defineRoute({}, async () => {
    await requireUser();
    const supabase = await createClient();
    await requireMembership(supabase, householdId);

    const entitlement = await may(supabase, householdId, "health.tracking");
    if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

    const records = await listRecords(supabase, householdId, { memberId, statuses: statuses.length ? statuses : undefined });
    return { records };
  })(request);
}

const createSchema = z.object({
  memberId: z.string().uuid(),
  label: z.string().trim().min(1).max(160),
  recordType: z.enum(RECORD_TYPES),
  documentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().trim().max(2000).optional(),
  privacyScope: z.enum(PRIVACY_SCOPES).default("private"),
});

export async function POST(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({ input: createSchema, authenticate: requireUser }, async ({ body }) => {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);

    const entitlement = await may(supabase, householdId, "health.tracking");
    if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

    const record = await createRecord(supabase, { householdId, memberId: membership.memberId }, body);

    return new Response(JSON.stringify({ record }), {
      status: 201,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  })(request);
}

export const dynamic = "force-dynamic";
