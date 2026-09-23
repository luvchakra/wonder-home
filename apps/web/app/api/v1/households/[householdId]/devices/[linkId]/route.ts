import { requireUser } from "@wonderhome/core/api/auth";
import { ApiError } from "@wonderhome/core/api/errors";
import { defineRoute } from "@wonderhome/core/api/route";
import { createClient } from "@wonderhome/core/db/server";
import { updateDeviceLink, updateDeviceLinkSchema } from "@wonderhome/core/home/device-repository";
import { requireHouseholdAdmin } from "@wonderhome/core/identity/households";

/**
 * Say which appliance a device is, or ignore it (story 17-008). Admin only,
 * as RLS and the column grants also insist. A device is never removed here:
 * it goes when its provider is disconnected, and until then "ignored" is how
 * a household says it wants nothing from it.
 */
type Params = { params: Promise<{ householdId: string; linkId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { householdId, linkId } = await params;

  return defineRoute({ input: updateDeviceLinkSchema, authenticate: requireUser }, async ({ body }) => {
    if (!/^[0-9a-f-]{36}$/i.test(linkId)) throw ApiError.notFound("That device could not be found.");
    const supabase = await createClient();
    await requireHouseholdAdmin(supabase, householdId);
    await updateDeviceLink(supabase, { householdId, linkId, assetId: body.assetId, ignored: body.ignored });
    return { updated: true };
  })(request);
}

export const dynamic = "force-dynamic";
