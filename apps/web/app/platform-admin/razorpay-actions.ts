"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { adminClientFor, adminGrant } from "@wonderhome/core/db/admin-context";
import { platformCan } from "@wonderhome/core/platform/admin";
import { cleanRazorpayKeyId, cleanRazorpayKeySecret } from "@wonderhome/core/platform/settings/razorpay-keys";
import { mayEdit, settingDefinition } from "@wonderhome/core/platform/settings/registry";
import { forgetRuntimeEnv } from "@wonderhome/core/platform/settings/runtime-env";
import { saveSetting } from "@wonderhome/core/platform/settings/store";

import { confirmStaffPassword } from "../_lib/platform-step-up";
import { stepUpRefusal } from "../_lib/platform-step-up-rules";
import { platformStaff } from "../_lib/platform-staff";

/**
 * The Razorpay card's one Save (owner, 2026-11-20: "why its in 2 different
 * places, update it so both values can be taken at same place"). The key id
 * and the key secret go up in one form; either may be left empty to keep what
 * is saved. Both are checked before anything is written, the secret needs the
 * owner to prove it is them (password, or a fresh Google sign-in), and each
 * value is saved through the same audited, rate-limited function the settings
 * rows use. The secret never comes back: only its last four.
 */

export type RazorpayField = "keyId" | "keySecret" | "password";
export type RazorpayActionState = { tone: "info" | "risk" | null; message: string | null; field: RazorpayField | null };

const PAGES = ["/platform-admin", "/platform-admin/integrations", "/platform-admin/secrets", "/platform-admin/security"];
const input = z.object({
  keyId: z.string().max(200).default(""),
  keySecret: z.string().max(200).default(""),
  password: z.string().max(200).default(""),
});

export async function saveRazorpayAction(_previous: RazorpayActionState, formData: FormData): Promise<RazorpayActionState> {
  const field = (name: string) => formData.get(name) ?? undefined;
  const parsed = input.safeParse({ keyId: field("razorpay_key_id"), keySecret: field("razorpay_key_secret"), password: field("razorpay_password") });
  if (!parsed.success) return { tone: "risk", message: "That's too long to be a Razorpay key. Paste just the key.", field: null };
  const { keyId: rawId, keySecret: rawSecret, password } = parsed.data;
  const idEntry = settingDefinition("RAZORPAY_KEY_ID");
  const secretEntry = settingDefinition("RAZORPAY_KEY_SECRET");
  if (!idEntry || !secretEntry) return { tone: "risk", message: "Razorpay isn't a setting WonderHome knows.", field: null };

  const staff = await platformStaff("settings.manage");
  if (!staff || !mayEdit(idEntry, staff.role) || !mayEdit(secretEntry, staff.role) || !platformCan(staff, "secrets.manage")) {
    return { tone: "risk", message: "Only the owner can change the Razorpay keys.", field: null };
  }

  const wantsId = rawId.trim() !== "";
  const wantsSecret = rawSecret.trim() !== "";
  if (!wantsId && !wantsSecret) return { tone: "risk", message: "Paste the key id, the key secret, or both, then Save.", field: "keyId" };
  const keyId = wantsId ? cleanRazorpayKeyId(rawId) : null;
  if (keyId && !keyId.ok) return { tone: "risk", message: keyId.message, field: "keyId" };
  const keySecret = wantsSecret ? cleanRazorpayKeySecret(rawSecret) : null;
  if (keySecret && !keySecret.ok) return { tone: "risk", message: keySecret.message, field: "keySecret" };

  if (keySecret) {
    const check = await confirmStaffPassword(password);
    if (check !== "ok") return { tone: "risk", message: stepUpRefusal(check), field: "password" };
  }

  const admin = adminClientFor(adminGrant.platformAdmin(staff, "save the Razorpay keys"));
  const said: string[] = [];
  if (keyId?.ok) {
    const result = await saveSetting(admin, staff.profileId, "RAZORPAY_KEY_ID", keyId.value);
    if (!result.ok) return { tone: "risk", message: failure(result.reason, result.message, "Nothing was changed."), field: "keyId" };
    said.push(`Key id ${keyId.value} saved.`);
  }
  if (keySecret?.ok) {
    const result = await saveSetting(admin, staff.profileId, "RAZORPAY_KEY_SECRET", keySecret.value);
    if (!result.ok) {
      done(said.length > 0);
      return { tone: "risk", message: failure(result.reason, result.message, said.length ? "The key id was saved; the secret wasn't." : "Nothing was changed."), field: "keySecret" };
    }
    said.push(`Key secret saved · ends in ${result.last4 ?? keySecret.value.slice(-4)}.`);
  }
  done(true);
  return { tone: "info", message: `${said.join(" ")} WonderHome uses ${said.length > 1 ? "them" : "it"} within a minute, no redeploy.`, field: null };
}

function failure(reason: string, message: string | undefined, ending: string): string {
  if (reason === "invalid") return message ?? `That value isn't valid. ${ending}`;
  if (reason === "limited") return `That's a lot of changes in a minute. Wait a moment, then try again. ${ending}`;
  return `It couldn't be saved just now. Try again. ${ending}`;
}

function done(changed: boolean) {
  if (!changed) return;
  forgetRuntimeEnv();
  for (const page of PAGES) revalidatePath(page);
}
