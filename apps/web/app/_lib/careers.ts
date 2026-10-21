import "server-only";

import { createWonderJobsClient, careersBase, type WonderJobsClient } from "@wonderhome/core/careers/wonderjobs";
import { readCareersKey } from "@wonderhome/core/careers/key-store";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { createClient } from "@wonderhome/core/db/server";
import { platformCan, requirePlatformAdmin, type PlatformAdmin } from "@wonderhome/core/platform/admin";

/**
 * The careers pages' one way to WonderJobs (the owner, 2026-10-21). Server
 * only: the career-site key is read here, from Vault or the environment
 * fallback, and handed straight to the client. No page, action result, log
 * line or error carries it.
 *
 * `WONDERJOBS_CAREERS_URL` may point at another WonderJobs on wonderapps.biz
 * (a staging one); anything else is refused and careers reads as unavailable.
 */

export const CAREERS_APP_NAME = "WonderHome";

export type CareersConnection = { state: "ready"; client: WonderJobsClient } | { state: "needs_setup" } | { state: "bad_address" };

export async function careersConnection(): Promise<CareersConnection> {
  const base = careersBase(process.env.WONDERJOBS_CAREERS_URL);
  if (!base) return { state: "bad_address" };
  const key = await readCareersKey(createAdminClient());
  if (!key) return { state: "needs_setup" };
  return { state: "ready", client: createWonderJobsClient({ key: key.key, base }) };
}

/** A signed-in platform admin who may manage careers, or null for anyone else (signed out included). */
export async function careersStaff(): Promise<PlatformAdmin | null> {
  try {
    const admin = await requirePlatformAdmin(await createClient());
    return platformCan(admin, "careers.manage") ? admin : null;
  } catch {
    return null;
  }
}
