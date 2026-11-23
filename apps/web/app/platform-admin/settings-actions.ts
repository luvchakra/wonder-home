"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { adminClientFor, adminGrant } from "@wonderhome/core/db/admin-context";
import { platformCan } from "@wonderhome/core/platform/admin";
import { mayEdit, settingDefinition } from "@wonderhome/core/platform/settings/registry";
import { moveAllFromEnvironment, type MoveReport } from "@wonderhome/core/platform/settings/move";
import { STORE_ONLY_KEYS, forgetRuntimeEnv } from "@wonderhome/core/platform/settings/runtime-env";
import { clearSetting, saveSetting } from "@wonderhome/core/platform/settings/store";
import { checkModelKey, keyCheckWords } from "@wonderhome/core/ai/key-check";
import { MODEL_PROVIDERS, platformKey, providerOfKey, type ModelProvider } from "@wonderhome/core/ai/model-key";
import { resolvePlatformKeyAlert, supersedeStaleKeyAlerts } from "@wonderhome/core/ai/platform-key-alert";
import { freshRuntimeEnv } from "@wonderhome/core/platform/settings/runtime-env";

import { confirmStaffPassword } from "../_lib/platform-step-up";
import { stepUpRefusal } from "../_lib/platform-step-up-rules";
import { platformStaff } from "../_lib/platform-staff";

/**
 * Saving and clearing a platform setting (owner, 2026-11-07). The server
 * decides everything: the setting must be in the registry, the staff member's
 * role must be allowed to change it (`mayEdit`), and a secret needs the
 * owner's password again. The value goes up once in the form and never comes
 * back down; the database writes the audit row and refuses a twenty-first
 * change in a minute. The browser's origin was already checked (middleware).
 */

export type SettingActionState = { tone: "info" | "risk" | null; message: string | null; key: string | null };

const PAGES = ["/platform-admin", "/platform-admin/ai", "/platform-admin/integrations", "/platform-admin/configuration", "/platform-admin/secrets", "/platform-admin/security"];

const input = z.object({
  key: z.string().regex(/^[A-Z][A-Z0-9_]{2,80}$/),
  value: z.string().max(4096).optional(),
  password: z.string().max(200).optional(),
});

async function authorise(formData: FormData) {
  // Each row's inputs carry the setting's name, so several open editors keep distinct ids.
  const key = formData.get("key");
  const field = (name: string) => (typeof key === "string" ? (formData.get(`${name}__${key}`) ?? undefined) : undefined);
  const parsed = input.safeParse({ key, value: field("value"), password: field("password") });
  if (!parsed.success) return { error: "That setting isn't one WonderHome knows." } as const;
  const entry = settingDefinition(parsed.data.key);
  if (!entry) return { error: "That setting isn't one WonderHome knows." } as const;
  const generate = field("generate") === "1";
  if (generate && !entry.generate) return { error: "WonderHome can't make this one; paste it instead." } as const;
  const staff = await platformStaff("settings.manage");
  if (!staff || !mayEdit(entry, staff.role)) return { error: entry.kind === "secret" ? "Only the owner can change a secret." : "Your role can see this setting but not change it." } as const;
  if (entry.kind === "secret") {
    if (!platformCan(staff, "secrets.manage")) return { error: "Only the owner can change a secret." } as const;
    const check = await confirmStaffPassword(parsed.data.password ?? "");
    if (check !== "ok") {
      return { error: stepUpRefusal(check) } as const;
    }
  }
  // "Generate new key": made here, on the server, after the step-up; it never reaches the browser.
  const value = generate && entry.generate ? randomBytes(entry.generate.bytes).toString("base64url") : (parsed.data.value ?? "");
  return { staff, entry, value } as const;
}

function done() {
  forgetRuntimeEnv();
  for (const page of PAGES) revalidatePath(page);
}

export async function saveSettingAction(_previous: SettingActionState, formData: FormData): Promise<SettingActionState> {
  const key = typeof formData.get("key") === "string" ? (formData.get("key") as string) : null;
  const checked = await authorise(formData);
  if ("error" in checked) return { tone: "risk", message: checked.error ?? null, key };
  const { staff, entry, value } = checked;
  // WonderHome's own model key is checked with its provider before it is kept (2026-11-21): a refused key is never
  // stored as working. A provider that can't be reached is no verdict, so the key is saved and the card says so.
  let checkedNote = "";
  let accepted = false;
  if (entry.key === "WONDERHOME_AI_KEY" && value.trim()) {
    const provider = chosenProvider(await freshRuntimeEnv());
    const check = await checkModelKey(provider, value);
    if (!check.ok && check.reason !== "unreachable") return { tone: "risk", message: `Not saved. ${keyCheckWords(check).message}`, key: entry.key };
    accepted = check.ok;
    checkedNote = ` ${keyCheckWords(check).message}`;
  }
  if (entry.key === "WONDERHOME_AI_PROVIDER") {
    const key = platformKey(await freshRuntimeEnv())?.key;
    const looksLike = key ? providerOfKey(key) : null;
    if (looksLike && looksLike !== value) checkedNote = ` The saved key looks like a ${PROVIDER_NAME[looksLike]} key, so it won't work with ${PROVIDER_NAME[value as ModelProvider] ?? value}: save a matching key next.`;
  }
  const result = await saveSetting(adminClientFor(adminGrant.platformAdmin(staff, `save the ${entry.key} setting`)), staff.profileId, entry.key, value);
  if (!result.ok) {
    const message =
      result.reason === "invalid"
        ? (result.message ?? `${entry.label} isn't valid.`)
        : result.reason === "limited"
          ? "That's a lot of changes in a minute. Wait a moment, then try again."
          : "It couldn't be saved just now. Nothing changed; try again.";
    return { tone: "risk", message, key: entry.key };
  }
  done();
  if (accepted) {
    const admin = adminClientFor(adminGrant.platformAdmin(staff, "close alerts on a replaced AI key"));
    await resolvePlatformKeyAlert(admin, value.trim());
    await supersedeStaleKeyAlerts(admin, await freshRuntimeEnv());
  }
  return {
    tone: checkedNote && !accepted && entry.key === "WONDERHOME_AI_KEY" ? "risk" : "info",
    message: (entry.kind === "secret" ? `Saved${result.last4 ? ` · ends in ${result.last4}` : ""}. WonderHome uses it within a minute, no redeploy.` : "Saved. WonderHome uses it within a minute, no redeploy.") + checkedNote,
    key: entry.key,
  };
}

const PROVIDER_NAME: Record<ModelProvider, string> = { anthropic: "Anthropic", google: "Google", openai: "OpenAI" };

function chosenProvider(env: Record<string, string | undefined>): ModelProvider {
  const named = env.WONDERHOME_AI_PROVIDER?.trim().toLowerCase();
  return (MODEL_PROVIDERS as readonly string[]).includes(named ?? "") ? (named as ModelProvider) : "anthropic";
}

export type KeyTestState = { tone: "info" | "risk" | null; message: string | null };

/**
 * "Test key": the key in use now, checked with its provider (2026-11-21). Staff who can manage settings only; the
 * key never leaves the server. A pass closes the open alert at once and any for keys no longer used.
 */
export async function testPlatformKeyAction(): Promise<KeyTestState> {
  const staff = await platformStaff("settings.manage");
  if (!staff) return { tone: "risk", message: "Your role can't test the key." };
  forgetRuntimeEnv();
  const env = await freshRuntimeEnv();
  const key = platformKey(env);
  if (!key) return { tone: "risk", message: "No key is saved yet. Save WonderHome's own AI key above, then test it." };
  const check = await checkModelKey(chosenProvider(env), key.key);
  const words = keyCheckWords(check);
  if (check.ok) {
    const admin = adminClientFor(adminGrant.platformAdmin(staff, "close alerts after a key test passed"));
    await resolvePlatformKeyAlert(admin, key.key);
    await supersedeStaleKeyAlerts(admin, env);
    for (const page of PAGES) revalidatePath(page);
  }
  return { tone: words.tone, message: `${words.message}${key.key.length >= 12 ? ` (the key ending in ${key.key.slice(-4)})` : ""}` };
}

export async function clearSettingAction(_previous: SettingActionState, formData: FormData): Promise<SettingActionState> {
  const key = typeof formData.get("key") === "string" ? (formData.get("key") as string) : null;
  const checked = await authorise(formData);
  if ("error" in checked) return { tone: "risk", message: checked.error ?? null, key };
  const { staff, entry } = checked;
  if (entry.keepSaved) return { tone: "risk", message: `${entry.label} can be replaced, not cleared: clearing it would stop every scheduled call.`, key: entry.key };
  const result = await clearSetting(adminClientFor(adminGrant.platformAdmin(staff, `clear the ${entry.key} setting`)), staff.profileId, entry.key);
  if (!result.ok) return { tone: "risk", message: result.reason === "limited" ? "That's a lot of changes in a minute. Wait a moment." : "It couldn't be cleared just now. Try again.", key: entry.key };
  done();
  return {
    tone: "info",
    // WonderHome's AI settings never fall back to Vercel (one place, 2026-11-21).
    message: STORE_ONLY_KEYS.includes(entry.key) ? (entry.kind === "secret" ? "Removed. WonderHome has no key of its own now; Vercel's copy is never used." : "Cleared. WonderHome uses the default.") : "Cleared. WonderHome goes back to the Vercel value, or the default.",
    key: entry.key,
  };
}

export type MoveActionState = { tone: "info" | "risk" | null; message: string | null; report: MoveReport | null };

/**
 * "Move all from Vercel" (owner, 2026-11-07): the owner alone; no password
 * step-up (owner, 2026-11-07: "no need to ask for this password"). Every movable setting Vercel has and the portal doesn't is
 * saved here in one go, then read back. Values are read from this server's
 * environment and never come back: the answer is counts, setting names and
 * words (`MoveReport`).
 */
export async function moveAllFromVercelAction(): Promise<MoveActionState> {
  const staff = await platformStaff("secrets.manage");
  if (!staff || staff.role !== "owner") return { tone: "risk", message: "Only the owner can move settings from Vercel.", report: null };
  const result = await moveAllFromEnvironment(adminClientFor(adminGrant.platformAdmin(staff, "move every setting from Vercel")), staff.profileId, process.env);
  if ("error" in result) {
    return {
      tone: "risk",
      message: result.error === "limited" ? "That's a lot of changes in a minute. Wait a moment, then try again. Nothing was moved." : "The settings store isn't reachable just now. Nothing was moved.",
      report: null,
    };
  }
  if (result.counts.moved + result.counts.mismatch > 0) done();
  const { moved, alreadyInPortal, notSet, mustStay, invalid, failed, mismatch } = result.counts;
  const problems = invalid + failed + mismatch;
  const message =
    moved === 0 && problems === 0
      ? `Nothing new to move: ${alreadyInPortal} already in the portal, ${notSet} not set in Vercel, ${mustStay} must stay in Vercel.`
      : `Moved ${moved}. ${alreadyInPortal} already in the portal, ${notSet} not set in Vercel, ${mustStay} must stay in Vercel.${problems ? ` ${problems} need a look (below).` : ""}`;
  return { tone: problems ? "risk" : "info", message, report: result };
}
