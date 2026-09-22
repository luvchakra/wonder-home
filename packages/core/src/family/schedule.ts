import { isoDate, silent, type HomeAssessment } from "../home/assessment";

/**
 * Family time, availability and conflicts (stories 12-001 through 12-008).
 *
 * This is the module every other one has been waiting for. School estimates a
 * child's free time, meals ask whether a cook is around, maintenance asks
 * whether anyone is home — all of them written to overstate availability rather
 * than invent it. The real answer comes from here.
 *
 * The rule that shapes everything: protected family time is a constraint, not a
 * preference. An optimiser that may spend Sunday afternoon to make a routine
 * fit will, and the family will stop trusting the calendar. So nothing in this
 * module can move or consume protected time; it can only propose, and a person
 * decides.
 */

export type Window = { start: Date; end: Date };

export type BusyWindow = Window & {
  memberId: string;
  /** Whether this is family time nothing may schedule over. */
  protected: boolean;
};

export const EVENT_KINDS = [
  "family_time",
  "outing",
  "birthday",
  "gathering",
  "appointment",
  "school_event",
  "travel",
  "special_occasion",
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export type FamilyEvent = {
  id: string;
  title: string;
  kind: EventKind;
  startsAt: Date;
  endsAt: Date;
  protected: boolean;
  ownerMemberId: string | null;
  status: "proposed" | "planned" | "confirmed" | "happened" | "cancelled";
  actionState: "needs_rsvp" | "needs_gift" | "needs_preparation" | "needs_travel" | "ready" | null;
  actionDueAt: Date | null;
  participants: { memberId: string; response: "unknown" | "yes" | "no" | "maybe"; required: boolean }[];
};

/**
 * Windows in which everybody named is free (story 12-003).
 *
 * Takes free/busy and nothing else — no titles, no locations. A planner that
 * can see why somebody is busy is a planner that has read a private
 * appointment, and the acceptance criterion rules that out explicitly.
 */
export function commonAvailability(
  members: readonly string[],
  busy: readonly BusyWindow[],
  search: Window,
  options: { minimumMinutes?: number } = {},
): Window[] {
  const minimum = (options.minimumMinutes ?? 30) * 60_000;
  if (members.length === 0) return [];

  const relevant = busy
    .filter((window) => members.includes(window.memberId))
    .filter((window) => window.end > search.start && window.start < search.end)
    .map((window) => ({
      start: new Date(Math.max(window.start.getTime(), search.start.getTime())),
      end: new Date(Math.min(window.end.getTime(), search.end.getTime())),
    }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  // Merge overlaps so one person's two meetings do not produce a phantom gap.
  const merged: Window[] = [];
  for (const window of relevant) {
    const last = merged[merged.length - 1];
    if (last && window.start <= last.end) {
      if (window.end > last.end) last.end = window.end;
    } else {
      merged.push({ start: new Date(window.start), end: new Date(window.end) });
    }
  }

  const free: Window[] = [];
  let cursor = new Date(search.start);

  for (const window of merged) {
    if (window.start.getTime() - cursor.getTime() >= minimum) {
      free.push({ start: new Date(cursor), end: new Date(window.start) });
    }
    if (window.end > cursor) cursor = new Date(window.end);
  }

  if (search.end.getTime() - cursor.getTime() >= minimum) {
    free.push({ start: new Date(cursor), end: new Date(search.end) });
  }

  return free;
}

/**
 * Whether something may be scheduled here (story 12-002).
 *
 * The only question automation is allowed to ask about protected time. There is
 * deliberately no counterpart that moves it: the answer to a clash with a
 * confirmed family commitment is a proposal to a person, never a rearrangement.
 */
export function mayScheduleOver(
  candidate: Window,
  busy: readonly BusyWindow[],
): { allowed: boolean; because: string } {
  const clash = busy.find((window) => window.end > candidate.start && window.start < candidate.end);

  if (!clash) return { allowed: true, because: "Nothing else is happening then." };

  if (clash.protected) {
    return {
      allowed: false,
      because: "That is protected family time, and WonderHome does not schedule over it.",
    };
  }

  return { allowed: false, because: "Somebody is already busy then." };
}

export type ConflictSubject = {
  kind: "event" | "meal" | "school_item" | "routine" | "service_request";
  id: string;
  label: string;
  window: Window;
  /** Confirmed family time, or anything else a person has committed to. */
  protected: boolean;
  /** Whether dropping it is an option at all. */
  optional: boolean;
};

export type Conflict = {
  left: ConflictSubject;
  right: ConflictSubject;
  overlap: Window;
  proposedAction: "move_left" | "move_right" | "shorten_left" | "shorten_right" | "drop_optional" | "ask_household";
  proposedDetail: string;
};

/**
 * Finds clashes and proposes a way out (story 12-007).
 *
 * Both sides are named. A conflict that says only "something clashes" cannot be
 * resolved by anybody, and the criterion asks for the records in conflict plus
 * "a direct resolution action".
 *
 * What it will never propose is moving protected time. When both sides are
 * protected the proposal is to ask the household, because that is genuinely a
 * decision only they can make.
 */
export function detectConflicts(subjects: readonly ConflictSubject[]): Conflict[] {
  const conflicts: Conflict[] = [];

  for (let i = 0; i < subjects.length; i += 1) {
    for (let j = i + 1; j < subjects.length; j += 1) {
      const left = subjects[i]!;
      const right = subjects[j]!;

      const start = Math.max(left.window.start.getTime(), right.window.start.getTime());
      const end = Math.min(left.window.end.getTime(), right.window.end.getTime());
      if (start >= end) continue;

      conflicts.push({
        left,
        right,
        overlap: { start: new Date(start), end: new Date(end) },
        ...propose(left, right),
      });
    }
  }

  return conflicts;
}

function propose(
  left: ConflictSubject,
  right: ConflictSubject,
): { proposedAction: Conflict["proposedAction"]; proposedDetail: string } {
  if (left.protected && right.protected) {
    return {
      proposedAction: "ask_household",
      proposedDetail: `${left.label} and ${right.label} are both protected. Only the family can decide which gives way.`,
    };
  }

  if (left.protected) {
    return { proposedAction: "move_right", proposedDetail: `Move ${right.label}; ${left.label} is protected.` };
  }
  if (right.protected) {
    return { proposedAction: "move_left", proposedDetail: `Move ${left.label}; ${right.label} is protected.` };
  }

  if (left.optional !== right.optional) {
    const optional = left.optional ? left : right;
    return { proposedAction: "drop_optional", proposedDetail: `${optional.label} could be skipped.` };
  }

  // Neither is protected and both matter: move the shorter one, which is the
  // cheaper thing to reschedule.
  const leftMinutes = left.window.end.getTime() - left.window.start.getTime();
  const rightMinutes = right.window.end.getTime() - right.window.start.getTime();

  return leftMinutes <= rightMinutes
    ? { proposedAction: "move_left", proposedDetail: `${left.label} is shorter, so it is the easier one to move.` }
    : { proposedAction: "move_right", proposedDetail: `${right.label} is shorter, so it is the easier one to move.` };
}

/**
 * Whether an event needs somebody (story 12-005).
 *
 * The rule the criterion states: a social event has "an owner and explicit
 * action state for RSVP, preparation or gifting so they do not become passive
 * calendar data". An event with nothing outstanding produces silence; one
 * waiting on a reply produces an action addressed to its owner.
 */
export function assessEvent(event: FamilyEvent, now: Date = new Date()): HomeAssessment {
  const subjectKey = `event.${event.id}`;

  if (event.status === "cancelled" || event.status === "happened") {
    return silent(subjectKey, event.title, "This is behind us.");
  }

  if (!event.actionState || event.actionState === "ready") {
    return silent(subjectKey, event.title, "Nothing outstanding.");
  }

  const daysUntil = event.actionDueAt
    ? Math.floor((event.actionDueAt.getTime() - now.getTime()) / 86_400_000)
    : Math.floor((event.startsAt.getTime() - now.getTime()) / 86_400_000);

  const label = describeAction(event.actionState);

  if (daysUntil < 0) {
    return {
      subjectKey,
      title: event.title,
      status: "missed",
      riskLevel: "medium",
      notable: true,
      reason: `${label} — the date has passed.`,
      action: { action: event.actionState, target: event.id },
      dueOn: isoDate(event.actionDueAt ?? event.startsAt),
    };
  }

  if (daysUntil <= 3) {
    return {
      subjectKey,
      title: event.title,
      status: "at_risk",
      riskLevel: daysUntil === 0 ? "high" : "medium",
      notable: true,
      reason: `${label} — ${daysUntil === 0 ? "today" : `in ${daysUntil} days`}.`,
      action: { action: event.actionState, target: event.id },
      dueOn: isoDate(event.actionDueAt ?? event.startsAt),
    };
  }

  return silent(subjectKey, event.title, `${label}, but not yet.`);
}

function describeAction(state: NonNullable<FamilyEvent["actionState"]>): string {
  switch (state) {
    case "needs_rsvp":
      return "Somebody needs to reply";
    case "needs_gift":
      return "A gift is needed";
    case "needs_preparation":
      return "This needs preparing";
    case "needs_travel":
      return "Getting there needs arranging";
    case "ready":
      return "Ready";
  }
}

export type ActivitySuggestion = {
  title: string;
  window: Window;
  travelMinutes: number;
  costMinor: number;
  suitsAges: boolean;
  because: string;
};

export type ActivityConstraints = {
  free: readonly Window[];
  budgetMinor: number | null;
  maxTravelMinutes: number;
  /** Age bands of everybody coming, so nothing unsuitable is proposed. */
  ageBands: readonly string[];
};

/**
 * Narrows activity ideas to a short, honest list (story 12-004).
 *
 * "A small actionable set" is the criterion, and small is the hard part: three
 * good options are useful, twenty are a second chore. Anything that does not
 * fit the free time, the budget, the travel limit or the ages is removed rather
 * than shown with a caveat.
 */
export const MAX_SUGGESTIONS = 3;

export function suggestActivities(
  candidates: readonly ActivitySuggestion[],
  constraints: ActivityConstraints,
): ActivitySuggestion[] {
  return candidates
    .filter((candidate) => candidate.suitsAges)
    .filter((candidate) => candidate.travelMinutes <= constraints.maxTravelMinutes)
    .filter(
      (candidate) => constraints.budgetMinor === null || candidate.costMinor <= constraints.budgetMinor,
    )
    .filter((candidate) =>
      constraints.free.some(
        (window) => candidate.window.start >= window.start && candidate.window.end <= window.end,
      ),
    )
    .slice(0, MAX_SUGGESTIONS);
}

export type GiftPlan = {
  id: string;
  recipient: string;
  neededBy: string;
  status: "needed" | "chosen" | "ordered" | "wrapped" | "given" | "cancelled";
  responsibleMemberId: string | null;
};

/** How long before a gift is needed the household should be thinking about it. */
export const GIFT_LEAD_DAYS = 10;

/**
 * Whether a gift needs attention (story 12-006).
 *
 * Planned against an explicit occasion, never guessed from a date in a
 * calendar: a household that gets gift reminders it never asked for stops
 * reading them, and this module's whole value is that its interruptions are
 * rare and correct.
 */
export function assessGift(gift: GiftPlan, now: Date = new Date()): HomeAssessment {
  const subjectKey = `gift.${gift.id}`;
  const title = `Gift for ${gift.recipient}`;

  if (gift.status === "given" || gift.status === "cancelled" || gift.status === "wrapped") {
    return silent(subjectKey, title, "This one is sorted.");
  }

  const needed = new Date(`${gift.neededBy}T00:00:00.000Z`);
  const daysUntil = Math.floor((needed.getTime() - now.getTime()) / 86_400_000);

  if (daysUntil < 0) {
    return {
      subjectKey,
      title,
      status: "missed",
      riskLevel: "medium",
      notable: true,
      reason: `${gift.recipient}'s gift was needed ${Math.abs(daysUntil)} days ago.`,
      action: { action: "sort_gift", target: gift.id },
      dueOn: gift.neededBy,
    };
  }

  if (daysUntil <= GIFT_LEAD_DAYS && gift.status === "needed") {
    return {
      subjectKey,
      title,
      status: "at_risk",
      riskLevel: daysUntil <= 3 ? "high" : "low",
      notable: true,
      reason: `Nothing chosen yet, and it is needed in ${daysUntil} days.`,
      action: { action: "choose_gift", target: gift.id },
      dueOn: gift.neededBy,
    };
  }

  if (daysUntil <= 3 && gift.status === "chosen") {
    return {
      subjectKey,
      title,
      status: "at_risk",
      riskLevel: "medium",
      notable: true,
      reason: "Chosen but not ordered, and the date is close.",
      action: { action: "order_gift", target: gift.id },
      dueOn: gift.neededBy,
    };
  }

  return silent(subjectKey, title, "There is still time.");
}
