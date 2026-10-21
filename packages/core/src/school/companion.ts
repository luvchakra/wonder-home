/**
 * A child's companion (story 08-018; the owner, 2026-10-20: "add a cat as
 * companion, cat can come up with new notifications, messages, quotes,
 * ideas, child can give name to the cat").
 *
 * What the cat says is worked out here, on each visit, from the child's own
 * things — never stored, never invented (rule 9). Real news comes first:
 * something new under the bell, missions left for today, a streak to keep,
 * a goal one tick from done, the next fun plan. Then a saying and an idea of
 * the day, picked by the date so they change daily and stay put all day.
 * Each line is a catalog key with its values; the screen puts it in the
 * child's language. Pure.
 *
 * Since the owner's follow-up the same day ("tell some really interesting
 * stuff for the child as per their age, keep reminding them about their
 * homework, classes, responsibilities from time to time, load a new message
 * every time the page or tab opens"): the cat also knows a few true facts
 * picked for the child's age band, reminds them of the next piece of school
 * work, the next class today and what they look after, and the lines are
 * dealt reminder, then something fun, then a reminder again — so stepping
 * one line on each visit keeps the reminders coming back between the fun.
 */

import type { AgeBand } from "../identity/age";
import type { Saying } from "./sayings";

export type CompanionLine = {
  kind: "news" | "homework" | "class" | "duty" | "mission" | "streak" | "goal" | "fun" | "level" | "fact" | "quote" | "idea" | "joke" | "riddle" | "hello";
  /** A `kids.cat.*` catalog key; empty for a saying, which carries its own `text`. */
  key: string;
  values: Record<string, string | number>;
  /** Where tapping the line goes, if it is about something on another screen. */
  href?: string;
  /** A saying from the list, already in the child's language, and its id (recorded once shown, never shown again). */
  text?: string;
  sayingId?: string;
};

export type CompanionFacts = {
  /** The child's unread notifications (the bell's count). */
  unread: number;
  /** The newest unread one's title, in the child's own words, when there is one. */
  newestTitle: string | null;
  missionsLeft: number;
  streak: number;
  /** Whether the child has already done something today (a check-in or school work). */
  activeToday: boolean;
  /** A goal one tick away from being met this period, by title. */
  almostGoal: string | null;
  starsToNextLevel: number;
  nextLevel: number;
  /** The next fun plan's title and how many days away it is (0 = today). */
  nextFun: { title: string; inDays: number } | null;
  /** "2026-10-20" in the household's clock: which saying and idea today is. */
  today: string;
  /** The child's age band, which decides which facts they hear; null (no birthday on record) hears the 8–12 ones. */
  ageBand?: AgeBand | null;
  /** The next piece of school work still open, soonest first, and whether it is due today. */
  homework?: { title: string; dueToday: boolean } | null;
  /** The next class still to come today — an activity or a school period — with its time already written for the child. */
  nextClass?: { name: string; at: string } | null;
  /** What the child looks after in the household (their responsibilities, by name). */
  duties?: readonly string[];
  /**
   * Sayings from the list, unheard first (`nextSayings`). When present they
   * are the cat's fun lines, and nothing repeats until the child has heard the
   * whole list; an empty list means none suits the child and the cat keeps to
   * reminders. Absent (no list yet) falls back to the built-in daily lines.
   */
  sayings?: readonly Saying[] | null;
};

/** How many facts each age band holds (`kids.cat.fact.<band>.N`), and how many the cat brings out each day. */
export const FACTS = 12;
export const FACTS_A_DAY = 4;
export type FactBand = "young" | "older" | "teen";

export function factBand(band: AgeBand | null | undefined): FactBand {
  return band === "young_child" ? "young" : band === "teen" || band === "adult" ? "teen" : "older";
}

/** How many sayings and ideas each language's catalog holds (`kids.cat.quote.N`, `kids.cat.idea.N`). */
export const QUOTES = 12;
export const IDEAS = 12;

function dayNumber(today: string): number {
  const [year, month, day] = today.split("-").map(Number) as [number, number, number];
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

/**
 * Everything the cat could say today. Reminders and fun are dealt in turn —
 * reminder, fun, reminder, fun — most useful reminder first, so the screen
 * can show one line per visit and come back to the reminders between facts.
 */
export function companionLines(facts: CompanionFacts): CompanionLine[] {
  const reminders: CompanionLine[] = [];
  if (facts.unread > 0) {
    reminders.push(
      facts.newestTitle
        ? { kind: "news", key: "kids.cat.news", values: { count: facts.unread, title: facts.newestTitle }, href: "/notifications" }
        : { kind: "news", key: "kids.cat.newsCount", values: { count: facts.unread }, href: "/notifications" },
    );
  }
  if (facts.homework) {
    reminders.push({ kind: "homework", key: facts.homework.dueToday ? "kids.cat.homework.today" : "kids.cat.homework.soon", values: { title: facts.homework.title }, href: facts.homework.dueToday ? "/?tab=school#due-today" : "/?tab=school#coming-up" });
  }
  if (facts.nextClass) reminders.push({ kind: "class", key: "kids.cat.class", values: { name: facts.nextClass.name, time: facts.nextClass.at } });
  if (facts.missionsLeft > 0) reminders.push({ kind: "mission", key: "kids.cat.missions", values: { count: facts.missionsLeft }, href: "/?tab=today#missions" });
  for (const duty of (facts.duties ?? []).slice(0, 2)) reminders.push({ kind: "duty", key: "kids.cat.duty", values: { name: duty } });
  if (facts.streak > 0 && !facts.activeToday) reminders.push({ kind: "streak", key: "kids.cat.streak.keep", values: { count: facts.streak } });
  else if (facts.streak >= 3) reminders.push({ kind: "streak", key: "kids.cat.streak.proud", values: { count: facts.streak } });
  if (facts.almostGoal) reminders.push({ kind: "goal", key: "kids.cat.almost", values: { goal: facts.almostGoal }, href: "/?tab=goals#goals" });
  if (facts.starsToNextLevel > 0 && facts.starsToNextLevel <= 5) reminders.push({ kind: "level", key: "kids.cat.level", values: { count: facts.starsToNextLevel, level: facts.nextLevel } });
  if (facts.nextFun) {
    reminders.push({
      kind: "fun",
      key: facts.nextFun.inDays === 0 ? "kids.cat.fun.today" : facts.nextFun.inDays === 1 ? "kids.cat.fun.tomorrow" : "kids.cat.fun.soon",
      values: { title: facts.nextFun.title, count: facts.nextFun.inDays },
      href: "/?tab=fun#fun",
    });
  }

  const day = dayNumber(facts.today);
  const band = factBand(facts.ageBand);
  const fun: CompanionLine[] = facts.sayings ? facts.sayings.map((saying) => ({ kind: saying.kind, key: "", values: {}, text: saying.text, sayingId: saying.id })) : [];
  for (let n = 0; !facts.sayings && n < FACTS_A_DAY; n += 1) {
    fun.push({ kind: "fact", key: `kids.cat.fact.${band}.${((day * FACTS_A_DAY + n) % FACTS) + 1}`, values: {} });
    if (n === 0) fun.push({ kind: "quote", key: `kids.cat.quote.${(day % QUOTES) + 1}`, values: {} });
    if (n === 1) fun.push({ kind: "idea", key: `kids.cat.idea.${((day * 7) % IDEAS) + 1}`, values: {} });
  }

  if (reminders.length === 0) return [{ kind: "hello", key: "kids.cat.hello", values: {} }, ...fun];
  const lines: CompanionLine[] = [];
  for (let n = 0; n < Math.max(reminders.length, fun.length); n += 1) {
    if (reminders[n]) lines.push(reminders[n]!);
    if (fun[n]) lines.push(fun[n]!);
  }
  return lines;
}

/** "HH:MM" from a time column, or null. */
const clock = (value: string | null | undefined): string | null => (value && /^\d{2}:\d{2}/.test(value) ? value.slice(0, 5) : null);

/**
 * The next class still to come today for this child: an activity on today's
 * weekday (within its dates) or a school timetable period, whichever starts
 * first after `nowHHMM`. Pure.
 */
export function nextClassToday(
  input: {
    childMemberId: string;
    today: string;
    /** ISO weekday of `today`: 1 Monday … 7 Sunday. */
    weekday: number;
    nowHHMM: string;
    activities: readonly { childMemberId: string; name: string; days: readonly number[]; startsAt: string | null; startsOn: string | null; endsOn: string | null }[];
    periods: readonly { childMemberId: string; weekday: number; startsAt: string; subject: string }[];
  },
): { name: string; at: string } | null {
  const candidates: { name: string; at: string }[] = [];
  for (const activity of input.activities) {
    const at = clock(activity.startsAt);
    if (activity.childMemberId !== input.childMemberId || !at || !activity.days.includes(input.weekday)) continue;
    if ((activity.startsOn && activity.startsOn > input.today) || (activity.endsOn && activity.endsOn < input.today)) continue;
    candidates.push({ name: activity.name, at });
  }
  for (const period of input.periods) {
    const at = clock(period.startsAt);
    if (period.childMemberId === input.childMemberId && period.weekday === input.weekday && at) candidates.push({ name: period.subject, at });
  }
  return candidates.filter((candidate) => candidate.at > input.nowHHMM).sort((a, b) => a.at.localeCompare(b.at))[0] ?? null;
}

/** The colours a child can pick for their cat (08-018), each drawn from the `--wh-cat-*` tokens; ginger until they pick. */
export const CAT_COATS = ["ginger", "grey", "black", "white", "brown", "calico"] as const;
export type CatCoat = (typeof CAT_COATS)[number];

export function catCoat(value: unknown): CatCoat {
  return CAT_COATS.includes(value as CatCoat) ? (value as CatCoat) : "ginger";
}

/** A name a child gave: trimmed, one space between words, at most 24 characters; null when empty. */
export function companionName(raw: string): string | null {
  const name = raw.replace(/\s+/g, " ").trim().slice(0, 24).trim();
  return name.length > 0 ? name : null;
}

type Client = import("@supabase/supabase-js").SupabaseClient;

/** The child's companion as stored: its name, or null before they gave one. Nothing at all before the table exists. */
export async function loadCompanion(supabase: Client, householdId: string, memberId: string): Promise<{ name: string | null; coat: CatCoat } | null> {
  const { data, error } = await supabase.from("child_companions").select("name, coat").eq("household_id", householdId).eq("member_id", memberId).maybeSingle();
  if (error) return null;
  const row = data as { name?: string | null; coat?: string | null } | null;
  return { name: (row?.name ?? null) || null, coat: catCoat(row?.coat) };
}

/** The child names (or renames) their own cat and picks its colour; RLS lets only the child write it. */
export async function saveCompanion(supabase: Client, input: { householdId: string; memberId: string; name: string; coat: string }): Promise<{ name: string; coat: CatCoat }> {
  const name = companionName(input.name);
  if (!name) throw new Error("companion_name_empty");
  const coat = catCoat(input.coat);
  const { error } = await supabase
    .from("child_companions")
    .upsert({ household_id: input.householdId, member_id: input.memberId, kind: "cat", name, coat }, { onConflict: "household_id,member_id" });
  if (error) throw new Error(`saveCompanion failed: ${error.code ?? "unknown"}`);
  return { name, coat };
}
