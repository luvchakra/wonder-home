"use server";

import { revalidatePath } from "next/cache";

import { adminClientFor, adminGrant } from "@wonderhome/core/db/admin-context";
import { saveLandingVariant } from "@wonderhome/core/platform/settings";

import { formText } from "../../_lib/form-input";
import { platformStaff } from "../../_lib/platform-staff";

export type LandingActionState = { tone: "info" | "risk" | null; message: string | null };

/** Switches the public landing page (owner, 2026-11-07). Platform staff only; every change is audited in the database. */
export async function saveLandingVariantAction(_previous: LandingActionState, formData: FormData): Promise<LandingActionState> {
  const staff = await platformStaff("settings.manage");
  if (!staff) return { tone: "risk", message: "Only platform staff can change this." };
  const variant = formText(formData, "variant", 16);
  const ok = await saveLandingVariant(adminClientFor(adminGrant.platformAdmin(staff, "switch the landing page")), staff.profileId, variant);
  if (!ok) return { tone: "risk", message: "That couldn't be saved. Try again." };
  revalidatePath("/");
  revalidatePath("/platform-admin/landing");
  return { tone: "info", message: `Saved. Visitors see the ${variant === "classic" ? "classic" : "new"} landing page within a minute.` };
}
