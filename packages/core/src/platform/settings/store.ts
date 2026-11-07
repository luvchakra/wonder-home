import type { SupabaseClient } from "@supabase/supabase-js";

import { log } from "../../observability/logger";
import { PLATFORM_SETTINGS, lastFourOf, settingDefinition, validateSetting, type SettingDefinition } from "./registry";
import type { Env, StoredSettings } from "./runtime-env";

/**
 * Reads and writes `public.platform_config` (migration
 * 20261107210000_platform_config.sql). Every function takes the
 * service-role client and is called by the server alone, after its own
 * platform-staff check. A secret's value goes in once, on save, and comes out
 * only through `loadStoredSettings`, for the server's own readers; a screen is
 * given `SettingStatus`, which never holds one.
 */

/** Where the value a reader uses comes from. */
export type SettingSource = "saved" | "environment" | "default" | "unset";

export type SettingStatus = {
  key: string;
  source: SettingSource;
  /** The value in use, for a non-secret setting; always null for a secret. */
  value: string | null;
  /** The last four characters of a secret in use, when it is long enough to show any. */
  last4: string | null;
  /** Whether Vercel also has the variable (so it can be deleted once a value is saved). */
  inEnvironment: boolean;
  updatedAt: string | null;
};

type StatusRow = { key: string; secret: boolean; value: string | null; value_last4: string | null; updated_at: string | null };

function reason(thrown: unknown): string {
  return (thrown as { code?: string } | null)?.code ?? (thrown instanceof Error ? thrown.name : "unknown");
}

/** Every saved value, secrets included, keyed by name: the runtime loader's source. */
export async function loadStoredSettings(admin: SupabaseClient): Promise<StoredSettings> {
  const { data, error } = await admin.rpc("platform_config_read");
  if (error) {
    // 42883 / PGRST202: the migration is not applied yet; the environment answers alone.
    if (error.code === "42883" || error.code === "PGRST202") return {};
    throw error;
  }
  const rows = (data ?? []) as { key: string; value: string | null }[];
  const out: Record<string, string> = {};
  for (const row of rows) if (settingDefinition(row.key) && typeof row.value === "string") out[row.key] = row.value;
  return out;
}

/** Pure: a status for one entry from its saved row (if any) and the environment. */
export function statusFor(entry: SettingDefinition, row: StatusRow | undefined, env: Env): SettingStatus {
  const fromEnv = env[entry.key]?.trim() ?? "";
  const inEnvironment = fromEnv !== "";
  if (row) {
    return {
      key: entry.key,
      source: "saved",
      value: entry.kind === "secret" ? null : row.value,
      last4: entry.kind === "secret" ? row.value_last4 : null,
      inEnvironment,
      updatedAt: row.updated_at,
    };
  }
  if (inEnvironment) {
    return { key: entry.key, source: "environment", value: entry.kind === "secret" ? null : fromEnv, last4: entry.kind === "secret" ? lastFourOf(fromEnv) : null, inEnvironment, updatedAt: null };
  }
  if (entry.defaultValue !== null) return { key: entry.key, source: "default", value: entry.kind === "secret" ? null : entry.defaultValue, last4: null, inEnvironment, updatedAt: null };
  return { key: entry.key, source: "unset", value: null, last4: null, inEnvironment, updatedAt: null };
}

/** What every setting is now and where it comes from. Never a secret's value. */
export async function settingStatuses(admin: SupabaseClient, env: Env = process.env): Promise<{ statuses: Map<string, SettingStatus>; storeReady: boolean }> {
  let rows: StatusRow[] = [];
  let storeReady = true;
  const { data, error } = await admin.rpc("platform_config_status");
  if (error) {
    storeReady = false;
    log.warn("platform settings status unreadable", { reason: reason(error) });
  } else {
    rows = (data ?? []) as StatusRow[];
  }
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const statuses = new Map<string, SettingStatus>();
  for (const entry of PLATFORM_SETTINGS) statuses.set(entry.key, statusFor(entry, byKey.get(entry.key), env));
  return { statuses, storeReady };
}

export type SaveSettingResult = { ok: true; last4: string | null } | { ok: false; reason: "unknown" | "invalid" | "limited" | "unavailable"; message?: string };

/** Validates and saves one setting; the database writes the audit row in the same call. */
export async function saveSetting(admin: SupabaseClient, actorProfileId: string, key: string, raw: string): Promise<SaveSettingResult> {
  const entry = settingDefinition(key);
  if (!entry) return { ok: false, reason: "unknown" };
  const checked = validateSetting(entry, raw);
  if (!checked.ok) return { ok: false, reason: "invalid", message: checked.message };
  const { data, error } =
    entry.kind === "secret"
      ? await admin.rpc("platform_config_secret_set", { p_key: key, p_value: checked.value, p_actor: actorProfileId })
      : await admin.rpc("platform_config_set", { p_key: key, p_value: checked.value, p_actor: actorProfileId });
  if (error) {
    log.warn("platform setting not saved", { setting: key, reason: error.code ?? "unknown", allow: ["setting"] });
    if (error.code === "P0001") return { ok: false, reason: "limited" };
    return { ok: false, reason: error.code === "22023" ? "invalid" : "unavailable" };
  }
  // Never the value; for a secret, not even its last four in the log.
  log.info("platform setting saved", { setting: key, isSecret: entry.kind === "secret", allow: ["setting", "isSecret"] });
  return { ok: true, last4: entry.kind === "secret" ? (typeof data === "string" ? data : null) : null };
}

/** Removes a saved value, so the reader goes back to the environment, then its default. */
export async function clearSetting(admin: SupabaseClient, actorProfileId: string, key: string): Promise<SaveSettingResult> {
  if (!settingDefinition(key)) return { ok: false, reason: "unknown" };
  const { error } = await admin.rpc("platform_config_clear", { p_key: key, p_actor: actorProfileId });
  if (error) {
    log.warn("platform setting not cleared", { setting: key, reason: error.code ?? "unknown", allow: ["setting"] });
    return { ok: false, reason: error.code === "P0001" ? "limited" : "unavailable" };
  }
  log.info("platform setting cleared", { setting: key, allow: ["setting"] });
  return { ok: true, last4: null };
}

export type SettingChange = {
  at: string;
  key: string;
  label: string;
  action: "set" | "clear";
  secret: boolean;
  /** Old and new, for a setting only. */
  from: string | null;
  to: string | null;
  actorProfileId: string | null;
};

/** The latest changes, newest first, for the Security page. */
export async function recentSettingChanges(admin: SupabaseClient, limit = 25): Promise<SettingChange[]> {
  const { data, error } = await admin
    .from("audit_events")
    .select("created_at, actor_profile_id, metadata")
    .is("household_id", null)
    .eq("event_type", "platform.config_changed")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return ((data ?? []) as { created_at: string; actor_profile_id: string | null; metadata: Record<string, unknown> }[]).map((row) => {
    const key = String(row.metadata.key ?? "");
    const secret = row.metadata.secret === true;
    return {
      at: row.created_at,
      key,
      label: settingDefinition(key)?.label ?? key,
      action: row.metadata.action === "clear" ? "clear" : "set",
      secret,
      from: secret ? null : ((row.metadata.old as string | null | undefined) ?? null),
      to: secret ? null : ((row.metadata.new as string | null | undefined) ?? null),
      actorProfileId: row.actor_profile_id,
    };
  });
}
