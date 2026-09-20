import { BookOpen, CalendarHeart, PartyPopper, Sparkles, Star, Target } from "lucide-react";

import { listEvents } from "@wonderhome/core/family/repository";
import { childSchoolView } from "@wonderhome/core/school/repository";
import type { SchoolItem } from "@wonderhome/core/school/items";
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
            Hi {firstName}! <span aria-hidden>👋</span>
          </h1>
          <p className="text-sm text-[var(--wh-foreground-muted)]">{school.encouragement || "You're doing great."}</p>
        </header>

        <SegmentedControl
          label="What to look at"
          active={active}
          segments={[
            { key: "today", label: "Today", href: "/?tab=today", count: school.today.length },
            { key: "homework", label: "Homework", href: "/?tab=homework", count: school.soon.length },
            { key: "goals", label: "Goals", href: "/?tab=goals" },
            { key: "fun", label: "Fun", href: "/?tab=fun", count: fun.length },
          ]}
        />

        {active === "today" ? (
          <section>
            <SectionHeader title="Today's homework" count={school.today.length} />
            {school.today.length === 0 ? (
              <EmptyState icon={Star} tone="school" title="Nothing due today" description="Nice. Enjoy the free time — or get ahead on what's coming." />
            ) : (
              <SchoolList items={school.today} timezone={timezone} />
            )}
          </section>
        ) : null}

        {active === "homework" ? (
          <section>
            <SectionHeader title="Coming up" count={school.soon.length} />
            {school.soon.length === 0 ? (
              <EmptyState icon={BookOpen} tone="school" title="All caught up" description="When school sets something new, it appears here." />
            ) : (
              <SchoolList items={school.soon} timezone={timezone} />
            )}
          </section>
        ) : null}

        {active === "goals" ? (
          <EmptyState
            icon={Target}
            tone="care"
            title="Goals are coming"
            description="Reading streaks and small goals you set with your parents will live here."
          />
        ) : null}

        {active === "fun" ? (
          <section>
            <SectionHeader title="Fun coming up" count={fun.length} />
            {fun.length === 0 ? (
              <EmptyState icon={PartyPopper} tone="people" title="Nothing planned yet" description="Ask the family to plan something — WonderHome can help find a time everyone is free." />
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
            <p className="text-sm font-semibold">Stuck on something?</p>
            <p className="text-xs text-[var(--wh-foreground-muted)]">Ask WonderHome to help plan your study time.</p>
          </div>
        </Card>

        <QuoteCard>You can do it. I&apos;m here to help anytime.</QuoteCard>
      </div>
    </AppShell>
  );
}

function SchoolList({ items, timezone }: { items: SchoolItem[]; timezone: string }) {
  return (
    <Card className="p-2">
      <ul className="divide-y divide-[var(--wh-border)]">
        {items.map((item) => (
          <ActionRow
            key={item.id}
            icon={item.kind === "event" ? CalendarHeart : BookOpen}
            tone="school"
            title={item.title}
            meta={[item.subject, item.dueAt ? `due ${formatDate(timezone, item.dueAt, "long")}` : null, item.estimatedMinutes ? `about ${item.estimatedMinutes} min` : null].filter(Boolean).join(" · ")}
            action={
              <PillLink href="/school" tone={item.status === "in_progress" ? "primary" : "soft"}>
                {item.status === "in_progress" ? "Continue" : "Start"}
              </PillLink>
            }
          />
        ))}
      </ul>
    </Card>
  );
}
