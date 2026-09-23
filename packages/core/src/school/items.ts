import type { HomeAssessment } from "../home/assessment";
import { isoDate } from "../home/assessment";
import type { AgeBand } from "../identity/age";

/**
 * School work as WonderHome models it (stories 08-001, 08-003, 08-004, 08-005).
 *
 * The canonical shape is deliberately not any portal's. What is kept from a
 * provider is identity — enough to reconcile a re-import — and nothing else,
 * so replacing a school system changes an adapter and no domain logic.
 *
 * Two rules run through everything here. A connector never marks work complete:
 * a portal going quiet is not a child saying they finished. And a child's own
 * view is built from their age rather than filtered in the browser, because
 * age-appropriate has to mean the data was never sent.
 */

export const SCHOOL_ITEM_KINDS = [
  "homework",
  "worksheet",
  "exam",
  "project",
  "event",
  "notice",
] as const;
export type SchoolItemKind = (typeof SCHOOL_ITEM_KINDS)[number];

export const SCHOOL_ITEM_STATUSES = [
  "pending",
  "in_progress",
  "submitted",
  "done",
  "missed",
  "cancelled",
] as const;
export type SchoolItemStatus = (typeof SCHOOL_ITEM_STATUSES)[number];

export type SchoolItem = {
  id: string;
  childMemberId: string;
  kind: SchoolItemKind;
  title: string;
  subject: string | null;
  detail: string | null;
  dueAt: Date | null;
  /** Whether anybody gave a time of day. When false, `dueAt` only names a day and no time is shown (14-014). */
  dueTimeKnown: boolean;
  /** When a timed event or exam ends, where that was given. */
  endsAt: Date | null;
  estimatedMinutes: number | null;
  estimateSource: "provider" | "inferred" | "member_confirmed" | null;
  status: SchoolItemStatus;
  completedAt: Date | null;
  /** Which provider it came from, or null when the household entered it. */
  provider: string | null;
  externalId: string | null;
};

/**
 * How long a piece of work is likely to take when nobody has said (08-004).
 *
 * These are starting points a family corrects, not measurements. The estimate
 * carries its source precisely so that "WonderHome guessed" and "a parent told
 * us" never look the same in a plan.
 */
export const DEFAULT_MINUTES: Record<SchoolItemKind, number> = {
  homework: 30,
  worksheet: 25,
  exam: 90,
  project: 120,
  event: 0,
  notice: 0,
};

/** Younger children work in shorter stretches; the same task takes longer. */
const AGE_EFFORT_MULTIPLIER: Record<AgeBand, number> = {
  young_child: 1.5,
  older_child: 1.2,
  teen: 1,
  adult: 1,
};

export function estimateMinutes(
  item: Pick<SchoolItem, "kind" | "estimatedMinutes" | "estimateSource">,
  ageBand: AgeBand | null,
): { minutes: number; source: "provider" | "inferred" | "member_confirmed" } {
  if (item.estimatedMinutes !== null && item.estimateSource !== null) {
    return { minutes: item.estimatedMinutes, source: item.estimateSource };
  }

  const base = DEFAULT_MINUTES[item.kind];
  const multiplier = ageBand ? AGE_EFFORT_MULTIPLIER[ageBand] : 1;

  return { minutes: Math.round(base * multiplier), source: "inferred" };
}

/**
 * The longest a child of this age should be asked to work in one sitting.
 *
 * A two-hour project is not a two-hour block for a nine-year-old; it is four
 * sittings, and a planner that does not know that produces plans nobody follows.
 */
export const MAX_SESSION_MINUTES: Record<AgeBand, number> = {
  young_child: 20,
  older_child: 30,
  teen: 50,
  adult: 90,
};

export type StudySession = {
  startsAt: Date;
  endsAt: Date;
  schoolItemId: string;
  /** Always a proposal until somebody agrees to it. */
  source: "proposed";
};

export type FreeWindow = { start: Date; end: Date };

/**
 * Turns work into sittings that fit the time the child actually has (08-004).
 *
 * Nothing is scheduled outside the windows given, and nothing runs longer than
 * the age allows. What cannot be placed is returned rather than silently
 * dropped — a plan that quietly omits half the homework is worse than no plan.
 */
export function planStudy(
  items: readonly SchoolItem[],
  windows: readonly FreeWindow[],
  ageBand: AgeBand | null,
): { sessions: StudySession[]; unplaced: SchoolItem[] } {
  const maxSitting = MAX_SESSION_MINUTES[ageBand ?? "teen"];
  const sessions: StudySession[] = [];
  const unplaced: SchoolItem[] = [];

  // Remaining free time per window, consumed as sessions are placed.
  const remaining = windows
    .map((window) => ({ cursor: new Date(window.start), end: new Date(window.end) }))
    .sort((a, b) => a.cursor.getTime() - b.cursor.getTime());

  const due = [...items]
    .filter((item) => item.status === "pending" || item.status === "in_progress")
    .filter((item) => item.kind !== "event" && item.kind !== "notice")
    .sort((a, b) => (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity));

  for (const item of due) {
    let left = estimateMinutes(item, ageBand).minutes;
    let placedAny = false;

    for (const window of remaining) {
      while (left > 0) {
        const availableMinutes = (window.end.getTime() - window.cursor.getTime()) / 60_000;
        if (availableMinutes < 10) break; // Too short to be worth starting.

        const minutes = Math.min(left, maxSitting, availableMinutes);
        const startsAt = new Date(window.cursor);
        const endsAt = new Date(startsAt.getTime() + minutes * 60_000);

        sessions.push({ startsAt, endsAt, schoolItemId: item.id, source: "proposed" });
        window.cursor = endsAt;
        left -= minutes;
        placedAny = true;
      }
      if (left <= 0) break;
    }

    // Partly placed still counts as unplaced: the family needs to know the work
    // does not fit, not to discover it on the night before.
    if (!placedAny || left > 0) unplaced.push(item);
  }

  return { sessions, unplaced };
}

/**
 * Whether a deadline is in trouble (story 08-005).
 *
 * The test is time against remaining effort, not the calendar. Something due
 * tomorrow with twenty minutes of work left is fine; the same deadline with a
 * two-hour project and one free evening is not.
 */
export function assessDeadline(
  item: SchoolItem,
  context: { now: Date; availableMinutesBeforeDue: number; ageBand: AgeBand | null },
): HomeAssessment {
  const subjectKey = `school.${item.id}`;
  const title = item.title;

  if (item.status === "done" || item.status === "submitted" || item.status === "cancelled") {
    return {
      subjectKey,
      title,
      status: "met",
      riskLevel: "none",
      notable: false,
      reason: `${item.title} is finished.`,
      action: null,
      dueOn: item.dueAt ? isoDate(item.dueAt) : null,
    };
  }

  if (!item.dueAt) {
    return {
      subjectKey,
      title,
      status: "pending",
      riskLevel: "none",
      notable: false,
      reason: `${item.title} has no deadline.`,
      action: null,
      dueOn: null,
    };
  }

  const hoursLeft = (item.dueAt.getTime() - context.now.getTime()) / 3_600_000;
  const needed = estimateMinutes(item, context.ageBand).minutes;

  if (hoursLeft < 0) {
    return {
      subjectKey,
      title,
      status: "missed",
      riskLevel: "high",
      notable: true,
      reason: `${item.title} was due ${Math.abs(Math.round(hoursLeft))} hours ago and is not marked done.`,
      action: { action: "check_with_child", target: item.id },
      dueOn: isoDate(item.dueAt),
    };
  }

  if (context.availableMinutesBeforeDue < needed) {
    return {
      subjectKey,
      title,
      status: "at_risk",
      riskLevel: item.kind === "exam" || item.kind === "project" ? "high" : "medium",
      notable: true,
      reason: `${item.title} needs about ${needed} minutes and there are ${Math.max(0, Math.round(context.availableMinutesBeforeDue))} free before it is due.`,
      action: { action: "make_time", target: item.id },
      dueOn: isoDate(item.dueAt),
    };
  }

  return {
    subjectKey,
    title,
    status: "on_track",
    riskLevel: "none",
    notable: false,
    reason: `${item.title} fits in the time before it is due.`,
    action: null,
    dueOn: isoDate(item.dueAt),
  };
}

/**
 * What a connector may and may not change on an existing item (08-002, 08-003).
 *
 * A provider owns the facts about the work: its title, its deadline, whether it
 * was withdrawn. It does not own whether a child did it. The acceptance
 * criterion says connector failures must never "silently mark work complete",
 * and the way to guarantee that is to make completion unreachable from this
 * path at all.
 */
export function mergeFromProvider(
  existing: SchoolItem,
  incoming: Partial<Pick<SchoolItem, "title" | "subject" | "dueAt" | "estimatedMinutes" | "status">>,
): SchoolItem {
  const providerStatus =
    incoming.status === "cancelled" || incoming.status === "missed" ? incoming.status : existing.status;

  return {
    ...existing,
    title: incoming.title ?? existing.title,
    subject: incoming.subject ?? existing.subject,
    dueAt: incoming.dueAt ?? existing.dueAt,
    estimatedMinutes: incoming.estimatedMinutes ?? existing.estimatedMinutes,
    estimateSource:
      incoming.estimatedMinutes !== undefined && incoming.estimatedMinutes !== null
        ? "provider"
        : existing.estimateSource,
    // A child's own word survives every re-import.
    status: existing.completedAt ? existing.status : providerStatus,
    completedAt: existing.completedAt,
  };
}

/**
 * The window a kind of school item is worth previewing ahead of its due
 * date, in days — separate from `assessDeadline`'s "will this fit" risk
 * check. An exam or project is worth a family's advance notice for a month;
 * homework and worksheets are usually assigned and done within days, so
 * showing them a month out would just be noise. `notice` has no due date of
 * its own — it belongs to the school-messages list instead.
 */
const UPCOMING_WINDOW_DAYS: Record<SchoolItemKind, number> = {
  homework: 3,
  worksheet: 3,
  exam: 30,
  project: 30,
  event: 30,
  notice: 0,
};

/**
 * Everything with a real due date, in that kind's own preview window, that
 * isn't finished or withdrawn yet — sorted soonest first (08-005 follow-up:
 * "what's coming", not just "what's at risk").
 */
export function upcomingSchoolItems(items: readonly SchoolItem[], now: Date = new Date()): SchoolItem[] {
  return items
    .filter((item) => item.dueAt !== null)
    .filter((item) => item.status !== "done" && item.status !== "submitted" && item.status !== "cancelled")
    .filter((item) => {
      const windowDays = UPCOMING_WINDOW_DAYS[item.kind];
      if (windowDays <= 0) return false;
      const msAway = item.dueAt!.getTime() - now.getTime();
      return msAway >= 0 && msAway <= windowDays * 86_400_000;
    })
    .sort((a, b) => a.dueAt!.getTime() - b.dueAt!.getTime());
}

/** The child's own view: their work, in their words, with nothing else attached. */
export function childView(
  items: readonly SchoolItem[],
  now: Date = new Date(),
): { today: SchoolItem[]; soon: SchoolItem[]; encouragement: string } {
  const live = items.filter((item) => item.status === "pending" || item.status === "in_progress");
  const endOfDay = new Date(now);
  endOfDay.setUTCHours(23, 59, 59, 999);

  const today = live.filter((item) => item.dueAt && item.dueAt <= endOfDay);
  const soon = live.filter((item) => !item.dueAt || item.dueAt > endOfDay);

  return {
    today,
    soon,
    encouragement:
      today.length === 0
        ? "Nothing due today. Nice."
        : today.length === 1
          ? "One thing to finish today. You can do it."
          : `${today.length} things due today — one at a time.`,
  };
}
