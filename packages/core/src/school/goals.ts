import { daysBetween, shiftDate, startOfWeek } from "../calendar/dates";

/**
 * A child's goals and the game around them (story 08-017).
 *
 * A guardian sets a small goal with a child; the child ticks off the days it
 * was done. Everything game-like on the child's screens is counted here from
 * those check-ins and from school work the child marked done — never stored,
 * never invented (rule 9), so a parent can always say where a star came from:
 *
 * - **Stars**: each check-in earns its goal's stars; each piece of school
 *   work marked done earns one.
 * - **Level**: one level for every `STARS_PER_LEVEL` stars, with a name.
 * - **Streak**: days in a row, ending today (or yesterday, while today is
 *   still open), with at least one check-in or one thing done for school.
 * - **Badges**: fixed milestones over those same counts.
 *
 * Pure: the repository hands it the rows, the screen shows the result.
 */

export const GOAL_KINDS = ["reading", "practice", "sport", "chores", "kindness", "healthy", "sleep", "screen_time", "learning", "other"] as const;
export const GOAL_EMOJIS = ["⭐", "📚", "🎹", "⚽", "🧹", "💛", "🥦", "😴", "📵", "🧠", "🎨", "🚲", "🦷", "🌱", "🏊", "🎯"] as const;
export const GOAL_PERIODS = ["day", "week", "once"] as const;
export type GoalPeriod = (typeof GOAL_PERIODS)[number];

export const STARS_PER_LEVEL = 20;
/** Level names, lowest first; past the last, the last one is kept and the number keeps rising. */
export const LEVELS = ["starter", "explorer", "adventurer", "champion", "hero", "legend", "superstar"] as const;
export type LevelKey = (typeof LEVELS)[number];

export type ChildGoal = {
  id: string;
  childMemberId: string;
  title: string;
  kind: string;
  emoji: string;
  period: GoalPeriod;
  /** Days needed per week for a weekly goal; 1 otherwise. */
  target: number;
  stars: number;
  reward: string | null;
  endsOn: string | null;
  /**
   * What it was set from (the owner, 2026-10-20): a class outside school, or
   * a piece of school work — the second is met when that work is marked
   * done, with no check-in of its own.
   */
  source?: { kind: "activity" | "school_item"; id: string } | null;
};

export type GoalCheckIn = { goalId: string; onDay: string };

export type GoalStanding = {
  goal: ChildGoal;
  /** Check-ins in the goal's current period (today, this week, or ever for a one-off). */
  done: number;
  needed: number;
  /** Checked in today already — the button then offers to take it back. */
  doneToday: boolean;
  /** The current period's target is reached: the reward is earned. */
  met: boolean;
};

export const BADGES = ["first_star", "streak_3", "streak_7", "stars_50", "stars_100", "goal_met", "school_10"] as const;
export type BadgeKey = (typeof BADGES)[number];

export type ChildProgress = {
  stars: number;
  fromGoals: number;
  fromSchool: number;
  level: number;
  levelKey: LevelKey;
  /** Stars within the current level, and how many the level holds. */
  intoLevel: number;
  levelSize: number;
  streak: number;
  /** Every badge, earned or not, in a fixed order. */
  badges: { key: BadgeKey; earned: boolean }[];
  goals: GoalStanding[];
};

/** Which days count toward a goal's current period, as [from, to] keys (both included). */
export function periodOf(goal: Pick<ChildGoal, "period">, today: string, weekStartsOn = 1): { from: string; to: string } | null {
  if (goal.period === "day") return { from: today, to: today };
  if (goal.period === "week") {
    const from = startOfWeek(today, weekStartsOn);
    return { from, to: shiftDate(from, 6) };
  }
  return null;
}

/** Each goal where it stands now. A goal past its end date is not offered. */
export function goalStandings(goals: readonly ChildGoal[], checkIns: readonly GoalCheckIn[], today: string, weekStartsOn = 1): GoalStanding[] {
  return goals
    .filter((goal) => !goal.endsOn || goal.endsOn >= today)
    .map((goal) => {
      const own = checkIns.filter((entry) => entry.goalId === goal.id);
      const period = periodOf(goal, today, weekStartsOn);
      const inPeriod = period ? own.filter((entry) => entry.onDay >= period.from && entry.onDay <= period.to) : own;
      const needed = goal.period === "week" ? goal.target : 1;
      const done = Math.min(inPeriod.length, needed);
      return { goal, done, needed, doneToday: own.some((entry) => entry.onDay === today), met: done >= needed };
    });
}

/** Days in a row with something done, ending today — or yesterday while today has nothing yet. */
export function streakOf(activeDays: Iterable<string>, today: string): number {
  const days = new Set(activeDays);
  let day = days.has(today) ? today : shiftDate(today, -1);
  let streak = 0;
  while (days.has(day)) {
    streak += 1;
    day = shiftDate(day, -1);
  }
  return streak;
}

/** Whether any week (or day) so far reached a goal's target — "goal_met" is earned once ever. */
function everMet(goals: readonly ChildGoal[], checkIns: readonly GoalCheckIn[], weekStartsOn: number): boolean {
  for (const goal of goals) {
    const days = checkIns.filter((entry) => entry.goalId === goal.id).map((entry) => entry.onDay);
    if (days.length === 0) continue;
    if (goal.period !== "week") return true;
    const perWeek = new Map<string, number>();
    for (const day of days) {
      const week = startOfWeek(day, weekStartsOn);
      perWeek.set(week, (perWeek.get(week) ?? 0) + 1);
    }
    if ([...perWeek.values()].some((count) => count >= goal.target)) return true;
  }
  return false;
}

export function childProgress(input: {
  /** Every goal the child has had, retired ones included: their check-ins still earned stars. */
  goals: readonly ChildGoal[];
  /** Ids of the goals still current — the only ones offered. */
  activeGoalIds: ReadonlySet<string>;
  checkIns: readonly GoalCheckIn[];
  /** The local day each piece of school work was marked done. */
  schoolDoneOn: readonly string[];
  /** Which school work was done, by id and day: what a goal set from it counts. */
  schoolDone?: readonly { id: string; onDay: string }[];
  today: string;
  weekStartsOn?: number;
}): ChildProgress {
  const weekStartsOn = input.weekStartsOn ?? 1;
  // A goal set from a piece of school work is ticked the day that work was marked done.
  const doneOn = new Map((input.schoolDone ?? []).map((entry) => [entry.id, entry.onDay]));
  const fromWork = input.goals.flatMap((goal) => {
    const day = goal.source?.kind === "school_item" ? doneOn.get(goal.source.id) : undefined;
    return day ? [{ goalId: goal.id, onDay: day }] : [];
  });
  input = { ...input, checkIns: [...input.checkIns, ...fromWork] };
  const starsOf = new Map(input.goals.map((goal) => [goal.id, goal.stars]));
  const fromGoals = input.checkIns.reduce((sum, entry) => sum + (starsOf.get(entry.goalId) ?? 0), 0);
  const fromSchool = input.schoolDoneOn.length;
  const stars = fromGoals + fromSchool;
  const levelIndex = Math.floor(stars / STARS_PER_LEVEL);
  const streak = streakOf(
    [...input.checkIns.map((entry) => entry.onDay), ...input.schoolDoneOn].filter((day) => daysBetween(day, input.today) >= 0),
    input.today,
  );
  const earned: Record<BadgeKey, boolean> = {
    first_star: stars >= 1,
    streak_3: streak >= 3,
    streak_7: streak >= 7,
    stars_50: stars >= 50,
    stars_100: stars >= 100,
    goal_met: everMet(input.goals, input.checkIns, weekStartsOn),
    school_10: fromSchool >= 10,
  };
  return {
    stars,
    fromGoals,
    fromSchool,
    level: levelIndex + 1,
    levelKey: LEVELS[Math.min(levelIndex, LEVELS.length - 1)]!,
    intoLevel: stars - levelIndex * STARS_PER_LEVEL,
    levelSize: STARS_PER_LEVEL,
    streak,
    badges: BADGES.map((key) => ({ key, earned: earned[key] })),
    goals: goalStandings(
      input.goals.filter((goal) => input.activeGoalIds.has(goal.id)),
      input.checkIns,
      input.today,
      weekStartsOn,
    ),
  };
}

/**
 * Where a goal can start from (the owner, 2026-10-20: "use existing entries
 * for school and extra classes to define the goals"). Each class outside
 * school offers "every class this week" — as many times as it meets — and
 * each piece of open school work offers "finish it", a one-off goal met the
 * day the work is marked done. Events and notices are things to know, not
 * things to do, so they offer nothing. The words of the title are the
 * screen's; this decides only the shape.
 */
export type GoalStart = {
  source: { kind: "activity" | "school_item"; id: string };
  /** The class's or the work's own name, as recorded. */
  name: string;
  goalKind: (typeof GOAL_KINDS)[number];
  emoji: string;
  period: GoalPeriod;
  target: number;
  /** A school-work goal ends the day the work is due. */
  endsOn: string | null;
};

const ACTIVITY_GOAL: Record<string, { goalKind: (typeof GOAL_KINDS)[number]; emoji: string }> = {
  music: { goalKind: "practice", emoji: "🎹" },
  dance: { goalKind: "sport", emoji: "🎯" },
  sport: { goalKind: "sport", emoji: "⚽" },
  martial_arts: { goalKind: "sport", emoji: "🎯" },
  art: { goalKind: "practice", emoji: "🎨" },
  language: { goalKind: "learning", emoji: "🧠" },
  academic: { goalKind: "learning", emoji: "🧠" },
};

export function goalStarts(input: {
  activities: readonly { id: string; name: string; kind: string; days: readonly number[] }[];
  work: readonly { id: string; title: string; kind: string; status: string; dueOn: string | null }[];
}): GoalStart[] {
  const classes = input.activities.map((activity): GoalStart => {
    const shape = ACTIVITY_GOAL[activity.kind] ?? { goalKind: "practice", emoji: "⭐" };
    return {
      source: { kind: "activity", id: activity.id },
      name: activity.name,
      ...shape,
      period: "week",
      target: Math.min(7, Math.max(1, new Set(activity.days).size)),
      endsOn: null,
    };
  });
  const work = input.work
    .filter((item) => item.kind !== "event" && item.kind !== "notice" && (item.status === "pending" || item.status === "in_progress"))
    .map(
      (item): GoalStart => ({
        source: { kind: "school_item", id: item.id },
        name: item.title,
        goalKind: "learning",
        emoji: "📚",
        period: "once",
        target: 1,
        endsOn: item.dueOn,
      }),
    );
  return [...classes, ...work];
}
