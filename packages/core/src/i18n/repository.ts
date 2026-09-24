import type { SupabaseClient } from "@supabase/supabase-js";

import { auditChange } from "../api/audit";
import { ApiError } from "../api/errors";
import { invalidatesContext } from "../context/invalidation";
import { isHouseholdAdmin } from "../identity/households";
import type { HouseholdMembership } from "../identity/schemas";
import { log } from "../observability/logger";
import {
  DATE_FORMATS,
  isCurrency,
  isLanguage,
  isRegion,
  isTimezone,
  MEASUREMENT_SYSTEMS,
  TIME_FORMATS,
  type DateFormat,
  type LanguageCode,
  type MeasurementSystem,
  type RegionCode,
  type TimeFormat,
} from "./locales";
import { LOCALE_SETUP_STEPS, LOCALE_SETUP_VERSION, type LocaleSetupStatus, type LocaleSetupStep } from "./preferences";

/**
 * Saving language, region and format preferences (story 22-002).
 *
 * Two kinds of choice, two sets of hands, and no new permission model:
 *   - a person's own presentation (language, date and time format, units) is
 *     theirs to change, or an Admin's — `household_members` RLS and its
 *     self-update guard already say exactly that;
 *   - the household's region, currency, time zone, default units and default
 *     language are an Admin's, through `households_update_admin`.
 * The checks below only turn a refusal into a clear message; the database
 * is what refuses. Every value is checked against the closed lists first,
 * so nothing a form sends can smuggle in an arbitrary string.
 */

export type MemberLocaleUpdate = {
  memberId: string;
  /** `null` clears a choice back to the household's. */
  language?: LanguageCode | null;
  dateFormat?: DateFormat | null;
  timeFormat?: TimeFormat | null;
  measurement?: MeasurementSystem | null;
};

export async function saveMemberLocale(supabase: SupabaseClient, actor: HouseholdMembership, input: MemberLocaleUpdate): Promise<void> {
  if (!isHouseholdAdmin(actor) && input.memberId !== actor.memberId) {
    throw ApiError.forbidden("You can change your own language, or an Admin can change anyone's.");
  }
  const patch: Record<string, unknown> = {};
  if (input.language !== undefined) {
    if (input.language !== null && !isLanguage(input.language)) throw ApiError.badRequest("That language is not one WonderHome speaks yet.");
    patch.language = input.language;
  }
  if (input.dateFormat !== undefined) {
    if (input.dateFormat !== null && !(DATE_FORMATS as readonly string[]).includes(input.dateFormat)) throw ApiError.badRequest("Choose a date format from the list.");
    patch.date_format = input.dateFormat;
  }
  if (input.timeFormat !== undefined) {
    if (input.timeFormat !== null && !(TIME_FORMATS as readonly string[]).includes(input.timeFormat)) throw ApiError.badRequest("Choose 12 or 24 hour.");
    patch.time_format = input.timeFormat;
  }
  if (input.measurement !== undefined) {
    if (input.measurement !== null && !(MEASUREMENT_SYSTEMS as readonly string[]).includes(input.measurement)) throw ApiError.badRequest("Choose metric or imperial.");
    patch.measurement_system = input.measurement;
  }
  if (Object.keys(patch).length === 0) return;

  const { data, error } = await supabase
    .from("household_members")
    .update(patch)
    .eq("id", input.memberId)
    .eq("household_id", actor.household.id)
    .select("id");
  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("You can change your own language, or an Admin can change anyone's.");
    throw new Error(`saveMemberLocale failed: ${error.code ?? "unknown"}`);
  }
  // RLS filters rather than errors: no row back means it was not theirs to change.
  if (!data || data.length === 0) throw ApiError.forbidden("You can change your own language, or an Admin can change anyone's.");

  await auditChange({
    householdId: actor.household.id,
    actorMemberId: actor.memberId,
    eventType: "member.locale_updated",
    targetTable: "household_members",
    targetId: input.memberId,
    metadata: { fields: Object.keys(patch) },
  });
}

export type HouseholdLocaleUpdate = {
  region?: RegionCode;
  currency?: string;
  timezone?: string;
  measurement?: MeasurementSystem;
  /** `null` goes back to WonderHome's default for anyone who has not chosen. */
  language?: LanguageCode | null;
};

async function saveHouseholdLocaleImpl(supabase: SupabaseClient, actor: HouseholdMembership, input: HouseholdLocaleUpdate): Promise<void> {
  if (!isHouseholdAdmin(actor)) throw ApiError.forbidden("Only an Admin can change this for the household.");
  const patch: Record<string, unknown> = {};
  if (input.region !== undefined) {
    if (!isRegion(input.region)) throw ApiError.badRequest("Choose a region from the list.");
    patch.region = input.region;
  }
  if (input.currency !== undefined) {
    // Any real ISO 4217 code is accepted; the list only offers the common ones.
    if (!isCurrency(input.currency) && !/^[A-Z]{3}$/.test(input.currency)) throw ApiError.badRequest("A currency is three letters, like INR or USD.");
    patch.currency = input.currency;
  }
  if (input.timezone !== undefined) {
    if (!isTimezone(input.timezone)) throw ApiError.badRequest("Choose a time zone like Asia/Kolkata — not an offset like +05:30.");
    patch.timezone = input.timezone;
  }
  if (input.measurement !== undefined) {
    if (!(MEASUREMENT_SYSTEMS as readonly string[]).includes(input.measurement)) throw ApiError.badRequest("Choose metric or imperial.");
    patch.measurement_system = input.measurement;
  }
  if (input.language !== undefined) {
    if (input.language !== null && !isLanguage(input.language)) throw ApiError.badRequest("That language is not one WonderHome speaks yet.");
    patch.default_language = input.language;
  }
  if (Object.keys(patch).length === 0) return;

  const { data, error } = await supabase.from("households").update(patch).eq("id", actor.household.id).select("id");
  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only an Admin can change this for the household.");
    throw new Error(`saveHouseholdLocale failed: ${error.code ?? "unknown"}`);
  }
  if (!data || data.length === 0) throw ApiError.forbidden("Only an Admin can change this for the household.");

  await auditChange({
    householdId: actor.household.id,
    actorMemberId: actor.memberId,
    eventType: "household.locale_updated",
    targetTable: "households",
    targetId: actor.household.id,
    // Which settings changed, never a before/after that says where a family lives.
    metadata: { fields: Object.keys(patch) },
  });
}

/** The zone moves reminders and "today" for HomeBrain, so its context is refreshed. */
export const saveHouseholdLocale = invalidatesContext(saveHouseholdLocaleImpl, (_supabase, actor) => actor.household.id);

/** Where this person is in the optional setup. Their own row only. */
export async function updateLocaleSetup(
  supabase: SupabaseClient,
  actor: HouseholdMembership,
  input: { status?: LocaleSetupStatus; step?: LocaleSetupStep; dismissPrompt?: boolean },
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (input.status) {
    patch.locale_setup_status = input.status;
    patch.locale_setup_at = new Date().toISOString();
    if (input.status === "completed") patch.locale_setup_version = LOCALE_SETUP_VERSION;
  }
  if (input.step && (LOCALE_SETUP_STEPS as readonly string[]).includes(input.step)) patch.locale_setup_step = input.step;
  if (input.dismissPrompt) patch.locale_prompt_dismissed_at = new Date().toISOString();
  if (Object.keys(patch).length === 0) return;
  const { error } = await supabase.from("household_members").update(patch).eq("id", actor.memberId).eq("household_id", actor.household.id);
  if (error) throw new Error(`updateLocaleSetup failed: ${error.code ?? "unknown"}`);
}

export type LocaleEvent =
  | "localization_setup_started"
  | "language_selected"
  | "region_selected"
  | "currency_selected"
  | "timezone_selected"
  | "measurement_system_selected"
  | "localization_setup_completed"
  | "localization_setup_skipped"
  | "localization_setup_resumed"
  | "language_changed"
  | "currency_changed"
  | "timezone_changed"
  | "member_language_changed";

/** Closed words and codes only (a language or currency code is not personal). Never throws. */
export async function recordLocaleEvent(
  supabase: SupabaseClient,
  input: { householdId: string; event: LocaleEvent; step?: string; detail?: Record<string, string | number | boolean> },
): Promise<void> {
  try {
    const { error } = await supabase
      .from("onboarding_events")
      .insert({ household_id: input.householdId, event: input.event, step: input.step ?? null, detail: input.detail ?? {} });
    if (error) log.warn("locale event not recorded", { event: input.event, code: error.code ?? "unknown", allow: ["event", "code"] });
  } catch {
    // Measurement only.
  }
}
