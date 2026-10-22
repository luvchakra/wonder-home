import type { SupabaseClient } from "@supabase/supabase-js";

import { savePolicy } from "../household/configuration-repository";
import { REMINDER_POLICIES, TUNABLE_CATEGORIES, isPresetFor, type TunableCategory } from "./policies";
import { ROUTABLE_CHANNELS, type RoutableChannel } from "./routing";
import type { QuietHours } from "./timing";

/**
 * How the whole household is notified (the owner, 2026-10-22: "notification
 * related admin settings that can control the notification experience of all
 * users"). An Admin decides, for everyone:
 * - which kinds of reminder the household uses at all (`kindsOff`);
 * - the timing everyone starts from, until a person picks their own (`defaults`);
 * - which channels beyond the app reach anyone here (`channelsOff`);
 * - whether an unanswered reminder may go to a second channel (`channelStep`)
 *   and then to the responsibility's backup (`backupStep`);
 * - the household's quiet hours, for anyone who has not set their own.
 *
 * Kept like "Ask before acting on what I say": one versioned `policies` row,
 * category `notifications`, so a change is audited and Admins only, and every
 * member reads it. Quiet hours keep their own row ("Quiet hours"), which
 * HomeTalk already writes. A person's own choices narrow these, never widen
 * them: nobody turns on a kind or a channel the household turned off. A
 * critical alert still goes wherever it can reach someone.
 */

export const HOUSEHOLD_NOTIFICATIONS_POLICY = "Household notifications";
export const QUIET_HOURS_POLICY = "Quiet hours";

export type HouseholdNotificationSettings = {
  kindsOff: readonly TunableCategory[];
  defaults: Partial<Record<TunableCategory, string>>;
  channelsOff: readonly RoutableChannel[];
  channelStep: boolean;
  backupStep: boolean;
};

export const HOUSEHOLD_NOTIFICATION_DEFAULTS: HouseholdNotificationSettings = {
  kindsOff: [],
  defaults: {},
  channelsOff: [],
  channelStep: true,
  backupStep: true,
};

/** Reads a stored rule, keeping only what is still a known kind, preset or channel. Anything else is the default. */
export function parseHouseholdNotificationSettings(rule: unknown): HouseholdNotificationSettings {
  if (!rule || typeof rule !== "object") return HOUSEHOLD_NOTIFICATION_DEFAULTS;
  const raw = rule as Record<string, unknown>;
  const kinds = new Set<string>(TUNABLE_CATEGORIES);
  const channels = new Set<string>(ROUTABLE_CHANNELS);
  const list = (value: unknown) => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []);
  const defaults: Partial<Record<TunableCategory, string>> = {};
  if (raw.defaults && typeof raw.defaults === "object") {
    for (const [category, preset] of Object.entries(raw.defaults as Record<string, unknown>)) {
      if (kinds.has(category) && typeof preset === "string" && isPresetFor(category as TunableCategory, preset)) defaults[category as TunableCategory] = preset;
    }
  }
  return {
    kindsOff: [...new Set(list(raw.kindsOff).filter((kind) => kinds.has(kind)))] as TunableCategory[],
    defaults,
    channelsOff: [...new Set(list(raw.channelsOff).filter((channel) => channels.has(channel)))] as RoutableChannel[],
    channelStep: raw.channelStep !== false,
    backupStep: raw.backupStep !== false,
  };
}

/** The timing a person gets for a kind: their own pick, else the household's, else the policy's. */
export function presetForMember(settings: HouseholdNotificationSettings, category: TunableCategory, chosen: string | null | undefined): string {
  if (chosen && isPresetFor(category, chosen)) return chosen;
  return settings.defaults[category] ?? REMINDER_POLICIES[category].defaultPreset;
}

/** Whether a channel beyond the app may carry this to anyone here. A critical alert always may. */
export function householdAllowsChannel(settings: HouseholdNotificationSettings, channel: string, priority: string): boolean {
  if (priority === "critical") return true;
  return !(settings.channelsOff as readonly string[]).includes(channel);
}

export async function loadHouseholdNotificationSettings(client: SupabaseClient, householdId: string): Promise<HouseholdNotificationSettings> {
  const { data, error } = await client
    .from("policies")
    .select("rule")
    .eq("household_id", householdId)
    .eq("category", "notifications")
    .eq("name", HOUSEHOLD_NOTIFICATIONS_POLICY)
    .eq("active", true)
    .maybeSingle();
  // An unreadable row is the default: everything on, as it was before the household chose.
  if (error || !data) return HOUSEHOLD_NOTIFICATION_DEFAULTS;
  return parseHouseholdNotificationSettings((data as { rule: unknown }).rule);
}

export async function saveHouseholdNotificationSettings(
  supabase: SupabaseClient,
  input: { householdId: string; actorMemberId: string; settings: HouseholdNotificationSettings },
): Promise<void> {
  const clean = parseHouseholdNotificationSettings(input.settings);
  // Only a real choice is kept: a timing equal to the policy's own follows the policy if that ever changes.
  const defaults = Object.fromEntries(Object.entries(clean.defaults).filter(([category, preset]) => preset !== REMINDER_POLICIES[category as TunableCategory].defaultPreset));
  const next = { ...clean, defaults };
  // Saving what is already in force writes nothing, so the audit trail only records changes.
  if (sameSettings(await loadHouseholdNotificationSettings(supabase, input.householdId), next)) return;
  await savePolicy(supabase, {
    householdId: input.householdId,
    actorMemberId: input.actorMemberId,
    category: "notifications",
    name: HOUSEHOLD_NOTIFICATIONS_POLICY,
    rule: { ...next },
  });
}

export async function loadHouseholdQuietHours(client: SupabaseClient, householdId: string): Promise<QuietHours | null> {
  const { data } = await client
    .from("policies")
    .select("rule")
    .eq("household_id", householdId)
    .eq("category", "notifications")
    .eq("name", QUIET_HOURS_POLICY)
    .eq("active", true)
    .maybeSingle();
  return quietFromPolicy((data as { rule: unknown } | null)?.rule);
}

/** Household quiet hours, by the hour (the shape HomeTalk already writes); null turns them off. */
export async function saveHouseholdQuietHours(
  supabase: SupabaseClient,
  input: { householdId: string; actorMemberId: string; quiet: { fromHour: number; untilHour: number } | null },
): Promise<void> {
  const quiet = input.quiet;
  if (quiet && (!validHour(quiet.fromHour) || !validHour(quiet.untilHour) || quiet.fromHour === quiet.untilHour)) {
    throw new Error("Quiet hours need two different hours.");
  }
  const current = await loadHouseholdQuietHours(supabase, input.householdId);
  const unchanged = quiet ? current?.fromMinute === quiet.fromHour * 60 && current?.untilMinute === quiet.untilHour * 60 : current === null;
  if (unchanged) return;
  await savePolicy(supabase, {
    householdId: input.householdId,
    actorMemberId: input.actorMemberId,
    category: "notifications",
    name: QUIET_HOURS_POLICY,
    rule: quiet ? { quietFromHour: quiet.fromHour, quietUntilHour: quiet.untilHour } : { off: true },
  });
}

function sameSettings(a: HouseholdNotificationSettings, b: HouseholdNotificationSettings): boolean {
  const sorted = (list: readonly string[]) => [...list].sort().join(",");
  const keys = new Set([...Object.keys(a.defaults), ...Object.keys(b.defaults)]) as Set<TunableCategory>;
  return (
    sorted(a.kindsOff) === sorted(b.kindsOff) &&
    sorted(a.channelsOff) === sorted(b.channelsOff) &&
    a.channelStep === b.channelStep &&
    a.backupStep === b.backupStep &&
    [...keys].every((key) => presetForMember(a, key, null) === presetForMember(b, key, null))
  );
}

/** The household's quiet hours as stored by the hour; anything else (including "off") is none. */
export function quietFromPolicy(rule: unknown): QuietHours | null {
  if (!rule || typeof rule !== "object") return null;
  const { quietFromHour, quietUntilHour } = rule as { quietFromHour?: unknown; quietUntilHour?: unknown };
  if (typeof quietFromHour !== "number" || typeof quietUntilHour !== "number") return null;
  if (quietFromHour < 0 || quietFromHour > 23 || quietUntilHour < 0 || quietUntilHour > 23) return null;
  return { fromMinute: quietFromHour * 60, untilMinute: quietUntilHour * 60 };
}

function validHour(hour: number): boolean {
  return Number.isInteger(hour) && hour >= 0 && hour <= 23;
}
