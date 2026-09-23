import { ApiError } from "@wonderhome/core/api/errors";
import { createClient } from "@wonderhome/core/db/server";
import { platformCan, requirePlatformAdmin, type PlatformAdmin } from "@wonderhome/core/platform/admin";

/** Platform staff who may manage entitlement experiments (story 20-008): `subscription.manage`. */
export async function requireExperimentManager(): Promise<PlatformAdmin> {
  const actor = await requirePlatformAdmin(await createClient());
  if (!platformCan(actor, "subscription.manage")) throw ApiError.forbidden("Your platform role cannot manage entitlement experiments.");
  return actor;
}
