import "server-only";

import { createClient } from "@wonderhome/core/db/server";
import { platformCan, requirePlatformAdmin, type PlatformAdmin } from "@wonderhome/core/platform/admin";

/** A signed-in platform staff member who holds `capability`, or null for anyone else (signed out included). */
export async function platformStaff(capability: string): Promise<PlatformAdmin | null> {
  try {
    const admin = await requirePlatformAdmin(await createClient());
    return platformCan(admin, capability) ? admin : null;
  } catch {
    return null;
  }
}
