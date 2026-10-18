import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { atLocal, localMoment, shiftDate } from "@wonderhome/core/calendar/dates";
import { clashesWith } from "@wonderhome/core/calendar/projection";
import { calendarRange } from "@wonderhome/core/calendar/repository";
import { isHouseholdAdmin, listMembers } from "@wonderhome/core/identity/households";
import type { HouseholdMembership } from "@wonderhome/core/identity/schemas";
import { formatterFor } from "@wonderhome/core/i18n/format";
import { preferencesOf } from "@wonderhome/core/i18n/preferences";
import { translatorFor } from "@wonderhome/core/i18n/translate";
import { householdInstant } from "@wonderhome/core/school/times";

/**
 * When an event is, and what it would clash with (story 12-009). Shared by
 * adding an event and changing one; server only, because the clash check
 * reads the calendar through the member's own session.
 */

/** Start and end as instants: local midnights for an all-day event, the wall clock otherwise. */
export function eventWindow(
  input: { allDay?: "on"; startsAt?: string; endsAt?: string; startDate?: string; endDate?: string },
  timezone: string,
): { startsAt: string; endsAt: string } | { error: string } {
  if (input.allDay === "on") {
    if (!input.startDate) return { error: "Pick a date." };
    const last = input.endDate && input.endDate >= input.startDate ? input.endDate : input.startDate;
    return { startsAt: atLocal(input.startDate, 0, timezone).toISOString(), endsAt: atLocal(shiftDate(last, 1), 0, timezone).toISOString() };
  }
  if (!input.startsAt) return { error: "Pick a start." };
  if (!input.endsAt) return { error: "Pick an end." };
  const startsAt = householdInstant(input.startsAt, timezone);
  const endsAt = householdInstant(input.endsAt, timezone);
  if (!startsAt || !endsAt) return { error: "Those times did not make sense." };
  if (endsAt <= startsAt) return { error: "An event has to end after it starts." };
  return { startsAt, endsAt };
}

/**
 * What a timed plan would clash with, in the person's words: entries they can
 * see by title, and anyone going who is busy in something they cannot see,
 * as "busy" only.
 */
export async function clashesFor(
  supabase: SupabaseClient,
  membership: HouseholdMembership,
  candidate: { start: Date; end: Date; memberIds: readonly string[]; ignoreEventId?: string },
): Promise<string[]> {
  const timezone = membership.household.timezone;
  const preferences = preferencesOf(membership.locale, timezone);
  const t = await translatorFor(preferences.language);
  const format = formatterFor(preferences);
  const from = localMoment(candidate.start, timezone).dateKey;
  const to = localMoment(new Date(candidate.end.getTime() - 1), timezone).dateKey;
  const viewer = { memberId: membership.memberId, isAdmin: isHouseholdAdmin(membership), timeZone: timezone };

  const [{ entries }, members, busy] = await Promise.all([
    calendarRange(supabase, {
      householdId: membership.household.id,
      householdRegion: null,
      viewer,
      from,
      to,
      holidayRegion: "off",
      words: { birthday: (name) => name, occasion: (name) => name },
    }),
    listMembers(supabase, membership.household.id, membership.household.ownerMemberId).catch(() => []),
    candidate.memberIds.length > 0
      ? supabase.rpc("busy_windows", { p_household_id: membership.household.id, p_from: candidate.start.toISOString(), p_to: candidate.end.toISOString() })
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  const seen = clashesWith(entries, { ...candidate, allDay: false, ignoreSourceId: candidate.ignoreEventId });
  const lines = seen.map((entry) => t("calendar.form.clashEntry", { title: entry.title, time: `${format.time(entry.start)} – ${format.time(entry.end ?? entry.start)}` }));

  // Someone already named in a visible clash is not repeated; anyone else
  // busy then is said to be busy, and free/busy never says with what.
  const covered = new Set(seen.flatMap((entry) => entry.memberIds));
  const busyIds = new Set(
    ((busy.data as Record<string, unknown>[] | null) ?? [])
      .map((row) => row.member_id as string)
      .filter((id) => candidate.memberIds.includes(id) && !covered.has(id)),
  );
  for (const id of busyIds) {
    const name = members.find((member) => member.id === id)?.displayName;
    if (name) lines.push(t("calendar.form.clashBusy", { name }));
  }
  return lines;
}
