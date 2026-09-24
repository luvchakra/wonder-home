import { atLocal, endOfQuiet, inQuietHours, localMoment, shiftDate, type QuietHours } from "./timing";

/**
 * Reminder policies (story 23-002): when each kind of reminder comes, as data.
 *
 * There is no universal "ten minutes before". A bill wants a few days' notice
 * and the due day; a school project wants the evening before and the morning
 * of; dinner wants the moment cooking has to start. Each category offers a
 * small closed set of presets a person picks from (rule 20), and the policy
 * owns what a preset means, so a screen never hard-codes a lead time and the
 * engine never guesses one.
 */

export const NOTIFICATION_CATEGORIES = [
  "meals",
  "school",
  "groceries",
  "bills",
  "home",
  "pets",
  "appointments",
  "family",
  "system",
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/** Categories a person can tune the timing of. Appointments keep their own per-appointment switches. */
export const TUNABLE_CATEGORIES = ["meals", "school", "groceries", "bills", "pets", "family"] as const;
export type TunableCategory = (typeof TUNABLE_CATEGORIES)[number];

export type ReminderPriority = "high" | "medium" | "low";

/** The stored priority. `critical` is kept for the engine's own urgent risks and never chosen by a policy. */
export function storedPriority(priority: ReminderPriority): "high" | "normal" | "low" {
  return priority === "medium" ? "normal" : priority;
}

export function priorityFromStored(value: string): ReminderPriority {
  return value === "high" || value === "critical" ? "high" : value === "low" ? "low" : "medium";
}

/**
 * When one reminder lands, relative to the thing it is about.
 * - `before`: a number of minutes before an exact moment (dinner, an outing).
 * - `daysBefore`: a local wall-clock time some days before the day it is due.
 * - `dayOf`: a local wall-clock time on the day itself, never after the moment.
 */
export type StageTime =
  | { kind: "before"; minutes: number }
  | { kind: "daysBefore"; days: number; atMinute: number }
  | { kind: "dayOf"; atMinute: number };

export type ReminderStage = {
  /** Stable name, used to word the reminder ("due_in_days", "due_today"…). */
  key: string;
  at: StageTime;
};

export type ReminderPreset = {
  key: string;
  /** How the preset reads in Settings: "3 days before + due day". */
  label: string;
  stages: readonly ReminderStage[];
};

export type ReminderPolicy = {
  category: TunableCategory;
  defaultPreset: string;
  presets: readonly ReminderPreset[];
  /** Whether reminders of this kind may be grouped into one (story 23-006). */
  batching: boolean;
  /** Whether a reminder may break quiet hours when it could not wait. */
  quietHours: "defer" | "break_when_urgent";
};

const hm = (hour: number, minute = 0) => hour * 60 + minute;

export const REMINDER_POLICIES: Record<TunableCategory, ReminderPolicy> = {
  bills: {
    category: "bills",
    defaultPreset: "three_days_and_due",
    batching: false,
    quietHours: "defer",
    presets: [
      {
        key: "three_days_and_due",
        label: "3 days before + due day",
        stages: [
          { key: "due_soon", at: { kind: "daysBefore", days: 3, atMinute: hm(10) } },
          { key: "due_today", at: { kind: "dayOf", atMinute: hm(9) } },
        ],
      },
      {
        key: "three_days_day_before_and_due",
        label: "3 days before, the day before + due day",
        stages: [
          { key: "due_soon", at: { kind: "daysBefore", days: 3, atMinute: hm(10) } },
          { key: "due_tomorrow", at: { kind: "daysBefore", days: 1, atMinute: hm(18) } },
          { key: "due_today", at: { kind: "dayOf", atMinute: hm(9) } },
        ],
      },
      {
        key: "week_and_due",
        label: "A week before + due day",
        stages: [
          { key: "due_soon", at: { kind: "daysBefore", days: 7, atMinute: hm(10) } },
          { key: "due_today", at: { kind: "dayOf", atMinute: hm(9) } },
        ],
      },
      { key: "due_day", label: "On the due day", stages: [{ key: "due_today", at: { kind: "dayOf", atMinute: hm(9) } }] },
    ],
  },
  school: {
    category: "school",
    defaultPreset: "evening_and_morning",
    batching: true,
    quietHours: "defer",
    presets: [
      {
        key: "evening_and_morning",
        label: "1 day before + morning of",
        stages: [
          { key: "tonight", at: { kind: "daysBefore", days: 1, atMinute: hm(18, 30) } },
          { key: "this_morning", at: { kind: "dayOf", atMinute: hm(7) } },
        ],
      },
      { key: "evening_before", label: "The evening before", stages: [{ key: "tonight", at: { kind: "daysBefore", days: 1, atMinute: hm(18, 30) } }] },
      { key: "morning_of", label: "The morning of", stages: [{ key: "this_morning", at: { kind: "dayOf", atMinute: hm(7) } }] },
    ],
  },
  meals: {
    category: "meals",
    defaultPreset: "prep_start",
    batching: false,
    quietHours: "defer",
    presets: [
      // `before` here counts back from when cooking has to start, not from the meal.
      { key: "prep_start", label: "When it's time to start cooking", stages: [{ key: "start_cooking", at: { kind: "before", minutes: 0 } }] },
      { key: "prep_start_15", label: "15 min before cooking starts", stages: [{ key: "start_cooking_soon", at: { kind: "before", minutes: 15 } }] },
      { key: "prep_start_30", label: "30 min before cooking starts", stages: [{ key: "start_cooking_soon", at: { kind: "before", minutes: 30 } }] },
    ],
  },
  groceries: {
    category: "groceries",
    defaultPreset: "late_afternoon",
    batching: true,
    quietHours: "defer",
    presets: [
      { key: "late_afternoon", label: "Late afternoon (5 PM)", stages: [{ key: "list_needs_attention", at: { kind: "dayOf", atMinute: hm(17) } }] },
      { key: "morning", label: "Morning (9 AM)", stages: [{ key: "list_needs_attention", at: { kind: "dayOf", atMinute: hm(9) } }] },
      { key: "evening", label: "Evening (7 PM)", stages: [{ key: "list_needs_attention", at: { kind: "dayOf", atMinute: hm(19) } }] },
    ],
  },
  pets: {
    category: "pets",
    defaultPreset: "on_time",
    batching: false,
    quietHours: "defer",
    presets: [
      { key: "on_time", label: "On the day (8 AM)", stages: [{ key: "due_today", at: { kind: "dayOf", atMinute: hm(8) } }] },
      {
        key: "day_before_and_on_time",
        label: "The day before + on the day",
        stages: [
          { key: "due_tomorrow", at: { kind: "daysBefore", days: 1, atMinute: hm(18) } },
          { key: "due_today", at: { kind: "dayOf", atMinute: hm(8) } },
        ],
      },
    ],
  },
  family: {
    category: "family",
    defaultPreset: "hour_before",
    batching: false,
    quietHours: "defer",
    presets: [
      { key: "hour_before", label: "An hour before", stages: [{ key: "starts_soon", at: { kind: "before", minutes: 60 } }] },
      {
        key: "evening_and_hour_before",
        label: "The evening before + an hour before",
        stages: [
          { key: "tomorrow", at: { kind: "daysBefore", days: 1, atMinute: hm(19) } },
          { key: "starts_soon", at: { kind: "before", minutes: 60 } },
        ],
      },
      { key: "day_of", label: "The morning of", stages: [{ key: "today", at: { kind: "dayOf", atMinute: hm(8) } }] },
    ],
  },
};

/** The preset a person chose, or the policy default when they chose nothing (or something no longer offered). */
export function presetFor(category: TunableCategory, chosen: string | null | undefined): ReminderPreset {
  const policy = REMINDER_POLICIES[category];
  return (
    policy.presets.find((preset) => preset.key === chosen) ??
    policy.presets.find((preset) => preset.key === policy.defaultPreset) ??
    policy.presets[0]!
  );
}

export function isPresetFor(category: TunableCategory, preset: string): boolean {
  return REMINDER_POLICIES[category].presets.some((entry) => entry.key === preset);
}

/**
 * What a reminder is anchored to: an exact moment (dinner at 19:00) or a
 * whole local day (a bill due on the 26th).
 */
export type ReminderAnchor = { kind: "moment"; at: Date } | { kind: "day"; date: string };

export type PlannedStage = {
  seq: number;
  key: string;
  /** The ideal moment, before quiet hours are considered. */
  idealAt: Date;
};

/** Each stage's ideal moment, in order, for one anchor — in the household's zone. */
export function planStages(preset: ReminderPreset, anchor: ReminderAnchor, timeZone: string): PlannedStage[] {
  const anchorDay = anchor.kind === "day" ? anchor.date : localMoment(anchor.at, timeZone).dateKey;
  const planned = preset.stages.map((stage, index) => {
    let idealAt: Date;
    switch (stage.at.kind) {
      case "before":
        idealAt =
          anchor.kind === "moment"
            ? new Date(anchor.at.getTime() - stage.at.minutes * 60_000)
            : atLocal(anchorDay, Math.max(0, hm(9) - stage.at.minutes), timeZone);
        break;
      case "daysBefore":
        idealAt = atLocal(shiftDate(anchorDay, -stage.at.days), stage.at.atMinute, timeZone);
        break;
      case "dayOf": {
        const at = atLocal(anchorDay, stage.at.atMinute, timeZone);
        // Never after the moment itself: a 6 AM start gets its reminder at 6.
        idealAt = anchor.kind === "moment" && at > anchor.at ? anchor.at : at;
        break;
      }
    }
    return { seq: index + 1, key: stage.key, idealAt };
  });
  return planned.sort((a, b) => a.idealAt.getTime() - b.idealAt.getTime()).map((stage, index) => ({ ...stage, seq: index + 1 }));
}

export type Placement = {
  at: Date;
  /** Why it moved, in closed words, when it did. */
  moved: "none" | "after_quiet_hours" | "before_quiet_hours" | "breaks_quiet_hours";
};

/**
 * Where a reminder actually lands once quiet hours are respected (story 23-004).
 *
 * Deferred to the end of the quiet when that is still in time; brought forward
 * to just before the quiet began when waiting would be too late, or would turn
 * an evening reminder into a next-morning one; and only an urgent reminder
 * that could do neither breaks the quiet. A reminder is never
 * silently dropped because of quiet hours.
 */
export function placeOutsideQuiet(
  idealAt: Date,
  window: { earliestAt: Date | null; latestAt: Date | null },
  quiet: QuietHours | null,
  timeZone: string,
  urgent: boolean,
): Placement {
  if (!quiet || !inQuietHours(idealAt, quiet, timeZone)) return { at: idealAt, moved: "none" };

  const after = endOfQuiet(idealAt, quiet, timeZone);
  // The quiet began at `fromMinute` on the local day it covers `idealAt` from.
  const local = localMoment(idealAt, timeZone);
  const startDay = local.minuteOfDay >= quiet.fromMinute ? local.dateKey : shiftDate(local.dateKey, -1);
  const before = new Date(atLocal(startDay, quiet.fromMinute, timeZone).getTime() - 60_000);
  const beforeAllowed = window.earliestAt !== null && before >= window.earliestAt;

  // An evening reminder stays an evening reminder: when waiting would push it
  // to another day and it can still come a little early, it comes early.
  const afterFits = !window.latestAt || after <= window.latestAt;
  if (afterFits && !(beforeAllowed && localMoment(after, timeZone).dateKey !== local.dateKey)) {
    return { at: after, moved: "after_quiet_hours" };
  }
  if (beforeAllowed) return { at: before, moved: "before_quiet_hours" };
  if (afterFits) return { at: after, moved: "after_quiet_hours" };

  return urgent ? { at: idealAt, moved: "breaks_quiet_hours" } : { at: after, moved: "after_quiet_hours" };
}
