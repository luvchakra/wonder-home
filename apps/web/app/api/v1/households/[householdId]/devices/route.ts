import { requireUser } from "@wonderhome/core/api/auth";
import { defineRoute } from "@wonderhome/core/api/route";
import { createClient } from "@wonderhome/core/db/server";
import { listDevices } from "@wonderhome/core/home/device-repository";
import { requireMembership } from "@wonderhome/core/identity/households";

/**
 * The household's devices (story 17-008): each device a connected provider
 * reported, which appliance it is (if anyone has said), whether it is
 * ignored, and when it last reported. Never a reading's value and never the
 * provider's credential.
 */
type Params = { params: Promise<{ householdId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({ authenticate: requireUser }, async () => {
    const supabase = await createClient();
    await requireMembership(supabase, householdId);
    return { devices: await listDevices(supabase, householdId) };
  })(request);
}

export const dynamic = "force-dynamic";
