import { AlertTriangle, CalendarHeart, ChevronRight, CircleCheck, Heart, Sparkles, Sun } from "lucide-react";
import Link from "next/link";

import { listEvents } from "@wonderhome/core/family/repository";
import { assessSetup, setupWindow } from "@wonderhome/core/household/setup";
import { loadSetupFacts } from "@wonderhome/core/household/setup-repository";
import { listMembers } from "@wonderhome/core/identity/households";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Avatar, AvatarGroup } from "@wonderhome/core/ui/avatar";
import { CalendarItem } from "@wonderhome/core/ui/calendar-item";
import { Card } from "@wonderhome/core/ui/card";
import { DomainCard, DomainGrid } from "@wonderhome/core/ui/domain-card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { MetricGrid } from "@wonderhome/core/ui/metric-card";
import { HandledList } from "@wonderhome/core/ui/outcome-card";
import { Badge, PillLink } from "@wonderhome/core/ui/pill";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { SetupProgressCard } from "@wonderhome/core/ui/setup-progress";
import { ScriptAccent } from "@wonderhome/core/ui/script-accent";
import { EmptyState, LoadingState } from "@wonderhome/core/ui/states";
import { Suspense } from "react";

import { HomeIllustration } from "../_components/home-illustration";
import { householdAgenda } from "../_lib/agenda";
import { formatDate, formatTime, formatToday, greetingFor, type Session } from "../_lib/session";
import { DOMAIN_ICONS } from "../_lib/domain-icons";
import { iconForOutcome } from "../_lib/outcome-icons";

/**
 * Home: what actually matters right now (requirements §9).
 *
 * Needs You is only real actions from the domain engines. WonderHome Handled
 * is the count of what was checked and found fine — the silence that is the
 * product working. Neither is a task list, and nothing here asks anyone to
 * tick off normal household work.
 */
export function HomeDashboard({ session }: { session: Session }) {
  const { membership, view, viewer, secondary } = session;
  const timezone = membership.household.timezone;
  const now = new Date();
  const firstName = view.displayName.split(" ")[0] ?? view.displayName;

  // The greeting needs nothing from the database, so it is on screen in the
  // first flush; everything below it streams in as its queries return.
  return (
    <AppShell active="home" viewer={viewer} secondary={secondary} pathname="/">
      <div className="space-y-6">
        <header className="wh-rise flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <h1 className="text-[1.625rem] font-bold tracking-tight text-balance sm:text-3xl">
              {greetingFor(timezone, now)}, {firstName}! <span aria-hidden>👋</span>
            </h1>
            <p className="text-sm text-[var(--wh-foreground-muted)]">A calmer home today, for a brighter tomorrow.</p>
          </div>
          {/* The sheet puts the weather here. WonderHome has no weather
              provider, and a temperature nobody measured is exactly the
              invented number rule 9 forbids — so this says the true thing
              it does know, and goes somewhere useful. */}
          <Link
            href="/today"
            className="flex shrink-0 items-center gap-2 rounded-[var(--wh-radius-pill)] border border-[var(--wh-border)] bg-[var(--wh-surface)] py-2 pr-2 pl-3 shadow-[var(--wh-shadow-card)] transition-colors hover:bg-[var(--wh-surface-muted)]"
          >
            <Sun aria-hidden className="size-5 shrink-0 text-[var(--wh-tone-money)]" />
            <span className="min-w-0 text-left">
              <span className="block text-xs font-semibold">{formatToday(timezone, now)}</span>
              <span className="block text-[0.6875rem] text-[var(--wh-foreground-subtle)]">{view.householdName}</span>
            </span>
            <ChevronRight aria-hidden className="size-4 shrink-0 text-[var(--wh-foreground-subtle)]" />
          </Link>
        </header>

        <Suspense fallback={<LoadingState rows={4} label="Checking on the household" />}>
          <DashboardBody session={session} now={now} />
        </Suspense>
      </div>
    </AppShell>
  );
}

async function DashboardBody({ session, now }: { session: Session; now: Date }) {
  const { supabase, membership, view, secondary } = session;
  const householdId = membership.household.id;
  const timezone = membership.household.timezone;

  // Setup guidance is for the people who can act on it: the Head of Family
  // and administrators. Prominent for their first week, one quiet row after,
  // gone at 100%.
  const manages = view.permissions.includes("household.manage");

  const [agenda, members, upcoming, setupFacts] = await Promise.all([
    householdAgenda(supabase, householdId, view),
    listMembers(supabase, householdId, membership.household.ownerMemberId).catch(() => []),
    listEvents(supabase, householdId, { from: now, to: new Date(now.getTime() + 14 * 86_400_000) }).catch(() => []),
    manages ? loadSetupFacts(supabase, membership.household).catch(() => null) : Promise.resolve(null),
  ]);

  const setup = setupFacts ? assessSetup(setupFacts) : null;
  const week = setupWindow({ firstSeenAt: membership.firstSeenAt, adminSince: membership.adminSince, now });

  const handledCount = Math.max(0, agenda.checked - agenda.needsYou.length);

  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const todayFocus = upcoming.filter((event) => event.startsAt <= endOfToday && event.status !== "cancelled").slice(0, 3);
  const nextMoment = upcoming.find((event) => event.protected || event.kind === "family_time" || event.kind === "outing") ?? upcoming[0] ?? null;

  const domainTiles = secondary.filter((item) => !["manage", "settings", "notifications", "certification"].includes(item.key));
  // Helpers have their own screen and their own relationship to the home;
  // "your family" means the family.
  const family = members.filter((member) => member.memberType !== "helper");

  return (
    <>
      {setup && week.prominent ? (
        <SetupProgressCard assessment={setup} variant="prominent" daysLeft={week.daysLeft} />
      ) : setup && !setup.complete ? (
        <SetupProgressCard assessment={setup} variant="compact" />
      ) : null}

      {/* Four counts, two to a row on a phone (rule 19). Every label is one
          word so it fits at half width — that is the test the `pairs`
          layout exists for, not a licence to squeeze. */}
      <MetricGrid
        pairs
        metrics={[
          { label: "Need you", value: agenda.needsYou.length, icon: AlertTriangle, tone: "attention" },
          { label: "Handled", value: handledCount, icon: CircleCheck, tone: "handled" },
          { label: "Upcoming", value: upcoming.length, icon: CalendarHeart, tone: "people" },
          { label: "Checked", value: agenda.checked, icon: Sparkles, tone: "ai" },
        ]}
      />

      {family.length > 0 ? (
        <Card className="wh-rise p-4" style={{ "--wh-rise-delay": "30ms" } as React.CSSProperties}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold tracking-tight">Your family</h2>
            <PillLink href="/family" tone="quiet">
              See all
            </PillLink>
          </div>
          {/* A scroller rather than a grid: these are people, and a row of
              faces reads as a family in a way a two-column list does not.
              It is the one horizontal scroller on the screen, and rule 16's
              swipe yields to it. */}
          <ul className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {family.map((member) => (
              <li key={member.id} className="flex w-16 shrink-0 flex-col items-center gap-1.5 text-center">
                <Avatar name={member.displayName} size="lg" />
                <span className="text-xs leading-tight font-medium break-words">{member.displayName.split(" ")[0]}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {agenda.handled.length > 0 ? (
        <Card
          className="wh-rise border-[var(--wh-handled)]/25 bg-[var(--wh-handled-soft)]/50 p-4"
          style={{ "--wh-rise-delay": "60ms" } as React.CSSProperties}
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <Sparkles aria-hidden className="mt-0.5 size-5 shrink-0 text-[var(--wh-handled)]" />
              <div className="min-w-0">
                <h2 className="text-base font-semibold tracking-tight">WonderHome handled</h2>
                <p className="text-xs text-[var(--wh-foreground-muted)]">Here is what we have taken care of.</p>
              </div>
            </div>
            <PillLink href="/today" tone="quiet">
              View all
            </PillLink>
          </div>
          <HandledList items={agenda.handled.slice(0, 4)} />
        </Card>
      ) : null}

      {/* Today and the family moment: stacked on a phone, a pair from `sm`.
          Both are primary reading rather than shortcuts, so neither is ever
          half-width on a phone (rule 19). */}
      <section className="wh-rise grid gap-4 sm:grid-cols-2" style={{ "--wh-rise-delay": "120ms" } as React.CSSProperties}>
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <Sun aria-hidden className="size-5 shrink-0 text-[var(--wh-tone-money)]" />
              <h2 className="text-base font-semibold tracking-tight">Today&apos;s focus</h2>
            </div>
            <PillLink href="/today" tone="quiet">
              See all
            </PillLink>
          </div>
          {todayFocus.length === 0 && agenda.needsYou.length === 0 ? (
            <EmptyState
              icon={CircleCheck}
              tone="handled"
              title="A clear day"
              description="Nothing is waiting on you, and nothing important is left on the calendar today."
              className="py-6"
            />
          ) : (
            <ul className="space-y-2.5">
              {agenda.needsYou.slice(0, 2).map((item) => (
                <li key={item.subjectKey} className="flex items-center gap-3">
                  <IconTile icon={iconForOutcome(item.subjectKey).icon} tone={iconForOutcome(item.subjectKey).tone} size="sm" />
                  <span className="min-w-0 flex-1 text-sm">{item.title}</span>
                  <Badge tone={item.riskLevel === "high" ? "risk" : "attention"}>
                    {item.riskLevel === "high" ? "Urgent" : "Needs you"}
                  </Badge>
                </li>
              ))}
              {todayFocus.map((event) => (
                <li key={event.id} className="flex items-center gap-3">
                  <IconTile icon={CalendarHeart} tone="people" size="sm" />
                  <span className="min-w-0 flex-1 text-sm">{event.title}</span>
                  <Badge tone="neutral">{formatTime(timezone, event.startsAt)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="flex flex-col p-4">
          <div className="mb-3 flex items-center gap-2.5">
            <Heart aria-hidden className="size-5 shrink-0 text-[var(--wh-tone-people)]" />
            <h2 className="text-base font-semibold tracking-tight">Family moment</h2>
          </div>
          {nextMoment ? (
            <>
              <ul className="-mx-2">
                <CalendarItem
                  title={nextMoment.title}
                  kind={nextMoment.kind}
                  protectedTime={nextMoment.protected}
                  day={formatDate(timezone, nextMoment.startsAt).split(" ")[0] ?? ""}
                  month={formatDate(timezone, nextMoment.startsAt).split(" ")[1] ?? ""}
                  when={`${formatDate(timezone, nextMoment.startsAt, "long")} · ${formatTime(timezone, nextMoment.startsAt)}`}
                />
              </ul>
              <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                <AvatarGroup names={family.map((member) => member.displayName)} />
                <PillLink href="/family" tone="quiet">
                  Family
                </PillLink>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col">
              <HomeIllustration className="mx-auto w-full max-w-[13rem]" />
              <ScriptAccent className="mt-2 text-center text-lg">More moments like this.</ScriptAccent>
              <p className="mt-1 text-center text-xs text-[var(--wh-foreground-muted)]">
                Protect a slot for the family and WonderHome keeps everything else out of it.
              </p>
              <div className="mt-3 flex justify-center">
                <PillLink href="/family">Plan something</PillLink>
              </div>
            </div>
          )}
        </Card>
      </section>

      {domainTiles.length > 0 ? (
        <section className="wh-rise" style={{ "--wh-rise-delay": "180ms" } as React.CSSProperties}>
          <SectionHeader
            title="Your household"
            action={
              <PillLink href="/more" tone="quiet">
                Customise
              </PillLink>
            }
          />
          {/* DomainGrid is already two to a row on a phone — the shortcut
              grid rule 19 describes. */}
          <DomainGrid>
            {domainTiles.slice(0, 6).map((item) => {
              const domain = agenda.domains.find((entry) => entry.href === item.href);
              return (
                <DomainCard
                  key={item.key}
                  href={item.href}
                  icon={DOMAIN_ICONS[item.icon]}
                  tone={item.tone}
                  title={item.label}
                  description={item.purpose}
                  meta={domain ? (domain.needs.length > 0 ? `${domain.needs.length} need you` : domain.checked > 0 ? "All on track" : undefined) : undefined}
                />
              );
            })}
          </DomainGrid>
        </section>
      ) : null}

      <QuoteCard>Small steps today, happier tomorrows.</QuoteCard>
    </>
  );
}

