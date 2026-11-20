import "server-only";

import { cache } from "react";

import { keyFingerprint } from "@wonderhome/core/ai/key-alerts";
import { platformKey } from "@wonderhome/core/ai/model-key";
import { itemsReadWithoutModelSince, openPlatformKeyAlert, platformAlertLine } from "@wonderhome/core/ai/platform-key-alert";
import { adminClientFor, adminGrant } from "@wonderhome/core/db/admin-context";
import type { PlatformAdmin } from "@wonderhome/core/platform/admin";
import { freshRuntimeEnv } from "@wonderhome/core/platform/settings/runtime-env";

/**
 * What the platform admin AI card and Overview say about WonderHome's own key
 * (2026-11-21): whether one is in use, how it ends, and, when a provider is
 * refusing it, one line on what that has meant for families. Never the key:
 * "ends in XXXX" is all of it that leaves the server.
 */
export type PlatformKeyHealth = {
  provider: string | null;
  last4: string | null;
  /** The open alert in words, or null when none is open. */
  alertLine: string | null;
  /** How many homes answer with a key of their own (a count only, never which). */
  homesOnOwnKey?: number | null;
};

/** A count of homes on their own assistant key: Platform admin shows only this (2026-11-21). */
async function homesOnOwnKey(staff: PlatformAdmin): Promise<number | null> {
  try {
    const admin = adminClientFor(adminGrant.platformAdmin(staff, "count homes using an AI key of their own"));
    const { count, error } = await admin.from("household_ai_credentials").select("household_id", { count: "exact", head: true });
    return error ? null : (count ?? 0);
  } catch {
    return null;
  }
}

export async function platformKeyHealth(staff: PlatformAdmin): Promise<PlatformKeyHealth> {
  const [health, own] = await Promise.all([keyHealth(staff), homesOnOwnKey(staff)]);
  return { ...health, homesOnOwnKey: own };
}

async function keyHealth(staff: PlatformAdmin): Promise<PlatformKeyHealth> {
  try {
    const env = await freshRuntimeEnv();
    const key = platformKey(env);
    if (!key) return { provider: null, last4: null, alertLine: null };
    const last4 = key.key.length >= 12 ? key.key.slice(-4) : null;
    const admin = adminClientFor(adminGrant.platformAdmin(staff, "read the open alert on WonderHome's AI key"));
    const alert = await openPlatformKeyAlert(admin, env);
    if (!alert) return { provider: key.provider, last4, alertLine: null };
    const unread = await itemsReadWithoutModelSince(admin, alert.firstSeenAt);
    return { provider: key.provider, last4, alertLine: platformAlertLine(alert, unread) };
  } catch {
    return { provider: null, last4: null, alertLine: null };
  }
}

/** For a test: the fingerprint only, never the key. */
export function fingerprintForTest(key: string): string {
  return keyFingerprint(key);
}

/**
 * Whether WonderHome's own key is being refused right now: for the one calm
 * line an Admin sees in Settings → AI Assistant. A yes or no only, read with
 * the service role; no provider detail reaches a household.
 */
export const platformModelDown = cache(async (): Promise<boolean> => {
  try {
    const admin = adminClientFor(adminGrant.worker("settings-ai", "whether WonderHome's own AI key is refused right now"));
    const alert = await openPlatformKeyAlert(admin);
    return alert !== null && alert.kind !== "quota_exhausted";
  } catch {
    return false;
  }
});
