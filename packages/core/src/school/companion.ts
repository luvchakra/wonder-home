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
 */

export type CompanionLine = {
  kind: "news" | "mission" | "streak" | "goal" | "fun" | "level" | "quote" | "idea" | "hello";
  /** A `kids.cat.*` catalog key. */
  key: string;
  values: Record<string, string | number>;
  /** Where tapping the line goes, if it is about something on another screen. */
  href?: string;
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
};

/** How many sayings and ideas each language's catalog holds (`kids.cat.quote.N`, `kids.cat.idea.N`). */
export const QUOTES = 12;
export const IDEAS = 12;

function dayNumber(today: string): number {
  const [year, month, day] = today.split("-").map(Number) as [number, number, number];
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

/** Everything the cat could say today, most useful first. The screen shows the first and offers "another". */
export function companionLines(facts: CompanionFacts): CompanionLine[] {
  const lines: CompanionLine[] = [];
  if (facts.unread > 0) {
    lines.push(
      facts.newestTitle
        ? { kind: "news", key: "kids.cat.news", values: { count: facts.unread, title: facts.newestTitle }, href: "/notifications" }
        : { kind: "news", key: "kids.cat.newsCount", values: { count: facts.unread }, href: "/notifications" },
    );
  }
  if (facts.missionsLeft > 0) lines.push({ kind: "mission", key: "kids.cat.missions", values: { count: facts.missionsLeft }, href: "/?tab=today" });
  if (facts.streak > 0 && !facts.activeToday) lines.push({ kind: "streak", key: "kids.cat.streak.keep", values: { count: facts.streak } });
  else if (facts.streak >= 3) lines.push({ kind: "streak", key: "kids.cat.streak.proud", values: { count: facts.streak } });
  if (facts.almostGoal) lines.push({ kind: "goal", key: "kids.cat.almost", values: { goal: facts.almostGoal }, href: "/?tab=goals" });
  if (facts.starsToNextLevel > 0 && facts.starsToNextLevel <= 5) lines.push({ kind: "level", key: "kids.cat.level", values: { count: facts.starsToNextLevel, level: facts.nextLevel } });
  if (facts.nextFun) {
    lines.push({
      kind: "fun",
      key: facts.nextFun.inDays === 0 ? "kids.cat.fun.today" : facts.nextFun.inDays === 1 ? "kids.cat.fun.tomorrow" : "kids.cat.fun.soon",
      values: { title: facts.nextFun.title, count: facts.nextFun.inDays },
      href: "/?tab=fun",
    });
  }
  const day = dayNumber(facts.today);
  lines.push({ kind: "quote", key: `kids.cat.quote.${(day % QUOTES) + 1}`, values: {} });
  lines.push({ kind: "idea", key: `kids.cat.idea.${((day * 7) % IDEAS) + 1}`, values: {} });
  if (lines.length === 2) lines.unshift({ kind: "hello", key: "kids.cat.hello", values: {} });
  return lines;
}

/** A name a child gave: trimmed, one space between words, at most 24 characters; null when empty. */
export function companionName(raw: string): string | null {
  const name = raw.replace(/\s+/g, " ").trim().slice(0, 24).trim();
  return name.length > 0 ? name : null;
}

type Client = import("@supabase/supabase-js").SupabaseClient;

/** The child's companion as stored: its name, or null before they gave one. Nothing at all before the table exists. */
export async function loadCompanion(supabase: Client, householdId: string, memberId: string): Promise<{ name: string | null } | null> {
  const { data, error } = await supabase.from("child_companions").select("name").eq("household_id", householdId).eq("member_id", memberId).maybeSingle();
  if (error) return null;
  return { name: ((data as { name?: string | null } | null)?.name ?? null) || null };
}

/** The child names (or renames) their own cat; RLS lets only the child write it. */
export async function saveCompanionName(supabase: Client, input: { householdId: string; memberId: string; name: string }): Promise<string> {
  const name = companionName(input.name);
  if (!name) throw new Error("companion_name_empty");
  const { error } = await supabase
    .from("child_companions")
    .upsert({ household_id: input.householdId, member_id: input.memberId, kind: "cat", name }, { onConflict: "household_id,member_id" });
  if (error) throw new Error(`saveCompanionName failed: ${error.code ?? "unknown"}`);
  return name;
}
