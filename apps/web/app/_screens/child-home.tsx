import { BookOpen, CalendarHeart, Flame, PartyPopper, Sparkles, Star, Target, Trophy } from "lucide-react";

import { listEvents } from "@wonderhome/core/family/repository";
import type { FamilyEvent } from "@wonderhome/core/family/schedule";
import type { Translate } from "@wonderhome/core/i18n/translate";
import { localizeReminder } from "@wonderhome/core/notifications/message";
import { listActivities } from "@wonderhome/core/school/activities";
import { CAT_COATS, companionLines, loadCompanion, nextClassToday } from "@wonderhome/core/school/companion";
import { listTimetable } from "@wonderhome/core/school/exams";
import { listCheckIns, listGoals } from "@wonderhome/core/school/goal-repository";
import { childProgress, STARS_PER_LEVEL, type ChildProgress, type GoalStanding } from "@wonderhome/core/school/goals";
import type { TranslationKey } from "@wonderhome/core/i18n/translate";
import { listSchoolItems } from "@wonderhome/core/school/repository";
import { childView, type SchoolItem } from "@wonderhome/core/school/items";
import { localInstant, schoolDayZone } from "@wonderhome/core/school/times";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { CalendarItem } from "@wonderhome/core/ui/calendar-item";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { SegmentedControl } from "@wonderhome/core/ui/segmented-control";
import { ExpandableRow } from "@wonderhome/core/ui/expandable-row";
import { EmptyState } from "@wonderhome/core/ui/states";

import { CompanionCard } from "../_components/companion-card";
import { KidDoneButton } from "../_components/kid-done-button";
import { ScrollToSection } from "../_components/scroll-to-section";
import { eventWhen } from "../_lib/event-when";
import { formatDate, formatTime, type Session } from "../_lib/session";

const TABS = ["today", "school", "goals", "fun"] as const;
type Tab = (typeof TABS)[number];
const FUN_KINDS = new Set(["outing", "family_time", "birthday", "gathering", "travel", "special_occasion"]);

/**
 * The child view (requirements §15, story 08-017): "Hi Anaya!", a game card
 * with their level, stars and streak, and Today, School, Goals and Fun.
 * Age-appropriate by construction — this screen reads the child's own school
 * work, their own goals and the family calendar, and nothing else. Money,
 * administration and other people's conversations are not filtered out
 * here; they were never fetched. Every star is counted from something they
 * did (`childProgress`), and the card says where they came from.
 */
export async function ChildHome({ session, tab = "today" }: { session: Session; tab?: string }) {
  const { supabase, membership, view, viewer, secondary } = session;
  const { t } = session.locale;
  const householdId = membership.household.id;
  const timezone = membership.household.timezone;
  const memberId = membership.memberId;
  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);
  const firstName = view.displayName.split(" ")[0] ?? view.displayName;

  const [items, events, goals, checkIns, companion, newest, activities, periods, duties] = await Promise.all([
    listSchoolItems(supabase, householdId, { childMemberId: memberId }).catch(() => [] as SchoolItem[]),
    listEvents(supabase, householdId, { from: new Date(now.getTime() - 86_400_000), to: new Date(now.getTime() + 14 * 86_400_000) }).catch(() => [] as FamilyEvent[]),
    listGoals(supabase, householdId, memberId).catch(() => []),
    listCheckIns(supabase, householdId, memberId).catch(() => []),
    // The cat (08-018): its name, and the newest thing waiting under the child's own bell.
    loadCompanion(supabase, householdId, memberId).catch(() => null),
    (viewer.unread ?? 0) > 0
      ? supabase
          .from("notifications")
          .select("title, body, message")
          .eq("recipient_member_id", memberId)
          .in("status", ["generated", "delivered"])
          .lte("scheduled_for", now.toISOString())
          .order("scheduled_for", { ascending: false })
          .limit(1)
          .maybeSingle()
          .then(({ data }) => data as { title: string; body: string; message?: unknown } | null)
      : Promise.resolve(null),
    // What the cat reminds them of: today's classes and what they look after.
    listActivities(supabase, householdId).catch(() => []),
    listTimetable(supabase, householdId).catch(() => []),
    supabase
      .from("responsibilities")
      .select("outcome_key, playbook_items(name)")
      .eq("household_id", householdId)
      .eq("primary_member_id", memberId)
      .order("priority")
      .limit(2)
      .then(({ data }) =>
        ((data ?? []) as { outcome_key: string; playbook_items: { name: string } | { name: string }[] | null }[]).map((row) => {
          const item = Array.isArray(row.playbook_items) ? row.playbook_items[0] : row.playbook_items;
          return item?.name ?? row.outcome_key.replace(/[._]/g, " ");
        }),
      ),
  ]);

  const school = childView(items, now);
  const dayOf = (at: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(at);
  const doneItems = items.filter((item) => (item.status === "done" || item.status === "submitted") && item.completedAt);
  const progress = childProgress({
    goals,
    activeGoalIds: new Set(goals.filter((goal) => goal.active).map((goal) => goal.id)),
    checkIns,
    schoolDoneOn: doneItems.map((item) => dayOf(item.completedAt!)),
    schoolDone: doneItems.map((item) => ({ id: item.id, onDay: dayOf(item.completedAt!) })),
    today,
  });
  const doneToday = doneItems.filter((item) => dayOf(item.completedAt!) === today);

  const requested = tab === "homework" ? "school" : tab;
  const active: Tab = (TABS as readonly string[]).includes(requested) ? (requested as Tab) : "today";
  const upcoming = events.filter((event) => event.endsAt >= now);
  const fun = upcoming.filter((event) => FUN_KINDS.has(event.kind));
  const happeningToday = upcoming.filter((event) => dayOf(event.startsAt) <= today && dayOf(new Date(event.endsAt.getTime() - 1)) >= today);
  // A goal set from school work is that work's own mission, already listed: not a second one.
  const missionGoals = progress.goals.filter((standing) => standing.goal.source?.kind !== "school_item" && (standing.goal.period !== "once" || !standing.met || standing.doneToday));
  const missionsLeft = school.today.length + missionGoals.filter((standing) => !standing.doneToday && !standing.met).length;
  const missionCount = school.today.length + doneToday.length + missionGoals.length;

  // What the cat says, most useful first, each line in the child's words (08-018).
  const nextFun = fun[0] ?? null;
  const nowHHMM = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
  const weekday = ((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
  const nextClass = nextClassToday({ childMemberId: memberId, today, weekday, nowHHMM, activities, periods });
  const openWork = [...school.today, ...school.soon].sort((a, b) => (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity))[0];
  const clockFor = (at: string) => {
    const instant = localInstant(today, at, timezone);
    return instant ? session.locale.format.time(instant) : at;
  };
  const almost = progress.goals.find((standing) => !standing.met && standing.needed - standing.done === 1 && !standing.doneToday);
  const catLines = companionLines({
    unread: viewer.unread ?? 0,
    newestTitle: newest ? localizeReminder(newest, t, session.locale.format).title : null,
    missionsLeft,
    streak: progress.streak,
    activeToday: doneToday.length > 0 || checkIns.some((checkIn) => checkIn.onDay === today),
    almostGoal: almost?.goal.title ?? null,
    starsToNextLevel: progress.levelSize - progress.intoLevel,
    nextLevel: progress.level + 1,
    nextFun: nextFun ? { title: nextFun.title, inDays: Math.max(0, Math.round((Date.parse(`${dayOf(nextFun.startsAt)}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)) } : null,
    today,
    ageBand: view.ageBand,
    homework: openWork ? { title: openWork.title, dueToday: school.today.includes(openWork) } : null,
    nextClass: nextClass ? { name: nextClass.name, at: clockFor(nextClass.at) } : null,
    duties,
  }).map((line) => ({ text: t(line.key as TranslationKey, line.values), ...(line.href ? { href: line.href } : {}) }));

  const doneLabels = (name: string, stars: number) => ({
    doIt: t("kids.do"),
    done: t("kids.done"),
    undo: t("kids.undo", { name }),
    earned: t("kids.earned", { count: stars }),
  });

  return (
    <AppShell active="home" viewer={viewer} secondary={secondary} pathname="/">
      <div className="space-y-5">
        <header className="wh-rise space-y-1">
          <h1 className="text-[1.75rem] font-bold tracking-tight">
            {t("hometalk.ui.greeting", { name: firstName })} <span aria-hidden>👋</span>
          </h1>
          <p className="text-sm text-[var(--wh-foreground-muted)]">
            {missionsLeft > 0 ? t("kids.lede.left", { count: missionsLeft }) : missionCount > 0 ? t("kids.lede.allDone") : school.encouragement || t("homeScreen.child.encouragement")}
          </p>
        </header>

        <GameCard progress={progress} t={t} />

        <CompanionCard
          key={active}
          householdId={householdId}
          name={companion?.name ?? null}
          coat={companion?.coat ?? "ginger"}
          lines={catLines}
          labels={{
            says: t("kids.cat.says", { name: "{name}" }),
            noName: t("kids.cat.noName"),
            nameMe: t("kids.cat.nameMe"),
            nameLede: t("kids.cat.nameLede"),
            nameField: t("kids.cat.nameField"),
            namePlaceholder: t("kids.cat.namePlaceholder"),
            save: t("kids.cat.save"),
            saving: t("kids.cat.saving"),
            rename: t("kids.cat.rename", { name: "{name}" }),
            another: t("kids.cat.another"),
            show: t("kids.cat.show"),
            colour: t("kids.cat.colour"),
            coats: Object.fromEntries(CAT_COATS.map((coat) => [coat, t(`kids.cat.coat.${coat}`)])) as Record<(typeof CAT_COATS)[number], string>,
          }}
        />

        <SegmentedControl
          label={t("homeScreen.child.view")}
          active={active}
          segments={[
            { key: "today", label: t("homeScreen.child.tab.today"), href: "/?tab=today", count: missionsLeft || undefined },
            { key: "school", label: t("homeScreen.child.tab.school"), href: "/?tab=school" },
            { key: "goals", label: t("homeScreen.child.tab.goals"), href: "/?tab=goals" },
            { key: "fun", label: t("homeScreen.child.tab.fun"), href: "/?tab=fun", count: fun.length || undefined },
          ]}
        />

        {active === "today" ? (
          <>
            <section id="missions" className="scroll-mt-20">
              <SectionHeader title={t("kids.today.missions")} count={missionCount || undefined} />
              {missionCount === 0 ? (
                <EmptyState icon={Star} tone="school" title={t("kids.today.noMissions")} description={t("kids.today.noMissionsLede")} />
              ) : (
                <div className="space-y-3">
                  {missionsLeft === 0 ? (
                    <Card className="wh-kid-card flex items-center gap-3 p-4 [--wh-kid-accent:var(--wh-handled)]">
                      <span aria-hidden className="text-3xl">🎉</span>
                      <div className="min-w-0">
                        <p className="font-bold">{t("kids.today.missionsDone")}</p>
                        <p className="text-sm text-[var(--wh-foreground-muted)]">{t("kids.today.missionsDoneLede")}</p>
                      </div>
                    </Card>
                  ) : null}
                  {missionGoals.map((standing) => (
                    <GoalCard key={standing.goal.id} standing={standing} householdId={householdId} childMemberId={memberId} t={t} labels={doneLabels(standing.goal.title, standing.goal.stars)} />
                  ))}
                  {[...school.today, ...doneToday].map((item) => (
                    <SchoolCard key={item.id} item={item} householdId={householdId} timezone={timezone} t={t} labels={doneLabels(item.title, 1)} />
                  ))}
                </div>
              )}
            </section>

            <EarnStars progress={progress} t={t} />

            <section>
              <SectionHeader title={t("kids.today.plans")} count={happeningToday.length || undefined} />
              {happeningToday.length === 0 ? (
                <p className="text-sm text-[var(--wh-foreground-muted)]">{t("kids.today.noPlans")}</p>
              ) : (
                <EventList events={happeningToday} timezone={timezone} t={t} />
              )}
            </section>

            {fun[0] && !happeningToday.includes(fun[0]) ? (
              <section>
                <SectionHeader title={t("kids.today.nextFun")} />
                <EventList events={[fun[0]]} timezone={timezone} t={t} />
              </section>
            ) : null}
          </>
        ) : null}

        {active === "school" ? (
          <>
            <section id="due-today" className="scroll-mt-20">
              <SectionHeader title={t("homeScreen.child.todaysHomework")} count={school.today.length || undefined} />
              {school.today.length === 0 && doneToday.length === 0 ? (
                <EmptyState icon={Star} tone="school" title={t("homeScreen.child.nothingDue")} description={t("homeScreen.child.nothingDueLede")} />
              ) : (
                <div className="space-y-3">
                  {[...school.today, ...doneToday].map((item) => (
                    <SchoolCard key={item.id} item={item} householdId={householdId} timezone={timezone} t={t} labels={doneLabels(item.title, 1)} />
                  ))}
                </div>
              )}
            </section>
            <section id="coming-up" className="scroll-mt-20">
              <SectionHeader title={t("homeScreen.child.comingUp")} count={school.soon.length || undefined} />
              {school.soon.length === 0 ? (
                <EmptyState icon={BookOpen} tone="school" title={t("homeScreen.child.caughtUp")} description={t("homeScreen.child.caughtUpLede")} />
              ) : (
                <div className="space-y-3">
                  {school.soon.map((item) => (
                    <SchoolCard key={item.id} item={item} householdId={householdId} timezone={timezone} t={t} labels={doneLabels(item.title, 1)} />
                  ))}
                </div>
              )}
            </section>
          </>
        ) : null}

        {active === "goals" ? (
          <>
            <EarnStars progress={progress} t={t} />
            <section id="goals" className="scroll-mt-20">
              <SectionHeader title={t("kids.goals.title")} count={progress.goals.length || undefined} />
              {progress.goals.length === 0 ? (
                <EmptyState icon={Target} tone="care" title={t("kids.goals.empty")} description={t("kids.goals.emptyLede")} />
              ) : (
                <div className="space-y-3">
                  {progress.goals.map((standing) => (
                    <GoalCard key={standing.goal.id} standing={standing} householdId={householdId} childMemberId={memberId} t={t} labels={doneLabels(standing.goal.title, standing.goal.stars)} />
                  ))}
                </div>
              )}
            </section>
            <Badges progress={progress} t={t} />
          </>
        ) : null}

        {active === "fun" ? (
          <section id="fun" className="scroll-mt-20">
            <SectionHeader title={t("homeScreen.child.funComingUp")} count={fun.length || undefined} />
            {fun.length === 0 ? (
              <EmptyState icon={PartyPopper} tone="people" title={t("homeScreen.child.nothingPlanned")} description={t("homeScreen.child.nothingPlannedLede")} />
            ) : (
              <EventList events={fun} timezone={timezone} t={t} />
            )}
          </section>
        ) : null}

        <Card className="wh-kid-card flex items-center gap-3 p-4 [--wh-kid-accent:var(--wh-tone-school)]">
          <Sparkles aria-hidden className="size-6 shrink-0 text-[var(--wh-tone-school)]" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{t("homeScreen.child.stuck")}</p>
            <p className="text-xs text-[var(--wh-foreground-muted)]">{t("homeScreen.child.stuckLede")}</p>
          </div>
        </Card>

        <QuoteCard>{t("homeScreen.child.quote")}</QuoteCard>
        <ScrollToSection key={active} />
      </div>
    </AppShell>
  );
}

/** Level, stars and streak — and, in words, where every star came from. */
function GameCard({ progress, t }: { progress: ChildProgress; t: Translate }) {
  const percent = Math.round((progress.intoLevel / progress.levelSize) * 100);
  return (
    <section aria-label={t("kids.hero.label")} className="wh-kid-hero wh-rise relative overflow-hidden rounded-[var(--wh-radius-lg)] p-5 shadow-[var(--wh-shadow-raised)]">
      <span aria-hidden className="pointer-events-none absolute -end-6 -top-8 text-[7rem] leading-none opacity-20">⭐</span>
      <div className="relative space-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Trophy aria-hidden className="size-6" />
          <p className="text-lg font-bold">{t("kids.hero.level", { level: progress.level, name: t(`kids.level.${progress.levelKey}`) })}</p>
        </div>
        <div>
          <div className="wh-kid-bar h-3 overflow-hidden rounded-full" role="progressbar" aria-valuemin={0} aria-valuemax={progress.levelSize} aria-valuenow={progress.intoLevel} aria-label={t("kids.hero.toNext", { count: progress.levelSize - progress.intoLevel, level: progress.level + 1 })}>
            <span className="block h-full rounded-full" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-1 text-xs font-medium opacity-90">{t("kids.hero.toNext", { count: progress.levelSize - progress.intoLevel, level: progress.level + 1 })}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-[var(--wh-radius)] bg-white/20 p-3">
            <p className="text-2xl font-extrabold">
              <span aria-hidden>⭐ </span>
              {progress.stars}
            </p>
            <p className="text-xs font-semibold">{t("kids.hero.stars", { count: progress.stars })}</p>
          </div>
          <div className="rounded-[var(--wh-radius)] bg-white/20 p-3">
            <p className="flex items-center gap-1 text-2xl font-extrabold">
              <Flame aria-hidden className="size-6" />
              {progress.streak}
            </p>
            <p className="text-xs font-semibold">{progress.streak > 0 ? t("kids.hero.streak", { count: progress.streak }) : t("kids.hero.noStreak")}</p>
          </div>
        </div>
        <p className="text-xs opacity-90">{t("kids.hero.where", { goals: progress.fromGoals, school: progress.fromSchool })}</p>
      </div>
    </section>
  );
}

/**
 * Ways to earn stars (08-018; the owner: "tell them clearly the list of
 * activities which can bring them stars"). The same rules `childProgress`
 * counts by, said plainly: each of their own goals with its stars, school
 * work at one star each, and what levels and streaks are made of.
 */
function EarnStars({ progress, t }: { progress: ChildProgress; t: Translate }) {
  const goals = progress.goals;
  return (
    <section aria-labelledby="earn-stars">
      <Card className="wh-kid-card p-4 [--wh-kid-accent:var(--wh-tone-meals)]">
        <h2 id="earn-stars" className="flex items-center gap-2 text-base font-bold">
          <span aria-hidden>⭐</span> {t("kids.earn.title")}
        </h2>
        <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{t("kids.earn.lede")}</p>
        <ul className="mt-3 space-y-2">
          {goals.map((standing) => (
            <li key={standing.goal.id} className="flex items-start gap-3 rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface)] p-2.5">
              <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[var(--wh-radius-sm)] bg-[var(--wh-tone-care-soft)] text-lg">
                {standing.goal.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold break-words">{standing.goal.title}</span>
                <span className="block text-xs text-[var(--wh-foreground-muted)]">
                  {standing.goal.period === "week"
                    ? t("kids.earn.goal.week", { count: standing.goal.stars, target: standing.goal.target })
                    : standing.goal.period === "once"
                      ? t("kids.earn.goal.once", { count: standing.goal.stars })
                      : t("kids.earn.goal.day", { count: standing.goal.stars })}
                </span>
              </span>
              <span className="shrink-0 text-sm font-bold">+{standing.goal.stars} ⭐</span>
            </li>
          ))}
          {goals.length === 0 ? (
            <li className="flex items-start gap-3 rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface)] p-2.5">
              <IconTile icon={Target} tone="care" size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{t("kids.earn.noGoals")}</span>
                <span className="block text-xs text-[var(--wh-foreground-muted)]">{t("kids.earn.noGoalsHow")}</span>
              </span>
            </li>
          ) : null}
          <li className="flex items-start gap-3 rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface)] p-2.5">
            <IconTile icon={BookOpen} tone="school" size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{t("kids.earn.school")}</span>
              <span className="block text-xs text-[var(--wh-foreground-muted)]">{t("kids.earn.schoolHow")}</span>
            </span>
            <span className="shrink-0 text-sm font-bold">+1 ⭐</span>
          </li>
        </ul>
        <ul className="mt-3 space-y-1 text-xs text-[var(--wh-foreground-muted)]">
          <li className="flex items-center gap-2">
            <Trophy aria-hidden className="size-4 shrink-0" /> {t("kids.earn.level", { count: STARS_PER_LEVEL })}
          </li>
          <li className="flex items-center gap-2">
            <Flame aria-hidden className="size-4 shrink-0" /> {t("kids.earn.streak")}
          </li>
        </ul>
      </Card>
    </section>
  );
}

function GoalCard({
  standing,
  householdId,
  childMemberId,
  t,
  labels,
}: {
  standing: GoalStanding;
  householdId: string;
  childMemberId: string;
  t: Translate;
  labels: { doIt: string; done: string; undo: string; earned: string };
}) {
  const { goal } = standing;
  const how =
    goal.source?.kind === "school_item"
      ? t("kids.goal.byWork")
      : goal.period === "week"
        ? t("kids.goal.weekly", { done: standing.done, target: standing.needed })
        : goal.period === "once"
          ? t("kids.goal.once")
          : t("kids.goal.daily");
  // A goal set from school work is met by marking that work done, never tapped on its own.
  const byWork = goal.source?.kind === "school_item";
  // A one-off goal already kept on an earlier day is done; there is nothing left to tap.
  const offerTap = !byWork && !(goal.period === "once" && standing.met && !standing.doneToday) && !(goal.period === "week" && standing.met && !standing.doneToday);
  return (
    <Card className="wh-kid-card p-4 [--wh-kid-accent:var(--wh-tone-care)]">
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-[var(--wh-radius)] bg-[var(--wh-tone-care-soft)] text-2xl">
          {goal.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold break-words">{goal.title}</p>
          <p className="text-xs text-[var(--wh-foreground-muted)]">
            {how} · {t("kids.goal.stars", { count: goal.stars })}
          </p>
          {goal.period === "week" ? (
            <p aria-hidden className="mt-1 flex gap-1">
              {Array.from({ length: standing.needed }, (_, index) => (
                <span key={index} className={index < standing.done ? "text-base" : "text-base opacity-25 grayscale"}>
                  ⭐
                </span>
              ))}
            </p>
          ) : null}
          {goal.reward ? (
            <p className="mt-1 text-xs font-semibold text-[var(--wh-tone-meals)]">
              {standing.met ? t("kids.goal.rewardEarned", { reward: goal.reward }) : t("kids.goal.reward", { reward: goal.reward })}
            </p>
          ) : null}
        </div>
        {offerTap ? (
          <KidDoneButton target={{ kind: "goal", householdId, goalId: goal.id, childMemberId }} done={standing.doneToday} stars={goal.stars} labels={labels} />
        ) : standing.met ? (
          <span className="shrink-0 rounded-full bg-[var(--wh-handled-soft)] px-3 py-1.5 text-xs font-bold text-[var(--wh-handled)]">{t("kids.goal.met")}</span>
        ) : null}
      </div>
    </Card>
  );
}

/**
 * One piece of school work. The row opens under its chevron (rule 21) to
 * everything on record about it — what kind of thing it is, the subject,
 * the teacher's note, when it is due and how long it may take — and the
 * Done button stays beside it, one tap, whether it is open or not.
 */
function SchoolCard({ item, householdId, timezone, t, labels }: { item: SchoolItem; householdId: string; timezone: string; t: Translate; labels: { doIt: string; done: string; undo: string; earned: string } }) {
  const done = item.status === "done" || item.status === "submitted";
  const zone = schoolDayZone(item, timezone);
  // Events and notices are things to know, not things to do: no button, which is itself the message.
  const doable = item.kind !== "event" && item.kind !== "notice";
  const meta = [
    item.subject,
    item.dueAt ? t("homeScreen.child.due", { date: formatDate(zone, item.dueAt, "long") }) : null,
    item.estimatedMinutes ? t("homeScreen.child.aboutMinutes", { count: item.estimatedMinutes }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const when = item.dueAt
    ? item.dueTimeKnown
      ? `${formatDate(zone, item.dueAt, "long")}, ${item.endsAt ? `${formatTime(timezone, item.dueAt)} – ${formatTime(timezone, item.endsAt)}` : formatTime(timezone, item.dueAt)}`
      : `${formatDate(zone, item.dueAt, "long")} · ${t("school.allDay")}`
    : t("school.noDueDate");
  const facts: { label: string; value: string }[] = [
    { label: t("kids.school.detail.kind"), value: t(`school.kind.${item.kind}`) },
    ...(item.subject ? [{ label: t("kids.school.detail.subject"), value: item.subject }] : []),
    { label: t("kids.school.detail.when"), value: when },
    ...(item.estimatedMinutes ? [{ label: t("kids.school.detail.time"), value: t("homeScreen.child.aboutMinutes", { count: item.estimatedMinutes }) }] : []),
    ...(doable ? [{ label: t("kids.school.detail.status"), value: done ? t("kids.school.detail.done") : t("kids.school.detail.toDo") }] : []),
  ];
  return (
    <Card className="wh-kid-card p-2 [--wh-kid-accent:var(--wh-tone-school)]">
      <div className="flex items-start gap-1">
        <ul className="min-w-0 flex-1">
          <ExpandableRow
            summary={
              <>
                <IconTile icon={item.kind === "event" ? CalendarHeart : BookOpen} tone="school" size="lg" />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold break-words">{item.title}</span>
                  {meta ? <span className="block text-xs text-[var(--wh-foreground-muted)]">{meta}</span> : null}
                  {doable && !done ? <span className="mt-1 block text-xs font-semibold text-[var(--wh-tone-meals)]">{t("kids.school.star")}</span> : null}
                </span>
              </>
            }
          >
            <dl className="space-y-1.5 text-sm">
              {facts.map((fact) => (
                <div key={fact.label} className="flex flex-wrap gap-x-2">
                  <dt className="text-[var(--wh-foreground-muted)]">{fact.label}</dt>
                  <dd className="font-medium break-words">{fact.value}</dd>
                </div>
              ))}
            </dl>
            {item.detail ? <p className="mt-2 text-sm break-words whitespace-pre-line">{item.detail}</p> : null}
          </ExpandableRow>
        </ul>
        {doable ? (
          <div className="shrink-0 pt-2.5 pe-1">
            <KidDoneButton target={{ kind: "school", householdId, id: item.id }} done={done} stars={1} labels={labels} />
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function Badges({ progress, t }: { progress: ChildProgress; t: Translate }) {
  const earned = progress.badges.filter((badge) => badge.earned).length;
  const icons: Record<string, string> = { first_star: "⭐", streak_3: "🔥", streak_7: "🚀", stars_50: "🌟", stars_100: "👑", goal_met: "🎯", school_10: "📚" };
  return (
    <section>
      <SectionHeader title={t("kids.badges.title")} />
      <p className="mb-2 text-sm text-[var(--wh-foreground-muted)]">{t("kids.badges.count", { earned, total: progress.badges.length })}</p>
      <ul className="grid grid-cols-2 gap-3">
        {progress.badges.map((badge) => (
          <li key={badge.key}>
            <Card className={badge.earned ? "wh-kid-card h-full p-3 [--wh-kid-accent:var(--wh-tone-meals)]" : "h-full p-3 opacity-70"}>
              <p aria-hidden className={badge.earned ? "text-3xl" : "text-3xl opacity-40 grayscale"}>
                {icons[badge.key]}
              </p>
              <p className="mt-1 text-sm font-bold">{t(`kids.badge.${badge.key}`)}</p>
              <p className="text-xs text-[var(--wh-foreground-muted)]">{badge.earned ? t("kids.badges.earned") : t(`kids.badge.${badge.key}.how`)}</p>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}

function EventList({ events, timezone, t }: { events: FamilyEvent[]; timezone: string; t: Translate }) {
  return (
    <Card className="wh-kid-card p-2 [--wh-kid-accent:var(--wh-tone-people)]">
      <ul className="divide-y divide-[var(--wh-border)]">
        {events.map((event) => (
          <CalendarItem
            key={event.id}
            title={event.title}
            kind={event.kind}
            day={formatDate(timezone, event.startsAt).split(" ")[0] ?? ""}
            month={formatDate(timezone, event.startsAt).split(" ")[1] ?? ""}
            when={eventWhen(event, timezone, t)}
            place={event.location}
            href={`/family/events/${event.id}`}
          />
        ))}
      </ul>
    </Card>
  );
}
