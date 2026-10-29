"use server";

import { revalidatePath } from "next/cache";

import { clearCareersKey, readCareersKey, saveCareersKey } from "@wonderhome/core/careers/key-store";
import { careersBase, clearCareersCache, testCareersConnection } from "@wonderhome/core/careers/wonderjobs";
import { adminClientFor, adminGrant } from "@wonderhome/core/db/admin-context";

import { careersStaff } from "../../_lib/careers";
import { formText } from "../../_lib/form-input";

/**
 * The WonderJobs key setting (the owner, 2026-10-21): a platform admin pastes
 * the career-site key here, and it works at once, with no redeploy. Stored in
 * Vault; the database records every save and clear with the last four
 * characters only. Nothing here ever returns the key to the browser.
 */

export type KeyActionState = { tone: "info" | "risk" | null; message: string | null };

const NOT_ALLOWED: KeyActionState = { tone: "risk", message: "Only a platform admin can change this." };

export async function saveCareersKeyAction(_previous: KeyActionState, formData: FormData): Promise<KeyActionState> {
  const staff = await careersStaff();
  if (!staff) return NOT_ALLOWED;
  const key = formText(formData, "key", 512) ?? "";
  const result = await saveCareersKey(adminClientFor(adminGrant.platformAdmin(staff, "save the careers key")), staff.profileId, key);
  if (!result.ok) {
    return result.reason === "invalid"
      ? { tone: "risk", message: "That isn't a career site key. It starts with wjcs_ and is shown once in WonderJobs → Hiring → Jobs → Career sites." }
      : { tone: "risk", message: "The key couldn't be saved. Try again." };
  }
  clearCareersCache();
  revalidatePath("/platform-admin/careers");
  revalidatePath("/careers", "layout");
  return { tone: "info", message: `Saved ${result.masked}. Use Test connection to check it with WonderJobs.` };
}

export async function clearCareersKeyAction(): Promise<KeyActionState> {
  const staff = await careersStaff();
  if (!staff) return NOT_ALLOWED;
  const ok = await clearCareersKey(adminClientFor(adminGrant.platformAdmin(staff, "clear the careers key")), staff.profileId);
  if (!ok) return { tone: "risk", message: "The key couldn't be cleared. Try again." };
  clearCareersCache();
  revalidatePath("/platform-admin/careers");
  revalidatePath("/careers", "layout");
  return { tone: "info", message: "Key cleared." };
}

export async function testCareersConnectionAction(): Promise<KeyActionState> {
  const staff = await careersStaff();
  if (!staff) return NOT_ALLOWED;
  const base = careersBase(process.env.WONDERJOBS_CAREERS_URL);
  if (!base) return { tone: "risk", message: "Unavailable: WONDERJOBS_CAREERS_URL must be an https address on wonderapps.biz." };
  const key = await readCareersKey(adminClientFor(adminGrant.platformAdmin(staff, "test the careers connection")));
  if (!key) return { tone: "risk", message: "No key is saved yet." };
  const result = await testCareersConnection({ key: key.key, base });
  if (result.state === "connected") return { tone: "info", message: `Connected${result.site ? ` to ${result.site}` : ""}: ${result.jobs === 1 ? "1 open job" : `${result.jobs} open jobs`}.` };
  if (result.state === "wrong_key") return { tone: "risk", message: "Wrong key: WonderJobs refused it (401). It may be mistyped or revoked." };
  return { tone: "risk", message: "Unavailable: WonderJobs couldn't be reached. Try again in a minute." };
}
