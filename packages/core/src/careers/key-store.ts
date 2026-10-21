import type { SupabaseClient } from "@supabase/supabase-js";

import { log } from "../observability/logger";
import { CAREERS_KEY_PATTERN, lastFour, maskCareersKey } from "./wonderjobs";

/**
 * Where the WonderJobs career-site key comes from: the one saved in Vault by a
 * platform admin (`public.careers_key_*`, service role only), and only when
 * there is none, the `WONDERJOBS_CAREERS_KEY` environment variable. Every
 * function here takes the service-role client and is called by the server
 * alone, after its own authorization check.
 *
 * The key never leaves this module except to `createWonderJobsClient`. What
 * any screen is given is `CareersKeyStatus`: a mask and where it came from.
 */

export type CareersKeySource = "database" | "environment";

export type CareersKeyStatus =
  | { configured: false }
  | { configured: true; source: CareersKeySource; masked: string; updatedAt: string | null };

type Env = Record<string, string | undefined>;

function envKey(env: Env): string | null {
  const key = env.WONDERJOBS_CAREERS_KEY?.trim();
  return key && CAREERS_KEY_PATTERN.test(key) ? key : null;
}

/** The key to call WonderJobs with, or null when careers isn't set up. */
export async function readCareersKey(admin: SupabaseClient, env: Env = process.env): Promise<{ key: string; source: CareersKeySource } | null> {
  try {
    const { data, error } = await admin.rpc("careers_key_read");
    if (error) throw error;
    if (typeof data === "string" && CAREERS_KEY_PATTERN.test(data)) return { key: data, source: "database" };
  } catch (thrown) {
    // The stored key could not be read: say so (without it), then try the fallback.
    log.warn("careers key unreadable", { reason: (thrown as { code?: string } | null)?.code ?? (thrown instanceof Error ? thrown.name : "unknown") });
  }
  const fallback = envKey(env);
  return fallback ? { key: fallback, source: "environment" } : null;
}

/** What the admin screen shows: never the key, only its mask. */
export async function careersKeyStatus(admin: SupabaseClient, env: Env = process.env): Promise<CareersKeyStatus> {
  try {
    const { data, error } = await admin.rpc("careers_key_status");
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as { key_last4?: string | null; updated_at?: string | null } | null;
    if (row?.key_last4) return { configured: true, source: "database", masked: maskCareersKey(row.key_last4)!, updatedAt: row.updated_at ?? null };
  } catch (thrown) {
    log.warn("careers key status unreadable", { reason: (thrown as { code?: string } | null)?.code ?? (thrown instanceof Error ? thrown.name : "unknown") });
  }
  const fallback = envKey(env);
  return fallback ? { configured: true, source: "environment", masked: maskCareersKey(lastFour(fallback))!, updatedAt: null } : { configured: false };
}

export type SaveKeyResult = { ok: true; masked: string } | { ok: false; reason: "invalid" | "unavailable" };

/** Saves a key in Vault and records who did it (the database writes the audit row in the same call). */
export async function saveCareersKey(admin: SupabaseClient, actorProfileId: string, key: string): Promise<SaveKeyResult> {
  const trimmed = key.trim();
  if (!CAREERS_KEY_PATTERN.test(trimmed)) return { ok: false, reason: "invalid" };
  const { data, error } = await admin.rpc("careers_key_set", { p_key: trimmed, p_actor: actorProfileId });
  if (error) {
    log.warn("careers key not saved", { reason: error.code ?? "unknown" });
    return { ok: false, reason: error.code === "22023" ? "invalid" : "unavailable" };
  }
  log.info("careers key saved", { last4: typeof data === "string" ? data : lastFour(trimmed) });
  return { ok: true, masked: maskCareersKey(lastFour(trimmed))! };
}

export async function clearCareersKey(admin: SupabaseClient, actorProfileId: string): Promise<boolean> {
  const { error } = await admin.rpc("careers_key_clear", { p_actor: actorProfileId });
  if (error) {
    log.warn("careers key not cleared", { reason: error.code ?? "unknown" });
    return false;
  }
  log.info("careers key cleared");
  return true;
}

export type CareersKeyEvent = { action: "set" | "clear"; masked: string | null; at: string; actorProfileId: string | null };

/** The latest saves and clears, for the admin screen. */
export async function recentCareersKeyEvents(admin: SupabaseClient, limit = 10): Promise<CareersKeyEvent[]> {
  const { data, error } = await admin.from("careers_key_events").select("action, key_last4, actor_profile_id, created_at").order("created_at", { ascending: false }).limit(limit);
  if (error) return [];
  return ((data ?? []) as { action: "set" | "clear"; key_last4: string | null; actor_profile_id: string | null; created_at: string }[]).map((row) => ({
    action: row.action,
    masked: maskCareersKey(row.key_last4),
    at: row.created_at,
    actorProfileId: row.actor_profile_id,
  }));
}
