"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ApiError } from "@wonderhome/core/api/errors";
import { createClient } from "@wonderhome/core/db/server";
import { isHouseholdAdmin, listMemberships } from "@wonderhome/core/identity/households";
import type { HouseholdMembership } from "@wonderhome/core/identity/schemas";
import {
  isRegion,
  regionInfo,
  type DateFormat,
  type LanguageCode,
  type MeasurementSystem,
  type TimeFormat,
} from "@wonderhome/core/i18n/locales";
import { LOCALE_SETUP_STEPS, nextLocaleStep, previousLocaleStep, type LocaleSetupStep } from "@wonderhome/core/i18n/preferences";
import {
  recordLocaleEvent,
  saveHouseholdLocale,
  saveMemberLocale,
  updateLocaleSetup,
  type HouseholdLocaleUpdate,
  type MemberLocaleUpdate,
} from "@wonderhome/core/i18n/repository";
import { translatorFor } from "@wonderhome/core/i18n/translate";
import { log } from "@wonderhome/core/observability/logger";

/**
 * Language, region, currency, time and units (stories 22-002 and 22-003).
 * Each action only ever writes through `i18n/repository.ts`, whose writes the
 * database authorizes: a person's own presentation, or — for an Admin — the
 * household's conventions. Nothing here can change what a record says.
 */

export type LocaleActionState = { error?: string; notice?: string };

async function context(): Promise<{ supabase: Awaited<ReturnType<typeof createClient>>; membership: HouseholdMembership }> {
  const supabase = await createClient();
  const membership = (await listMemberships(supabase))[0];
  if (!membership) redirect("/welcome");
  return { supabase, membership };
}

function field(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/** Only same-site paths, so a `returnTo` can never become an open redirect. */
function safeReturn(value: string | null): string | null {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : null;
}

function problem(error: unknown): LocaleActionState {
  if (error instanceof ApiError && (error.code === "bad_request" || error.code === "forbidden")) return { error: error.message };
  log.warn("locale save failed", { reason: error instanceof Error ? error.name : "unknown" });
  return { error: "We could not save that. Please try again." };
}

/** What a form says about a person's own presentation. Checked against the closed lists in the repository. */
function personalFrom(formData: FormData): Omit<MemberLocaleUpdate, "memberId"> {
  const update: Omit<MemberLocaleUpdate, "memberId"> = {};
  if (formData.has("language")) {
    const language = field(formData, "language");
    update.language = language === null || language === "default" ? null : (language as LanguageCode);
  }
  const dateFormat = field(formData, "dateFormat");
  if (dateFormat) update.dateFormat = dateFormat as DateFormat;
  const timeFormat = field(formData, "timeFormat");
  if (timeFormat) update.timeFormat = timeFormat as TimeFormat;
  const measurement = field(formData, "measurement");
  if (measurement) update.measurement = measurement as MeasurementSystem;
  return update;
}

function householdFrom(formData: FormData): HouseholdLocaleUpdate {
  const update: HouseholdLocaleUpdate = {};
  const region = field(formData, "region");
  if (region) update.region = region as HouseholdLocaleUpdate["region"];
  const currency = field(formData, "currency");
  if (currency) update.currency = currency.toUpperCase();
  const timezone = field(formData, "timezone");
  if (timezone) update.timezone = timezone;
  const measurement = field(formData, "householdMeasurement");
  if (measurement) update.measurement = measurement as MeasurementSystem;
  if (formData.has("defaultLanguage")) {
    const language = field(formData, "defaultLanguage");
    update.language = language === null || language === "default" ? null : (language as LanguageCode);
  }
  return update;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/** A person's own language, formats and units — or, for an Admin, another member's language. */
export async function savePersonalLocaleAction(_previous: LocaleActionState, formData: FormData): Promise<LocaleActionState> {
  const { supabase, membership } = await context();
  const memberId = field(formData, "memberId") ?? membership.memberId;
  const update = personalFrom(formData);
  try {
    await saveMemberLocale(supabase, membership, { memberId, ...update });
  } catch (error) {
    return problem(error);
  }
  const householdId = membership.household.id;
  if (update.language !== undefined) {
    if (memberId === membership.memberId) {
      await recordLocaleEvent(supabase, { householdId, event: "language_changed", detail: { language: update.language ?? "default" } });
    } else {
      await recordLocaleEvent(supabase, { householdId, event: "member_language_changed", detail: { language: update.language ?? "default" } });
    }
  }
  revalidatePath("/", "layout");
  const back = safeReturn(field(formData, "returnTo"));
  if (back) redirect(back);
  const t = await translatorFor(memberId === membership.memberId && update.language ? update.language : "en");
  return { notice: t("common.saved") };
}

/** The household's region, currency, time zone, default units or default language — an Admin's. */
export async function saveHouseholdLocaleAction(_previous: LocaleActionState, formData: FormData): Promise<LocaleActionState> {
  const { supabase, membership } = await context();
  const update = householdFrom(formData);
  // Choosing a region may also take its suggestions, when the person asked for them.
  if (update.region && formData.get("applySuggestions") === "on" && isRegion(update.region)) {
    const region = regionInfo(update.region);
    update.currency ??= region.currency;
    update.timezone ??= region.timezone;
    update.measurement ??= region.measurement;
  }
  try {
    await saveHouseholdLocale(supabase, membership, update);
  } catch (error) {
    return problem(error);
  }
  const householdId = membership.household.id;
  if (update.region) await recordLocaleEvent(supabase, { householdId, event: "region_selected", detail: { region: update.region } });
  if (update.currency) await recordLocaleEvent(supabase, { householdId, event: "currency_changed", detail: { currency: update.currency } });
  if (update.timezone) await recordLocaleEvent(supabase, { householdId, event: "timezone_changed" });
  revalidatePath("/", "layout");
  const back = safeReturn(field(formData, "returnTo"));
  if (back) redirect(back);
  return { notice: "Saved." };
}

/** Date, time and units: the person's formats, and — for an Admin — the household's time zone. */
export async function saveDateTimeAction(_previous: LocaleActionState, formData: FormData): Promise<LocaleActionState> {
  const { supabase, membership } = await context();
  const personal = personalFrom(formData);
  const timezone = field(formData, "timezone");
  try {
    await saveMemberLocale(supabase, membership, { memberId: membership.memberId, dateFormat: personal.dateFormat, timeFormat: personal.timeFormat, measurement: personal.measurement });
    if (timezone && timezone !== membership.household.timezone) {
      await saveHouseholdLocale(supabase, membership, { timezone });
      await recordLocaleEvent(supabase, { householdId: membership.household.id, event: "timezone_changed" });
    }
  } catch (error) {
    return problem(error);
  }
  revalidatePath("/", "layout");
  redirect(safeReturn(field(formData, "returnTo")) ?? "/settings/language-region");
}

/**
 * Every member's language at once (spec §19). An Admin may set anyone's; a
 * member only their own — each save is authorized on its own, so a form
 * that names someone else's field is refused for that field.
 */
export async function saveMemberLanguagesAction(_previous: LocaleActionState, formData: FormData): Promise<LocaleActionState> {
  const { supabase, membership } = await context();
  const householdId = membership.household.id;
  try {
    if (formData.has("defaultLanguage")) {
      const update = householdFrom(formData);
      await saveHouseholdLocale(supabase, membership, { language: update.language ?? null });
    }
    for (const [key, raw] of formData.entries()) {
      if (!key.startsWith("language_") || typeof raw !== "string") continue;
      const memberId = key.slice("language_".length);
      if (formData.get(`was_${memberId}`) === raw) continue;
      const language = raw === "default" || raw === "" ? null : (raw as LanguageCode);
      await saveMemberLocale(supabase, membership, { memberId, language });
      await recordLocaleEvent(supabase, { householdId, event: memberId === membership.memberId ? "language_changed" : "member_language_changed", detail: { language: language ?? "default" } });
    }
  } catch (error) {
    return problem(error);
  }
  revalidatePath("/", "layout");
  redirect("/settings/language-region/members?saved=1");
}

// ---------------------------------------------------------------------------
// The optional setup: "How would you like WonderHome to speak to you?"
// ---------------------------------------------------------------------------

function setupStep(value: FormDataEntryValue | null): LocaleSetupStep {
  return typeof value === "string" && (LOCALE_SETUP_STEPS as readonly string[]).includes(value) ? (value as LocaleSetupStep) : "intro";
}

/**
 * One step of the setup: save what this step asks, then move. "Later" is a
 * decision that is kept (status `skipped`) — the setup is never forced, and
 * Home offers it once, quietly, until it is finished or put away.
 */
export async function localeSetupAction(_previous: LocaleActionState, formData: FormData): Promise<LocaleActionState> {
  const { supabase, membership } = await context();
  const householdId = membership.household.id;
  const admin = isHouseholdAdmin(membership);
  const step = setupStep(formData.get("step"));
  const intent = field(formData, "intent") ?? "next";

  if (intent === "later") {
    await updateLocaleSetup(supabase, membership, { status: "skipped", step });
    await recordLocaleEvent(supabase, { householdId, event: "localization_setup_skipped", step });
    revalidatePath("/", "layout");
    redirect("/");
  }
  if (intent === "back") {
    const previous = previousLocaleStep(step, admin);
    redirect(`/onboarding/personalize?step=${previous ?? "intro"}`);
  }

  try {
    if (step === "intro") {
      const resuming = membership.locale?.setup.status === "skipped";
      await updateLocaleSetup(supabase, membership, { status: "in_progress", step: "language" });
      await recordLocaleEvent(supabase, { householdId, event: resuming ? "localization_setup_resumed" : "localization_setup_started", step });
    } else if (step === "language") {
      const update = personalFrom(formData);
      if (update.language !== undefined) {
        await saveMemberLocale(supabase, membership, { memberId: membership.memberId, language: update.language });
        await recordLocaleEvent(supabase, { householdId, event: "language_selected", step, detail: { language: update.language ?? "default" } });
      }
    } else if (step === "region" && admin) {
      const update = householdFrom(formData);
      if (update.region) {
        await saveHouseholdLocale(supabase, membership, { region: update.region });
        await recordLocaleEvent(supabase, { householdId, event: "region_selected", step, detail: { region: update.region } });
      }
    } else if (step === "currency" && admin) {
      const update = householdFrom(formData);
      if (update.currency) {
        await saveHouseholdLocale(supabase, membership, { currency: update.currency });
        await recordLocaleEvent(supabase, { householdId, event: "currency_selected", step, detail: { currency: update.currency } });
      }
    } else if (step === "datetime") {
      const personal = personalFrom(formData);
      await saveMemberLocale(supabase, membership, { memberId: membership.memberId, dateFormat: personal.dateFormat, timeFormat: personal.timeFormat, measurement: personal.measurement });
      if (personal.measurement) await recordLocaleEvent(supabase, { householdId, event: "measurement_system_selected", step, detail: { units: personal.measurement } });
      const timezone = field(formData, "timezone");
      if (admin && timezone && timezone !== membership.household.timezone) {
        await saveHouseholdLocale(supabase, membership, { timezone });
        await recordLocaleEvent(supabase, { householdId, event: "timezone_selected", step });
      }
    }
  } catch (error) {
    return problem(error);
  }

  const next = step === "review" ? "done" : nextLocaleStep(step, admin);
  if (next === "done") {
    await updateLocaleSetup(supabase, membership, { status: "completed", step: "review" });
    await recordLocaleEvent(supabase, { householdId, event: "localization_setup_completed", step });
    revalidatePath("/", "layout");
    redirect("/");
  }
  await updateLocaleSetup(supabase, membership, { status: "in_progress", step: next });
  revalidatePath("/", "layout");
  redirect(`/onboarding/personalize?step=${next}`);
}

/** "Not now" on Home's card: put away for good. Settings still has everything. */
export async function dismissLocalePromptAction(): Promise<void> {
  const { supabase, membership } = await context();
  await updateLocaleSetup(supabase, membership, { dismissPrompt: true });
  revalidatePath("/");
}
