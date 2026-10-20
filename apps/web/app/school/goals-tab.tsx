import { CalendarHeart, Flame, Gift, Hourglass, Target, Trophy } from "lucide-react";

import type { Translate } from "@wonderhome/core/i18n/translate";
import type { Activity } from "@wonderhome/core/school/activities";
import type { StoredGoal } from "@wonderhome/core/school/goal-repository";
import { GOAL_EMOJIS, GOAL_KINDS, childProgress, goalStarts, type ChildProgress, type GoalCheckIn } from "@wonderhome/core/school/goals";
import type { SchoolItem } from "@wonderhome/core/school/items";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { PillLink } from "@wonderhome/core/ui/pill";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { EmptyState } from "@wonderhome/core/ui/states";

import { CheckInAnswer, GoalSheet, RetireGoalButton, type GoalWords } from "./child-goals";

/**
 * A child's score, counted exactly as their own Home counts it
 * (`childProgress`): stars from goals kept and school work done, the level
 * those stars make, the streak, and which goals are met with their reward.
 */
export function kidProgress(input: {
  kidId: string;
  goals: readonly StoredGoal[];
  checkIns: readonly (GoalCheckIn & { childMemberId: string })[];
  items: readonly SchoolItem[];
  timezone: string;
}): ChildProgress {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: input.timezone }).format(new Date());
  const dayOf = (at: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: input.timezone }).format(at);
  const theirs = input.goals.filter((goal) => goal.childMemberId === input.kidId);
  const done = input.items.filter((item) => item.childMemberId === input.kidId && (item.status === "done" || item.status === "submitted") && item.completedAt);
  return childProgress({
    goals: theirs,
    activeGoalIds: new Set(theirs.filter((goal) => goal.active).map((goal) => goal.id)),
    checkIns: input.checkIns.filter((entry) => entry.childMemberId === input.kidId),
    schoolDoneOn: done.map((item) => dayOf(item.completedAt!)),
    schoolDone: done.map((item) => ({ id: item.id, onDay: dayOf(item.completedAt!) })),
    today,
  });
}

/**
 * Each child's score on Kids & School (the owner, 2026-10-20: "show the
 * gamified scores here for each child"): the same level, stars and streak
 * the child sees, the goals met and the rewards they have earned. A tap on
 * Goals is where an adult sets more.
 */
export function ChildScore({ name, progress, t }: { name: string; progress: ChildProgress; t: Translate }) {
  const percent = Math.round((progress.intoLevel / progress.levelSize) * 100);
  const met = progress.goals.filter((standing) => standing.met);
  const rewards = met.filter((standing) => standing.goal.reward);
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-start gap-3">
        <IconTile icon={Trophy} tone="meals" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold break-words">{t("goals.score.level", { name, level: progress.level, title: t(`kids.level.${progress.levelKey}`) })}</p>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--wh-surface-muted)]" role="progressbar" aria-valuemin={0} aria-valuemax={progress.levelSize} aria-valuenow={progress.intoLevel} aria-label={t("kids.hero.toNext", { count: progress.levelSize - progress.intoLevel, level: progress.level + 1 })}>
            <span className="block h-full rounded-full bg-[var(--wh-primary)]" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-1 text-xs text-[var(--wh-foreground-muted)]">{t("kids.hero.toNext", { count: progress.levelSize - progress.intoLevel, level: progress.level + 1 })}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] p-3">
          <p className="text-xl font-bold">
            <span aria-hidden>⭐ </span>
            {progress.stars}
          </p>
          <p className="text-xs text-[var(--wh-foreground-muted)]">{t("goals.score.stars", { goals: progress.fromGoals, school: progress.fromSchool })}</p>
        </div>
        <div className="rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] p-3">
          <p className="flex items-center gap-1 text-xl font-bold">
            <Flame aria-hidden className="size-5 text-[var(--wh-attention)]" />
            {progress.streak}
          </p>
          <p className="text-xs text-[var(--wh-foreground-muted)]">{progress.streak > 0 ? t("kids.hero.streak", { count: progress.streak }) : t("kids.hero.noStreak")}</p>
        </div>
      </div>
      <p className="text-sm">
        {progress.goals.length === 0 ? t("goals.score.noGoals", { name }) : t("goals.score.met", { met: met.length, total: progress.goals.length })}
      </p>
      {rewards.length > 0 ? (
        <ul className="space-y-1">
          {rewards.map((standing) => (
            <li key={standing.goal.id} className="flex items-start gap-2 text-sm">
              <Gift aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--wh-handled)]" />
              <span className="min-w-0 break-words">{t("goals.score.reward", { reward: standing.goal.reward!, goal: standing.goal.title })}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

/**
 * Kids & School → Goals (story 08-017): where a guardian sets, changes and
 * retires a child's goals, sees where each one stands this week and the
 * child's stars, level and streak — the same counts the child sees on their
 * Home, from the same rows. Fun on the child's Home is the family calendar,
 * and this tab says so with the way to add some.
 */
export function GoalsTab({
  householdId,
  kids,
  goals,
  checkIns,
  items,
  activities,
  timezone,
  canChange,
  formatDay,
  t,
}: {
  householdId: string;
  kids: { id: string; name: string }[];
  /** A "2026-10-20" day in the reader's words, for a tick from an earlier day. */
  formatDay: (day: string) => string;
  goals: StoredGoal[];
  checkIns: (GoalCheckIn & { childMemberId: string })[];
  /** The household's school work, done and open: what a goal set from it counts, and what one can start from. */
  items: SchoolItem[];
  activities: Activity[];
  timezone: string;
  canChange: boolean;
  t: Translate;
}) {
  const words: GoalWords = {
    add: t("goals.add"),
    edit: t("goals.edit", { name: "{name}" }),
    retire: t("goals.retire", { name: "{name}" }),
    sheetAdd: t("goals.sheetAdd", { name: "{name}" }),
    sheetEdit: t("goals.sheetEdit", { name: "{name}" }),
    sheetLede: t("goals.sheetLede", { name: "{name}" }),
    title: t("goals.field.title"),
    titlePlaceholder: t("goals.field.titlePlaceholder"),
    kind: t("goals.field.kind"),
    kinds: Object.fromEntries(GOAL_KINDS.map((kind) => [kind, t(`goals.kind.${kind}`)])),
    emoji: t("goals.field.emoji"),
    period: t("goals.field.period"),
    periods: { day: t("goals.period.day"), week: t("goals.period.week"), once: t("goals.period.once") },
    target: t("goals.field.target"),
    stars: t("goals.field.stars"),
    reward: t("goals.field.reward"),
    rewardPlaceholder: t("goals.field.rewardPlaceholder"),
    endsOn: t("goals.field.endsOn"),
    save: t("goals.save"),
    saving: t("common.saving"),
    addNew: t("common.addNew"),
    chooseExisting: t("common.chooseExisting"),
    startFrom: t("goals.start.label"),
    ownGoal: t("goals.start.own"),
    fromClasses: t("goals.start.classes"),
    fromWork: t("goals.start.work"),
    titleClassOnce: t("goals.start.titleClassOnce", { name: "{name}" }),
    titleClass: t("goals.start.titleClass", { name: "{name}", count: "{count}" }),
    titleWork: t("goals.start.titleWork", { name: "{name}" }),
    metByWork: t("goals.start.metByWork", { name: "{name}" }),
  };
  const dayOf = (at: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(at);
  const today = dayOf(new Date());

  if (kids.length === 0) return <EmptyState icon={Target} tone="care" title={t("goals.noChildren")} description={t("goals.noChildrenLede")} />;

  return (
    <div className="space-y-5">
      {kids.map((kid) => {
        const progress = kidProgress({ kidId: kid.id, goals, checkIns, items, timezone });
        const starts = goalStarts({
          activities: activities.filter((activity) => activity.childMemberId === kid.id),
          work: items
            .filter((item) => item.childMemberId === kid.id)
            .map((item) => ({ id: item.id, title: item.title, kind: item.kind, status: item.status, dueOn: item.dueAt ? dayOf(item.dueAt) : null })),
        });
        return (
          <section key={kid.id} className="space-y-2">
            <SectionHeader
              title={t("goals.title", { name: kid.name })}
              count={progress.goals.length || undefined}
              action={canChange ? <GoalSheet householdId={householdId} child={kid} starts={starts} emojis={GOAL_EMOJIS} words={words} /> : undefined}
            />
            {canChange ? <WaitingForYou householdId={householdId} kid={kid} goals={goals} checkIns={checkIns} today={today} formatDay={formatDay} t={t} /> : null}
            <ChildScore name={kid.name} progress={progress} t={t} />
            <p className="text-sm text-[var(--wh-foreground-muted)]">
              {progress.goals.length > 0
                ? t("goals.summary", { stars: progress.fromGoals, streak: progress.streak, name: kid.name })
                : t("goals.lede", { name: kid.name })}
            </p>
            {progress.goals.length === 0 ? (
              <EmptyState icon={Target} tone="care" title={t("goals.empty")} description={t("goals.emptyLede", { name: kid.name })} />
            ) : (
              <Card className="px-3">
                <ul className="divide-y divide-[var(--wh-border)]">
                  {progress.goals.map(({ goal, done, needed, doneToday, waitingToday, met }) => (
                    <li key={goal.id} className="flex items-start gap-3 py-3">
                      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[var(--wh-radius-sm)] bg-[var(--wh-tone-care-soft)] text-xl">
                        {goal.emoji}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium break-words">{goal.title}</p>
                        <p className="text-xs text-[var(--wh-foreground-subtle)]">
                          {[
                            goal.source?.kind === "school_item"
                              ? met
                                ? t("goals.standing.workDone")
                                : t("goals.standing.workOpen")
                              : goal.period === "week"
                              ? t("goals.standing.week", { done, target: needed })
                              : goal.period === "once"
                                ? met
                                  ? t("goals.standing.onceDone")
                                  : t("goals.period.once")
                                : doneToday
                                  ? t("goals.standing.doneToday")
                                  : waitingToday
                                    ? t("goals.standing.waiting")
                                    : t("goals.standing.notYet"),
                            t("kids.goal.stars", { count: goal.stars }),
                            goal.reward ? t("goals.standing.reward", { reward: goal.reward }) : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      {canChange ? (
                        <div className="flex shrink-0 items-center">
                          <GoalSheet householdId={householdId} child={kid} goal={goal} starts={starts} emojis={GOAL_EMOJIS} words={words} />
                          <RetireGoalButton householdId={householdId} id={goal.id} label={t("goals.retire", { name: goal.title })} />
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </section>
        );
      })}

      <Card className="flex items-start gap-3 p-4">
        <CalendarHeart aria-hidden className="size-6 shrink-0 text-[var(--wh-tone-people)]" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-semibold">{t("goals.fun.title")}</p>
          <p className="text-sm text-[var(--wh-foreground-muted)]">{t("goals.fun.lede")}</p>
          <PillLink href="/calendar" tone="soft">
            {t("goals.fun.open")}
          </PillLink>
        </div>
      </Card>
    </div>
  );
}

/**
 * What a child said they did and a grown-up has not answered yet (the owner,
 * 2026-10-20: "send this to adult for verification before making done"):
 * first on the child's Goals, because it is the one thing here waiting on the
 * reader. Each says which goal and which day, with "Yes, done" and "Not yet".
 */
function WaitingForYou({
  householdId,
  kid,
  goals,
  checkIns,
  today,
  formatDay,
  t,
}: {
  householdId: string;
  kid: { id: string; name: string };
  goals: StoredGoal[];
  checkIns: (GoalCheckIn & { childMemberId: string })[];
  today: string;
  formatDay: (day: string) => string;
  t: Translate;
}) {
  const titleOf = new Map(goals.map((goal) => [goal.id, goal]));
  const waiting = checkIns.filter((entry) => entry.childMemberId === kid.id && entry.verified === false && titleOf.has(entry.goalId));
  if (waiting.length === 0) return null;
  return (
    <Card id="waiting" className="scroll-mt-20 space-y-3 border-[var(--wh-attention)] p-4">
      <div className="flex items-start gap-3">
        <IconTile icon={Hourglass} tone="meals" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{t("goals.waiting.title")}</p>
          <p className="text-xs text-[var(--wh-foreground-muted)]">{t("goals.waiting.lede", { name: kid.name })}</p>
        </div>
      </div>
      <ul className="divide-y divide-[var(--wh-border)]">
        {waiting.map((entry) => {
          const goal = titleOf.get(entry.goalId)!;
          return (
            <li key={`${entry.goalId}:${entry.onDay}`} className="space-y-2 py-3">
              <div className="flex items-start gap-3">
                <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[var(--wh-radius-sm)] bg-[var(--wh-tone-care-soft)] text-xl">
                  {goal.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium break-words">{goal.title}</p>
                  <p className="text-xs text-[var(--wh-foreground-subtle)]">
                    {entry.onDay === today ? t("goals.waiting.today", { name: kid.name }) : t("goals.waiting.on", { name: kid.name, day: formatDay(entry.onDay) })}
                    {" · "}
                    {t("kids.goal.stars", { count: goal.stars })}
                  </p>
                </div>
              </div>
              <CheckInAnswer
                householdId={householdId}
                goalId={entry.goalId}
                onDay={entry.onDay}
                words={{
                  verify: t("goals.waiting.verify"),
                  verifyLabel: t("goals.waiting.verifyLabel", { goal: goal.title }),
                  notYet: t("goals.waiting.notYet"),
                  notYetLabel: t("goals.waiting.notYetLabel", { goal: goal.title }),
                }}
              />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
