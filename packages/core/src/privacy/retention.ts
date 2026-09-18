/**
 * How long WonderHome keeps things (story 15-007).
 *
 * A household asked to trust a system with their home deserves an answer to
 * "how long do you keep this", and the answer has to be specific. "As long as
 * necessary" is not a retention policy; it is a way of not having one.
 *
 * So the schedule is data, in one place, in days. The Privacy Centre renders
 * it, and anything that actually deletes reads the same numbers — a policy
 * shown on a screen but not applied by the code is worse than no policy,
 * because it is a promise.
 *
 * Two principles run through the numbers below.
 *
 * **What the household typed, they own.** Their playbook, their rules, their
 * lists stay until they remove them. Nothing in here expires a household's
 * own words on a timer.
 *
 * **What the system inferred about them, expires.** Conversation transcripts,
 * what the assistant thinks it learned, provider sync records — all of it
 * ages out, because the longer a guess is kept the more it looks like a fact.
 */

export type RetentionClass =
  | "household_content"
  | "conversation"
  | "memory"
  | "notifications"
  | "integration_events"
  | "usage"
  | "audit"
  | "step_up"
  | "deleted_member";

export type RetentionRule = {
  /** Null means kept until the household removes it themselves. */
  days: number | null;
  /** What this covers, in the household's terms. */
  label: string;
  /** Why this long, rather than longer or shorter. */
  because: string;
};

export const RETENTION: Record<RetentionClass, RetentionRule> = {
  household_content: {
    days: null,
    label: "Your playbook, responsibilities, rules and lists",
    because: "You wrote these. They stay until you remove them.",
  },
  conversation: {
    days: 90,
    label: "What you said to the assistant",
    because:
      "Long enough to look back over a season of family life, short enough that a year of kitchen conversation is not sitting on a server.",
  },
  memory: {
    days: 365,
    label: "What WonderHome learned about how your home runs",
    because:
      "A household's rhythm turns over about once a year. Anything older is a guess about a family that has changed.",
  },
  notifications: {
    days: 180,
    label: "Notifications and what happened to them",
    because: "Enough to answer 'was I told about this', which is the only question anybody asks of them.",
  },
  integration_events: {
    days: 60,
    label: "Records of syncing with connected accounts",
    because: "They exist to debug a sync that went wrong. A two-month-old sync is not being debugged.",
  },
  usage: {
    days: 400,
    label: "Counts of what your plan has used",
    because: "A full year plus the tail of a billing cycle, so an annual plan can always be reconciled.",
  },
  audit: {
    days: 730,
    label: "The record of who changed what",
    because:
      "Two years, because the questions this answers — who gave somebody access, when did that change — are asked long after the fact. Deleting it sooner would make the trail less useful than the thing it protects against.",
  },
  step_up: {
    days: 30,
    label: "Records of confirming it was you",
    because: "They stop being useful the moment they expire; a month covers looking into a disputed action.",
  },
  deleted_member: {
    days: 30,
    label: "Data belonging to somebody who left",
    because:
      "The grace window. Long enough to undo a decision made in a bad week, short enough that leaving means leaving.",
  },
};

/** How long a deletion request waits before it acts. Matches the class above. */
export const DELETION_GRACE_DAYS = RETENTION.deleted_member.days ?? 30;

export function actsAt(requestedAt: Date): Date {
  return new Date(requestedAt.getTime() + DELETION_GRACE_DAYS * 86_400_000);
}

/** Whether a thing of this class, last touched then, is now past its keeping. */
export function isExpired(
  retentionClass: RetentionClass,
  lastTouched: Date,
  now: Date = new Date(),
): boolean {
  const { days } = RETENTION[retentionClass];
  if (days === null) return false;
  return now.getTime() - lastTouched.getTime() > days * 86_400_000;
}

/** The schedule, ordered for reading: what you own first, then what expires soonest. */
export function retentionSchedule(): { key: RetentionClass; rule: RetentionRule }[] {
  const entries = Object.entries(RETENTION) as [RetentionClass, RetentionRule][];
  return entries
    .map(([key, rule]) => ({ key, rule }))
    .sort((a, b) => {
      if (a.rule.days === null) return -1;
      if (b.rule.days === null) return 1;
      return a.rule.days - b.rule.days;
    });
}

/** "90 days", "a year", "until you remove it" — the household's phrasing. */
export function describeDays(days: number | null): string {
  if (days === null) return "Until you remove it";
  if (days >= 730) return `${Math.round(days / 365)} years`;
  if (days === 365) return "A year";
  if (days > 365) return `${Math.round((days / 365) * 10) / 10} years`;
  if (days >= 30 && days % 30 === 0) return `${days / 30} months`;
  return `${days} days`;
}
