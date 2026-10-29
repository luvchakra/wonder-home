import "server-only";
import { cache } from "react";

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

/**
 * Whether this request's signed-in person is platform staff, once per render.
 * Only the avatar menu's "Platform admin" row asks; the pages behind it still
 * check for themselves (`platformStaff`), so a wrong answer here hides or shows
 * a link and never opens a door.
 */
export const isPlatformStaff = cache(async (): Promise<boolean> => (await platformStaff("operations.read")) !== null);
