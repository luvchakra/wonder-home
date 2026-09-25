import { BookOpen, CalendarHeart, PartyPopper, Sparkles, Star, Target } from "lucide-react";

import { listEvents } from "@wonderhome/core/family/repository";
import type { Translate } from "@wonderhome/core/i18n/translate";
import { childSchoolView } from "@wonderhome/core/school/repository";
import type { SchoolItem } from "@wonderhome/core/school/items";
import { schoolDayZone } from "@wonderhome/core/school/times";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { ActionRow } from "@wonderhome/core/ui/action-row";
import { CalendarItem } from "@wonderhome/core/ui/calendar-item";
import { Card } from "@wonderhome/core/ui/card";
import { PillLink } from "@wonderhome/core/ui/pill";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { SegmentedControl } from "@wonderhome/core/ui/segmented-control";
import { EmptyState } from "@wonderhome/core/ui/states";

import { formatDate, formatTime, type Session } from "../_lib/session";

/**
 * The child view (requirements §15): "Hi Anaya!", with Today, Homework, Goals
 * and Fun. Age-appropriate by construction — this screen reads the child's
 * own school work and the family calendar and nothing else. Money,
 * administration and other people's conversations are not filtered out here;
 * they were never fetched.
 */
export async function ChildHome({ session, tab = "today" }: { session: Session; tab?: string }) {
  const { supabase, membership, view, viewer, secondary } = session;
  const { t } = session.locale;
  const householdId = membership.household.id;
  const timezone = membership.household.timezone;
  const now = new Date();
  const firstName = view.displayName.split(" ")[0] ?? view.displayName;

  const [school, events] = await Promise.all([
    childSchoolView(supabase, householdId, membership.memberId, now).catch(() => ({ today: [], soon: [], encouragement: "" })),
    listEvents(supabase, householdId, { from: now, to: new Date(now.getTime() + 14 * 86_400_000) }).catch(() => []),
  ]);

  const active = ["today", "homework", "goals", "fun"].includes(tab) ? tab : "today";
  const fun = events.filter((event) => event.kind === "outing" || event.kind === "family_time" || event.kind === "birthday");

  return (
    <AppShell active="home" viewer={viewer} secondary={secondary} pathname="/">
      <div className="space-y-5">
        <header className="wh-rise space-y-1">
          <h1 className="text-[1.75rem] font-bold tracking-tight">
            {t("hometalk.ui.greeting", { name: firstName })} <span aria-hidden>👋</span>
          </h1>
          <p className="text-sm text-[var(--wh-foreground-muted)]">{school.encouragement || t("homeScreen.child.encouragement")}</p>
        </header>

        <SegmentedControl
          label={t("homeScreen.child.view")}
          active={active}
          segments={[
            { key: "today", label: t("homeScreen.child.tab.today"), href: "/?tab=today", count: school.today.length },
            { key: "homework", label: t("homeScreen.child.tab.homework"), href: "/?tab=homework", count: school.soon.length },
            { key: "goals", label: t("homeScreen.child.tab.goals"), href: "/?tab=goals" },
            { key: "fun", label: t("homeScreen.child.tab.fun"), href: "/?tab=fun", count: fun.length },
          ]}
        />

        {active === "today" ? (
          <section>
            <SectionHeader title={t("homeScreen.child.todaysHomework")} count={school.today.length} />
            {school.today.length === 0 ? (
              <EmptyState icon={Star} tone="school" title={t("homeScreen.child.nothingDue")} description={t("homeScreen.child.nothingDueLede")} />
            ) : (
              <SchoolList items={school.today} timezone={timezone} t={t} />
            )}
          </section>
        ) : null}

        {active === "homework" ? (
          <section>
            <SectionHeader title={t("homeScreen.child.comingUp")} count={school.soon.length} />
            {school.soon.length === 0 ? (
              <EmptyState icon={BookOpen} tone="school" title={t("homeScreen.child.caughtUp")} description={t("homeScreen.child.caughtUpLede")} />
            ) : (
              <SchoolList items={school.soon} timezone={timezone} t={t} />
            )}
          </section>
        ) : null}

        {active === "goals" ? (
          <EmptyState
            icon={Target}
            tone="care"
            title={t("homeScreen.child.goalsComing")}
            description={t("homeScreen.child.goalsComingLede")}
          />
        ) : null}

        {active === "fun" ? (
          <section>
            <SectionHeader title={t("homeScreen.child.funComingUp")} count={fun.length} />
            {fun.length === 0 ? (
              <EmptyState icon={PartyPopper} tone="people" title={t("homeScreen.child.nothingPlanned")} description={t("homeScreen.child.nothingPlannedLede")} />
            ) : (
              <Card className="p-2">
                <ul className="divide-y divide-[var(--wh-border)]">
                  {fun.map((event) => (
                    <CalendarItem
                      key={event.id}
                      title={event.title}
                      kind={event.kind}
                      day={formatDate(timezone, event.startsAt).split(" ")[0] ?? ""}
                      month={formatDate(timezone, event.startsAt).split(" ")[1] ?? ""}
                      when={`${formatDate(timezone, event.startsAt, "long")} · ${formatTime(timezone, event.startsAt)}`}
                    />
                  ))}
                </ul>
              </Card>
            )}
          </section>
        ) : null}

        <Card className="flex items-center gap-3 bg-[var(--wh-tone-school-soft)]/60 p-4">
          <Sparkles aria-hidden className="size-6 shrink-0 text-[var(--wh-tone-school)]" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{t("homeScreen.child.stuck")}</p>
            <p className="text-xs text-[var(--wh-foreground-muted)]">{t("homeScreen.child.stuckLede")}</p>
          </div>
        </Card>

        <QuoteCard>{t("homeScreen.child.quote")}</QuoteCard>
      </div>
    </AppShell>
  );
}

function SchoolList({ items, timezone, t }: { items: SchoolItem[]; timezone: string; t: Translate }) {
  return (
    <Card className="p-2">
      <ul className="divide-y divide-[var(--wh-border)]">
        {items.map((item) => (
          <ActionRow
            key={item.id}
            icon={item.kind === "event" ? CalendarHeart : BookOpen}
            tone="school"
            title={item.title}
            meta={[item.subject, item.dueAt ? t("homeScreen.child.due", { date: formatDate(schoolDayZone(item, timezone), item.dueAt, "long") }) : null, item.estimatedMinutes ? t("homeScreen.child.aboutMinutes", { count: item.estimatedMinutes }) : null].filter(Boolean).join(" · ")}
            action={
              <PillLink href="/school" tone={item.status === "in_progress" ? "primary" : "soft"}>
                {item.status === "in_progress" ? t("homeScreen.child.continue") : t("homeScreen.child.start")}
              </PillLink>
            }
          />
        ))}
      </ul>
    </Card>
  );
}
