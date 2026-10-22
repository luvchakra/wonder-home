import { z } from "zod";

import { requireUser } from "@wonderhome/core/api/auth";
import { ApiError } from "@wonderhome/core/api/errors";
import { defineRoute } from "@wonderhome/core/api/route";
import { may } from "@wonderhome/core/billing/repository";
import { createClient } from "@wonderhome/core/db/server";
import { addFamilyEvent, duplicateConflict } from "@wonderhome/core/calendar/add-event";
import { familyAgenda } from "@wonderhome/core/family/repository";
import { EVENT_KINDS } from "@wonderhome/core/family/schedule";
import { requireMembership } from "@wonderhome/core/identity/households";

/**
 * Family time: what is coming, what needs answering, and what clashes.
 *
 * Protected time may be created here and is never moved here. A clash with a
 * confirmed family commitment produces a proposal for a person, which is the
 * only thing this module is allowed to do about it.
 */
const createEventSchema = z.object({
  /** Add it although the same thing is already on the calendar that day (a 409 said so). */
  confirmDuplicate: z.boolean().optional(),
  title: z.string().trim().min(1).max(200),
  kind: z.enum(EVENT_KINDS).optional(),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  location: z.string().trim().max(200).nullish(),
  protected: z.boolean().optional(),
  ownerMemberId: z.uuid().nullish(),
  participantMemberIds: z.array(z.uuid()).max(30).optional(),
});

type Params = { params: Promise<{ householdId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({}, async () => {
    await requireUser();
    const supabase = await createClient();
    await requireMembership(supabase, householdId);

    const entitlement = await may(supabase, householdId, "family.events");
    if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

    return await familyAgenda(supabase, householdId);
  })(request);
}

export async function POST(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({ input: createEventSchema, authenticate: requireUser }, async ({ body }) => {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);

    const entitlement = await may(supabase, householdId, "family.events");
    if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

    if (new Date(body.endsAt) <= new Date(body.startsAt)) {
      throw ApiError.badRequest("An event has to end after it starts.");
    }

    // Through HomeEvents' one door: the same thing already on the calendar that day is a 409, unless confirmed.
    const { confirmDuplicate, ...event } = body;
    const added = await addFamilyEvent(supabase, { householdId, ...event }, { timeZone: membership.household.timezone, confirmed: confirmDuplicate === true });
    if (added.kind === "duplicate") throw duplicateConflict(added.existing);
    const created = { id: added.id };

    return new Response(JSON.stringify(created), {
      status: 201,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  })(request);
}

export const dynamic = "force-dynamic";
