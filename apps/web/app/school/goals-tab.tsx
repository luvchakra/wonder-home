import { CalendarHeart, Target } from "lucide-react";

import type { Translate } from "@wonderhome/core/i18n/translate";
import type { StoredGoal } from "@wonderhome/core/school/goal-repository";
import { GOAL_EMOJIS, GOAL_KINDS, childProgress, type GoalCheckIn } from "@wonderhome/core/school/goals";
import { Card } from "@wonderhome/core/ui/card";
import { PillLink } from "@wonderhome/core/ui/pill";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { EmptyState } from "@wonderhome/core/ui/states";

import { GoalSheet, RetireGoalButton, type GoalWords } from "./child-goals";

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
  timezone,
  canChange,
  t,
}: {
  householdId: string;
  kids: { id: string; name: string }[];
  goals: StoredGoal[];
  checkIns: (GoalCheckIn & { childMemberId: string })[];
  timezone: string;
  canChange: boolean;
  t: Translate;
}) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
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
  };

  if (kids.length === 0) return <EmptyState icon={Target} tone="care" title={t("goals.noChildren")} description={t("goals.noChildrenLede")} />;

  return (
    <div className="space-y-5">
      {kids.map((kid) => {
        const theirs = goals.filter((goal) => goal.childMemberId === kid.id);
        const progress = childProgress({
          goals: theirs,
          activeGoalIds: new Set(theirs.filter((goal) => goal.active).map((goal) => goal.id)),
          checkIns: checkIns.filter((entry) => entry.childMemberId === kid.id),
          // School stars are counted on the child's own Home from their school work; here, goals only.
          schoolDoneOn: [],
          today,
        });
        return (
          <section key={kid.id} className="space-y-2">
            <SectionHeader
              title={t("goals.title", { name: kid.name })}
              count={progress.goals.length || undefined}
              action={canChange ? <GoalSheet householdId={householdId} child={kid} emojis={GOAL_EMOJIS} words={words} /> : undefined}
            />
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
                  {progress.goals.map(({ goal, done, needed, doneToday, met }) => (
                    <li key={goal.id} className="flex items-start gap-3 py-3">
                      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[var(--wh-radius-sm)] bg-[var(--wh-tone-care-soft)] text-xl">
                        {goal.emoji}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium break-words">{goal.title}</p>
                        <p className="text-xs text-[var(--wh-foreground-subtle)]">
                          {[
                            goal.period === "week"
                              ? t("goals.standing.week", { done, target: needed })
                              : goal.period === "once"
                                ? met
                                  ? t("goals.standing.onceDone")
                                  : t("goals.period.once")
                                : doneToday
                                  ? t("goals.standing.doneToday")
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
                          <GoalSheet householdId={householdId} child={kid} goal={goal} emojis={GOAL_EMOJIS} words={words} />
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
