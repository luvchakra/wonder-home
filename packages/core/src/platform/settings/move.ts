import type { SupabaseClient } from "@supabase/supabase-js";

import { log } from "../../observability/logger";
import { PLATFORM_SETTINGS, STAYS_IN_VERCEL, UNUSED_IN_VERCEL, lastFourOf, validateSetting, type SettingDefinition } from "./registry";
import type { Env } from "./runtime-env";
import { saveSetting, settingStatuses, type SettingStatus } from "./store";

/**
 * "Move all from Vercel" (owner, 2026-11-07): every registry setting whose
 * value comes from the deployment's environment, and that has nothing saved
 * yet, is saved in the portal's store in one go, then read back and checked.
 *
 * Server only. Values go from `process.env` straight to the service-role
 * function and are never returned, logged or compared outside this module:
 * the result says, per setting, only what happened, in words. Nothing is
 * deleted in Vercel (the app holds no Vercel token), and the environment stays
 * the fallback in code, so the owner deletes the listed variables when ready.
 */

export type MoveOutcome =
  /** Saved now, and the read-back matches Vercel. */
  | "moved"
  /** Saved now, but the read-back doesn't match Vercel's value. */
  | "mismatch"
  /** Already saved in the portal; left as it is. */
  | "already"
  /** Vercel's value isn't one the setting accepts; not moved. */
  | "invalid"
  /** Couldn't be saved just now (store unreachable, rate limit, no Vault). */
  | "failed";

export type MoveItem = { key: string; label: string; secret: boolean; outcome: MoveOutcome; words: string };

export type MoveReport = {
  counts: { moved: number; alreadyInPortal: number; notSet: number; mustStay: number; invalid: number; failed: number; mismatch: number };
  items: MoveItem[];
  /** Vercel variables whose value is now saved and in use here: safe to delete there. */
  safeToDelete: string[];
  /** Variables set in Vercel that must stay there, with why. */
  mustStay: { key: string; why: string }[];
};

type Planned = { entry: SettingDefinition; value: string };

const WORDS: Record<MoveOutcome, (secret: boolean) => string> = {
  moved: (secret) => (secret ? "Moved. Its last four characters match Vercel's." : "Moved. The saved value matches Vercel's."),
  mismatch: () => "Saved, but what reads back doesn't match Vercel. Open the row and check it before deleting anything.",
  already: () => "Already saved in the portal. Left as it is.",
  invalid: () => "Not moved: Vercel's value isn't one this setting accepts. Open the row and enter it by hand.",
  failed: () => "Not moved just now. Nothing changed for this one; run it again in a minute.",
};

const item = (entry: SettingDefinition, outcome: MoveOutcome): MoveItem => ({
  key: entry.key,
  label: entry.label,
  secret: entry.kind === "secret",
  outcome,
  words: WORDS[outcome](entry.kind === "secret"),
});

const fromEnv = (env: Env, key: string) => env[key]?.trim() ?? "";

const STAYS = new Set(STAYS_IN_VERCEL.map((stay) => stay.key));

/** Pure: which settings would move, which are already here, invalid, or not set. */
export function planMove(statuses: ReadonlyMap<string, SettingStatus>, env: Env) {
  const toMove: Planned[] = [];
  const already: SettingDefinition[] = [];
  const invalid: SettingDefinition[] = [];
  let notSet = 0;
  for (const entry of PLATFORM_SETTINGS) {
    if (STAYS.has(entry.key)) continue; // never, even if one were added to the registry by mistake
    const raw = fromEnv(env, entry.key);
    if (!raw) {
      notSet += 1;
      continue;
    }
    if (statuses.get(entry.key)?.source === "saved") {
      already.push(entry);
      continue;
    }
    const checked = validateSetting(entry, raw);
    if (!checked.ok) invalid.push(entry);
    else toMove.push({ entry, value: checked.value });
  }
  return { toMove, already, invalid, notSet };
}

type ImportRow = { key: string; status: "moved" | "already" | "unavailable" };

/** One transaction (`platform_config_import`); null when that function isn't in the database yet. */
async function importAll(admin: SupabaseClient, actor: string, planned: Planned[]): Promise<Map<string, ImportRow["status"]> | null | "limited" | "error"> {
  const { data, error } = await admin.rpc("platform_config_import", {
    p_items: planned.map(({ entry, value }) => ({ key: entry.key, value, secret: entry.kind === "secret" })),
    p_actor: actor,
  });
  if (error) {
    if (error.code === "42883" || error.code === "PGRST202") return null;
    log.warn("platform settings move refused", { reason: error.code ?? "unknown", allow: ["reason"] });
    return error.code === "P0001" ? "limited" : "error";
  }
  const rows = ((data as { items?: ImportRow[] } | null)?.items ?? []) as ImportRow[];
  return new Map(rows.map((row) => [row.key, row.status]));
}

/** Before the migration: one setting at a time, through the manual save, stopping at the rate limit. */
async function saveOneByOne(admin: SupabaseClient, actor: string, planned: Planned[]): Promise<Map<string, ImportRow["status"]>> {
  const out = new Map<string, ImportRow["status"]>();
  for (const { entry, value } of planned) {
    const result = await saveSetting(admin, actor, entry.key, value);
    out.set(entry.key, result.ok ? "moved" : "unavailable");
    if (!result.ok && result.reason === "limited") break;
  }
  return out;
}

/** Whether the saved copy reads back as Vercel's value (secrets: by their last four only). */
function matches(entry: SettingDefinition, status: SettingStatus | undefined, value: string): boolean {
  if (!status || status.source !== "saved") return false;
  return entry.kind === "secret" ? status.last4 === lastFourOf(value) : status.value === value;
}

export async function moveAllFromEnvironment(admin: SupabaseClient, actorProfileId: string, env: Env): Promise<MoveReport | { error: "store" | "limited" }> {
  const before = await settingStatuses(admin, env);
  if (!before.storeReady) return { error: "store" };
  const plan = planMove(before.statuses, env);

  let saved = new Map<string, ImportRow["status"]>();
  if (plan.toMove.length > 0) {
    const imported = await importAll(admin, actorProfileId, plan.toMove);
    if (imported === "limited") return { error: "limited" };
    if (imported === "error") return { error: "store" };
    saved = imported ?? (await saveOneByOne(admin, actorProfileId, plan.toMove));
  }

  // Read everything back, as the screens do, and compare with Vercel.
  const after = plan.toMove.length > 0 ? await settingStatuses(admin, env) : before;
  const items: MoveItem[] = [];
  for (const { entry, value } of plan.toMove) {
    const status = saved.get(entry.key);
    if (status === "already") items.push(item(entry, "already"));
    else if (status !== "moved") items.push(item(entry, "failed"));
    else items.push(item(entry, matches(entry, after.statuses.get(entry.key), value) ? "moved" : "mismatch"));
  }
  for (const entry of plan.already) items.push(item(entry, "already"));
  for (const entry of plan.invalid) items.push(item(entry, "invalid"));

  const count = (outcome: MoveOutcome) => items.filter((row) => row.outcome === outcome).length;
  const safeToDelete = [
    ...items.filter((row) => row.outcome === "moved" || row.outcome === "already").map((row) => row.key),
    ...UNUSED_IN_VERCEL.filter((key) => fromEnv(env, key) !== ""),
  ];
  const mustStay = STAYS_IN_VERCEL.filter((stay) => fromEnv(env, stay.key) !== "");
  const report: MoveReport = {
    counts: {
      moved: count("moved"),
      alreadyInPortal: count("already"),
      notSet: plan.notSet,
      mustStay: mustStay.length,
      invalid: count("invalid"),
      failed: count("failed"),
      mismatch: count("mismatch"),
    },
    items,
    safeToDelete,
    mustStay: mustStay.map((stay) => ({ key: stay.key, why: stay.why })),
  };
  // Counts only: never a key's value, not even a secret's last four.
  log.info("platform settings moved from the environment", { ...report.counts, allow: Object.keys(report.counts) });
  return report;
}
