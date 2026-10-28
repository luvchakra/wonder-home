"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { CALENDAR_VIEWS } from "@wonderhome/core/calendar/dates";
import { CALENDAR_CATEGORIES } from "@wonderhome/core/calendar/projection";
import { HOLIDAY_REGION } from "@wonderhome/core/calendar/preferences";
import { MODULE_SOURCES } from "@wonderhome/core/calendar/modules";
import { readCalendarPreferences, saveCalendarPreferences, setOccurrenceCancelled } from "@wonderhome/core/calendar/repository";
import { toErrorBody } from "@wonderhome/core/api/errors";
import { createClient } from "@wonderhome/core/db/server";
import { requireMembership } from "@wonderhome/core/identity/households";

import type { ActionState } from "./actions";

/**
 * The calendar's own writes (story 12-009): a person's filters and view, and
 * skipping one occurrence of a repeating event. Events themselves are
 * created and changed through the family event actions, the one write path.
 */

const preferencesSchema = z.object({
  householdId: z.uuid(),
  defaultView: z.enum(CALENDAR_VIEWS),
  // Checked boxes name the categories to show; the rest are hidden.
  shown: z.array(z.enum(CALENDAR_CATEGORIES)),
  // The modules the sheet offered, and which of them stay on.
  offeredSources: z.array(z.enum(MODULE_SOURCES)),
  shownSources: z.array(z.enum(MODULE_SOURCES)),
  memberIds: z.array(z.uuid()).max(30),
  onlyMine: z.boolean(),
  confirmedOnly: z.boolean(),
  holidayRegion: z.union([z.literal(""), z.literal("off"), z.string().regex(HOLIDAY_REGION)]),
});

/** Answers "saved" or "failed"; the sheet says it in the person's own words. */
export async function saveCalendarPreferencesAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = preferencesSchema.safeParse({
    householdId: formData.get("householdId"),
    defaultView: formData.get("defaultView"),
    shown: formData.getAll("shown"),
    offeredSources: formData.getAll("offeredSources"),
    shownSources: formData.getAll("shownSources"),
    memberIds: formData.getAll("memberIds"),
    onlyMine: formData.get("onlyMine") === "on",
    confirmedOnly: formData.get("confirmedOnly") === "on",
    holidayRegion: formData.get("holidayRegion") ?? "",
  });
  if (!parsed.success) return { error: "failed" };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);
    // A module the sheet did not offer keeps whatever it was; one it offered is hidden unless ticked.
    const current = await readCalendarPreferences(supabase, membership.memberId);
    const offered = new Set<string>(parsed.data.offeredSources);
    const hiddenSources = [
      ...current.filters.hiddenSources.filter((source) => !offered.has(source)),
      ...parsed.data.offeredSources.filter((source) => !parsed.data.shownSources.includes(source)),
    ];
    await saveCalendarPreferences(supabase, {
      householdId: parsed.data.householdId,
      memberId: membership.memberId,
      preferences: {
        defaultView: parsed.data.defaultView,
        holidayRegion: parsed.data.holidayRegion === "" ? null : parsed.data.holidayRegion,
        filters: {
          hiddenSources: [...new Set(hiddenSources)],
          hiddenCategories: CALENDAR_CATEGORIES.filter((category) => !parsed.data.shown.includes(category)),
          memberIds: parsed.data.memberIds,
          onlyMine: parsed.data.onlyMine,
          confirmedOnly: parsed.data.confirmedOnly,
        },
      },
    });
  } catch {
    return { error: "failed" };
  }
  revalidatePath("/calendar");
  return { notice: "saved" };
}

const occurrenceSchema = z.object({
  householdId: z.uuid(),
  eventId: z.uuid(),
  occurrenceDate: z.iso.date(),
  cancelled: z.enum(["true", "false"]),
});

export async function setOccurrenceCancelledAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = occurrenceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Please try again." };
  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);
    await setOccurrenceCancelled(supabase, {
      householdId: parsed.data.householdId,
      eventId: parsed.data.eventId,
      occurrenceDate: parsed.data.occurrenceDate,
      cancelled: parsed.data.cancelled === "true",
    });
  } catch (thrown) {
    return { error: toErrorBody(thrown, "family").body.error.message };
  }
  revalidatePath(`/calendar/events/${parsed.data.eventId}`);
  revalidatePath("/calendar");
  return {};
}
