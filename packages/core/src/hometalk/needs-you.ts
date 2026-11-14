/**
 * The one "Needs you" list (the owner, 2026-11-14; decision 4;
 * docs/design/2026-11-14-nothing-stuck-in-review.md).
 *
 * Everything that needs a person sits here, from every part: HomeSend's
 * questions (a Checking entry's check, a waiting item's one question, "send it
 * again?"), HomeTalk proposals still waiting for a yes, approvals, and what
 * parts B and C add ("Trust this sender?", a conflict the nightly check found).
 *
 * Every question carries a stored default and two deadlines: the default
 * applies by itself 24 hours after asking (`DEFAULT_AFTER_HOURS`), and nothing
 * stays open more than 48 hours (`EXPIRE_AFTER_HOURS`). The list shows at most
 * three at a time (`SHOWN_AT_ONCE`), most consequential first: money due soon,
 * then school deadlines, then dated things, then the rest; the older first
 * within each.
 *
 * Pure. The rows live in `needs_you_items` (`needs-you-repository.ts`); the
 * background step that applies due defaults is `hometalk/needs-you-run.ts`.
 */

export const DEFAULT_AFTER_HOURS = 24;
export const EXPIRE_AFTER_HOURS = 48;
export const SHOWN_AT_ONCE = 3;
/** "Due soon" for ranking: within a week on the household's calendar. */
export const SOON_DAYS = 7;

/**
 * Where a question comes from. Part A's are the first four; part B adds
 * `sender_trust`, part C `conflict`. A row with a source not listed here is
 * still shown (worded by its `prompt.code`), so a part can add one without
 * this file changing first.
 */
export const NEEDS_YOU_SOURCES = ["homesend_check", "homesend_waiting", "homesend_resend", "hometalk_proposal", "approval", "sender_trust", "conflict"] as const;
export type NeedsYouSource = (typeof NEEDS_YOU_SOURCES)[number];

/** 3 money due soon, 2 a school deadline, 1 a dated thing, 0 the rest. */
export type Consequence = 0 | 1 | 2 | 3;

/** A closed tap answer; the screen words it from `needsYou.answer.<value>`. */
export type NeedsYouAnswer = { value: string };

/**
 * A question's words as a closed code plus parameters. `title` is the one
 * piece of household content (the entry's or item's own name), shown only to
 * the people the row is for.
 */
export type NeedsYouPrompt = {
  code: string;
  title?: string | null;
  /** Kind of thing asked about (bill, school_item, …), for the topic mark. */
  kind?: string | null;
  /** The field a Checking question is about. */
  field?: string | null;
  /** HomeTalk: the conversation the proposal belongs to; approvals: where to decide. */
  href?: string | null;
};

export type NeedsYouItem = {
  id: string;
  householdId: string;
  source: NeedsYouSource | string;
  subjectTable: string;
  subjectId: string;
  /** Null: the household's Admins. */
  recipientMemberId: string | null;
  prompt: NeedsYouPrompt;
  answers: NeedsYouAnswer[];
  defaultAnswer: string;
  defaultAt: string;
  expiresAt: string;
  consequence: Consequence;
  dueOn: string | null;
  createdAt: string;
  /**
   * Read-only rows (a HomeTalk proposal, an approval) are answered where they
   * live; the list links there. Only `needs_you_items` rows are answered in place.
   */
  answeredInPlace: boolean;
};

/** What a new question needs; the deadlines are computed from `askedAt`. */
export type NewNeedsYou = Omit<NeedsYouItem, "id" | "defaultAt" | "expiresAt" | "createdAt" | "answeredInPlace"> & { askedAt: Date };

/**
 * When the default applies and when the question closes, counted from when it
 * was asked. HomeSend asks from when the thing was sent, so the same item
 * applies its default 24 hours after it arrived, whenever the question was
 * written down (and the one-time pass on 2026-11-14 settled what was older).
 */
export function deadlinesFor(askedAt: Date): { defaultAt: string; expiresAt: string } {
  const from = askedAt.getTime();
  return {
    defaultAt: new Date(from + DEFAULT_AFTER_HOURS * 3_600_000).toISOString(),
    expiresAt: new Date(from + EXPIRE_AFTER_HOURS * 3_600_000).toISOString(),
  };
}

/** Whole days from `today` to `day` (both "YYYY-MM-DD"); negative when past. */
function daysUntil(day: string, today: string): number {
  return Math.round((Date.parse(`${day.slice(0, 10)}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

const MONEY_KINDS = new Set(["bill", "receipt", "purchase"]);
const SCHOOL_KINDS = new Set(["school_item", "activity_item"]);

/**
 * How much a question matters, from what it is about and its day: money due
 * within a week leads, then a school deadline within a week, then anything
 * else with a day, then the rest.
 */
export function consequenceOf(kind: string | null | undefined, dueOn: string | null | undefined, today: string): Consequence {
  const soon = dueOn ? daysUntil(dueOn, today) <= SOON_DAYS : false;
  if (kind && MONEY_KINDS.has(kind)) return soon ? 3 : 1;
  if (kind && SCHOOL_KINDS.has(kind)) return soon ? 2 : 1;
  return dueOn ? 1 : 0;
}

/**
 * The list in the order a person sees it: most consequential first, then the
 * earlier day, then the oldest question. `shown` is the first three; `total`
 * says how many there are in all ("Needs you · 5").
 */
export function rankNeedsYou<T extends Pick<NeedsYouItem, "consequence" | "dueOn" | "createdAt" | "id">>(items: readonly T[], limit: number = SHOWN_AT_ONCE): { shown: T[]; total: number } {
  const sorted = [...items].sort((a, b) => {
    if (a.consequence !== b.consequence) return b.consequence - a.consequence;
    const aDay = a.dueOn ?? "9999-12-31";
    const bDay = b.dueOn ?? "9999-12-31";
    if (aDay !== bDay) return aDay < bDay ? -1 : 1;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });
  return { shown: sorted.slice(0, Math.max(0, limit)), total: sorted.length };
}

/** Whether a question's default is due now. */
export function defaultDue(item: Pick<NeedsYouItem, "defaultAt">, now: Date): boolean {
  return Date.parse(item.defaultAt) <= now.getTime();
}

/** Whether an answer is one this question offers (or its default). Anything else is refused. */
export function isOfferedAnswer(item: Pick<NeedsYouItem, "answers" | "defaultAnswer">, answer: string): boolean {
  return answer === item.defaultAnswer || item.answers.some((offered) => offered.value === answer);
}

/** The oldest open question's age in hours, for the Platform admin measure. */
export function oldestAgeHours(items: readonly Pick<NeedsYouItem, "createdAt">[], now: Date): number | null {
  if (items.length === 0) return null;
  const oldest = Math.min(...items.map((item) => Date.parse(item.createdAt)));
  return Math.max(0, Math.floor((now.getTime() - oldest) / 3_600_000));
}
