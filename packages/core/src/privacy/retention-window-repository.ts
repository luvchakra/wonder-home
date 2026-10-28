import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import { savePolicy } from "../household/configuration-repository";

/**
 * The household's data-retention window (the owner, 2026-10-28; design in
 * `docs/data-retention.md`).
 *
 * How long a passed, handled entry is kept before periodic cleanup removes it.
 * Stored like every other household setting: one versioned row in `policies`,
 * category `privacy`, written only by an Admin (the `policies_write_admin` RLS
 * enforces that) and audited by `savePolicy`. The number lives in the rule as
 * `{ days }`; `null` means "keep everything" (cleanup off for this household).
 *
 * It fails to the safe side, which for retention is *keep*. A successful read
 * with no row is the default (90 days). A *failed* read (`ok: false`) tells the
 * cleanup job to skip this household this run rather than clean on a guess, and
 * a stored value that is not a sensible number is treated as "off" rather than
 * cleaning aggressively.
 */

export const RETENTION_WINDOW_CATEGORY = "privacy" as const;
export const RETENTION_WINDOW_POLICY_NAME = "Clean up passed entries after";

export const DEFAULT_RETENTION_WINDOW_DAYS = 90;
/** Never target rows younger than this, whatever a household configured. */
export const MIN_RETENTION_WINDOW_DAYS = 7;
export const MAX_RETENTION_WINDOW_DAYS = 3650;

/** The windows an Admin may pick from (design rule 20: a choice is picked, not typed). */
export const RETENTION_WINDOW_CHOICES = [30, 60, 90, 180, 365] as const;

export type RetentionWindow = {
  /** Days to keep a passed entry; `null` means keep everything (cleanup off). */
  days: number | null;
  /** True only when the setting was read successfully. `false` → skip cleanup. */
  ok: boolean;
};

/** A stored rule to a window: a sensible number, or `null` (off) for anything else. */
export function parseRetentionWindow(rule: unknown): number | null {
  if (rule && typeof rule === "object" && "days" in rule) {
    const value = (rule as { days: unknown }).days;
    if (value === null) return null;
    if (typeof value === "number" && Number.isInteger(value) && value >= MIN_RETENTION_WINDOW_DAYS && value <= MAX_RETENTION_WINDOW_DAYS) {
      return value;
    }
  }
  // A row with a missing or malformed value: keep everything, the safe side.
  return null;
}

/** One household's window, for the Settings screen and single-household work. */
export async function loadRetentionWindow(supabase: SupabaseClient, householdId: string): Promise<RetentionWindow> {
  const { data, error } = await supabase
    .from("policies")
    .select("rule")
    .eq("household_id", householdId)
    .eq("category", RETENTION_WINDOW_CATEGORY)
    .eq("name", RETENTION_WINDOW_POLICY_NAME)
    .eq("active", true)
    .limit(1);
  if (error) return { days: DEFAULT_RETENTION_WINDOW_DAYS, ok: false };
  const rows = (data as { rule: unknown }[] | null) ?? [];
  if (rows.length === 0) return { days: DEFAULT_RETENTION_WINDOW_DAYS, ok: true };
  return { days: parseRetentionWindow(rows[0]!.rule), ok: true };
}

/**
 * Every household's window in one read, for the cleanup job. A household with
 * no row is absent from the map and the caller applies the default; `ok: false`
 * means the whole read failed and the run must be skipped (the safe side).
 */
export async function loadRetentionWindows(admin: SupabaseClient): Promise<{ windows: Map<string, number | null>; ok: boolean }> {
  const { data, error } = await admin
    .from("policies")
    .select("household_id, rule")
    .eq("category", RETENTION_WINDOW_CATEGORY)
    .eq("name", RETENTION_WINDOW_POLICY_NAME)
    .eq("active", true)
    .limit(100_000);
  if (error) return { windows: new Map(), ok: false };
  const windows = new Map<string, number | null>();
  for (const row of (data as { household_id: string; rule: unknown }[] | null) ?? []) {
    windows.set(row.household_id, parseRetentionWindow(row.rule));
  }
  return { windows, ok: true };
}

/** Admin sets (or clears, with `days: null`) the household's retention window. */
export async function saveRetentionWindow(
  supabase: SupabaseClient,
  input: { householdId: string; actorMemberId: string; days: number | null },
): Promise<{ id: string }> {
  const { days } = input;
  if (days !== null && (!Number.isInteger(days) || days < MIN_RETENTION_WINDOW_DAYS || days > MAX_RETENTION_WINDOW_DAYS)) {
    throw ApiError.badRequest(`A retention window must be between ${MIN_RETENTION_WINDOW_DAYS} and ${MAX_RETENTION_WINDOW_DAYS} days, or off.`);
  }
  const saved = await savePolicy(supabase, {
    householdId: input.householdId,
    actorMemberId: input.actorMemberId,
    category: RETENTION_WINDOW_CATEGORY,
    name: RETENTION_WINDOW_POLICY_NAME,
    rule: { days },
  });
  return { id: saved.id };
}
