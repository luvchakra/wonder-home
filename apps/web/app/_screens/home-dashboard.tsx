import { AlertTriangle, CalendarHeart, CalendarOff, ChevronRight, CircleCheck, Heart, Sparkles, Sun } from "lucide-react";
import Link from "next/link";

import { listEvents } from "@wonderhome/core/family/repository";
import { assessSetup } from "@wonderhome/core/household/setup";
import { loadSetupFacts } from "@wonderhome/core/household/setup-repository";
import { listMembers, type HouseholdMember } from "@wonderhome/core/identity/households";
import { cn } from "@wonderhome/core/lib/cn";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Avatar, AvatarGroup } from "@wonderhome/core/ui/avatar";
import { CalendarItem } from "@wonderhome/core/ui/calendar-item";
import { Card } from "@wonderhome/core/ui/card";
import { DomainCard, DomainGrid } from "@wonderhome/core/ui/domain-card";
import { ExpandableRow } from "@wonderhome/core/ui/expandable-row";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { MetricGrid } from "@wonderhome/core/ui/metric-card";
import { AI_MODE_LABEL, HandledList } from "@wonderhome/core/ui/outcome-card";
import { Badge, PillLink } from "@wonderhome/core/ui/pill";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { SetupProgressCard } from "@wonderhome/core/ui/setup-progress";
import { ScriptAccent } from "@wonderhome/core/ui/script-accent";
import { EmptyState, LoadingState } from "@wonderhome/core/ui/states";
import { Suspense } from "react";

import { HomeIllustration } from "@wonderhome/core/ui/home-illustration";
import { NewEventForm } from "../_components/new-event-form";
import { cadenceLabel } from "../_lib/cadence";
import { describeRoles } from "../_lib/member-role";
import { householdAgenda } from "../_lib/agenda";
import { formatDate, formatTime, formatToday, greetingFor, type Session } from "../_lib/session";
import { DOMAIN_ICONS } from "../_lib/domain-icons";
import { iconForOutcome } from "../_lib/outcome-icons";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type ResponsibilityJoinRow = {
  outcome_key: string;
  primary_member_id: string | null;
  backup_member_id: string | null;
  ai_mode: "observe" | "prepare" | "approve" | "execute";
  playbook_items: { name: string; cadence: Record<string, unknown> | null } | { name: string; cadence: Record<string, unknown> | null }[] | null;
};

type HelperProfileRow = { member_id: string; engagement: "regular" | "occasional" | "service"; started_on: string | null };
type AvailabilityWindowRow = { member_id: string; day_of_week: number };
type AvailabilityExceptionRow = { member_id: string; on_date: string; available: boolean; reason: string | null };

const ENGAGEMENT_LABEL: Record<HelperProfileRow["engagement"], string> = {
  regular: "Regular help",
  occasional: "Occasional help",
  service: "Service",
};

function outcomeTitle(row: ResponsibilityJoinRow): string {
  const item = Array.isArray(row.playbook_items) ? row.playbook_items[0] : row.playbook_items;
  return item?.name ?? row.outcome_key.replace(/[._]/g, " ");
}

function memberStatusLabel(status: HouseholdMember["status"]): string {
  return status === "invited" ? "Invited, hasn't joined yet" : "Inactive";
}

function responsibilitiesFor(memberId: string, rows: readonly ResponsibilityJoinRow[]) {
  return {
    owned: rows.filter((row) => row.primary_member_id === memberId),
    backup: rows.filter((row) => row.backup_member_id === memberId),
  };
}

/** What a family member's row opens onto: what they own, and what they back up. */
function MemberActivities({ owned, backup }: { owned: readonly ResponsibilityJoinRow[]; backup: readonly ResponsibilityJoinRow[] }) {
  if (owned.length === 0 && backup.length === 0) {
    return <p className="text-xs text-[var(--wh-foreground-muted)]">No responsibilities assigned yet.</p>;
  }

  return (
    <div className="space-y-2">
      {owned.length > 0 ? (
        <ul className="space-y-1.5">
          {owned.map((row) => {
            const presentation = iconForOutcome(row.outcome_key);
            const item = Array.isArray(row.playbook_items) ? row.playbook_items[0] : row.playbook_items;
            const frequency = cadenceLabel(item?.cadence);
            return (
              <li key={row.outcome_key}>
                {/* Opens the same detail this outcome shows on its own
                    screen (rule 13 keeps this from becoming a second, partial
                    editor here) — never a dead end. */}
                <Link
                  href={`/household/responsibilities?outcome=${encodeURIComponent(row.outcome_key)}`}
                  className="flex items-center gap-2.5 rounded-[var(--wh-radius-sm)] py-0.5 transition-colors hover:bg-[var(--wh-surface-muted)]"
                >
                  <IconTile icon={presentation.icon} tone={presentation.tone} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium">{outcomeTitle(row)}</span>
                    <span className="block text-[0.6875rem] text-[var(--wh-foreground-subtle)]">
                      {AI_MODE_LABEL[row.ai_mode]}
                      {frequency ? ` · ${frequency}` : ""}
                    </span>
                  </span>
                  <ChevronRight aria-hidden className="size-3.5 shrink-0 text-[var(--wh-foreground-subtle)]" />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
      {backup.length > 0 ? (
        <p className="text-[0.6875rem] text-[var(--wh-foreground-subtle)]">
          Backs up:{" "}
          {backup.map((row, index) => (
            <span key={row.outcome_key}>
              {index > 0 ? ", " : ""}
              <Link
                href={`/household/responsibilities?outcome=${encodeURIComponent(row.outcome_key)}`}
                className="underline-offset-2 hover:underline"
              >
                {outcomeTitle(row)}
              </Link>
            </span>
          ))}
        </p>
      ) : null}
    </div>
  );
}

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
        <header className="wh-rise space-y-2">
          <div className="flex items-start justify-between gap-4">
            <h1 className="min-w-0 text-[1.625rem] font-bold tracking-tight text-balance sm:text-3xl">
              {greetingFor(timezone, now)}, {firstName}! <span aria-hidden className="wh-hand-wave">👋</span>
            </h1>
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
          </div>
          {/* Its own row, full width, rather than squeezed into a column
              beside the date pill — which is what was forcing this one
              short sentence onto three lines instead of one. */}
          <p className="text-sm text-[var(--wh-foreground-muted)]">A calmer home today, for a brighter tomorrow.</p>
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

  // Setup guidance is for the people who can act on it: Admins. Prominent
  // for their first week, one quiet row after, gone at 100%.
  const manages = view.permissions.includes("household.manage");

  const todayIso = now.toISOString().slice(0, 10);

  const [agenda, members, upcoming, setupFacts, responsibilityRows] = await Promise.all([
    householdAgenda(supabase, householdId, view),
    listMembers(supabase, householdId, membership.household.ownerMemberId).catch(() => []),
    listEvents(supabase, householdId, { from: now, to: new Date(now.getTime() + 14 * 86_400_000) }).catch(() => []),
    manages ? loadSetupFacts(supabase, membership.household).catch(() => null) : Promise.resolve(null),
    // The same join the Responsibilities and Househelper screens read, so
    // "3 responsibilities" here means the same three rows those screens show.
    (async (): Promise<ResponsibilityJoinRow[]> => {
      try {
        const { data } = await supabase
          .from("responsibilities")
          .select("outcome_key, primary_member_id, backup_member_id, ai_mode, playbook_items(name, cadence)")
          .eq("household_id", householdId);
        return (data as ResponsibilityJoinRow[] | null) ?? [];
      } catch {
        return [];
      }
    })(),
  ]);

  const setup = setupFacts ? assessSetup(setupFacts) : null;
  const responsibilities = responsibilityRows;

  const handledCount = Math.max(0, agenda.checked - agenda.needsYou.length);

  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const todayFocus = upcoming.filter((event) => event.startsAt <= endOfToday && event.status !== "cancelled").slice(0, 3);
  const nextMoment = upcoming.find((event) => event.protected || event.kind === "family_time" || event.kind === "outing") ?? upcoming[0] ?? null;

  const domainTiles = secondary.filter((item) => !["manage", "settings", "notifications", "certification"].includes(item.key));
  // Helpers have their own screen and their own relationship to the home;
  // "family status" means the family, and househelp is its own card below.
  const family = members.filter((member) => member.memberType !== "helper");
  const helpers = members.filter((member) => member.memberType === "helper");

  // Only fetched once there is a helper to say anything about — the same
  // three tables the Househelper screen reads, so "Expected today" here
  // means the same thing it means there.
  const [helperProfiles, helperWindows, helperExceptions] =
    helpers.length > 0
      ? await Promise.all([
          (async (): Promise<HelperProfileRow[]> => {
            try {
              const { data } = await supabase
                .from("helper_profiles")
                .select("member_id, engagement, started_on")
                .eq("household_id", householdId);
              return (data as HelperProfileRow[] | null) ?? [];
            } catch {
              return [];
            }
          })(),
          (async (): Promise<AvailabilityWindowRow[]> => {
            try {
              const { data } = await supabase
                .from("member_availability")
                .select("member_id, day_of_week")
                .eq("household_id", householdId);
              return (data as AvailabilityWindowRow[] | null) ?? [];
            } catch {
              return [];
            }
          })(),
          (async (): Promise<AvailabilityExceptionRow[]> => {
            try {
              const { data } = await supabase
                .from("availability_exceptions")
                .select("member_id, on_date, available, reason")
                .eq("household_id", householdId)
                .gte("on_date", todayIso)
                .order("on_date");
              return (data as AvailabilityExceptionRow[] | null) ?? [];
            } catch {
              return [];
            }
          })(),
        ])
      : ([[], [], []] as [HelperProfileRow[], AvailabilityWindowRow[], AvailabilityExceptionRow[]]);

  return (
    <>
      {/* One row with a chevron, whether it is somebody's first week or not:
          Home is where the household looks for what needs them today, and
          setup is a thing to go and finish rather than a block to read. */}
      {setup && !setup.complete ? <SetupProgressCard assessment={setup} variant="compact" /> : null}

      {/* Four counts, two to a row on a phone (rule 19). Every label is one
          word so it fits at half width — that is the test the `pairs`
          layout exists for, not a licence to squeeze. */}
      <MetricGrid
        pairs
        metrics={[
          { label: "Need you", value: agenda.needsYou.length, icon: AlertTriangle, tone: "attention", href: "/notifications" },
          { label: "Handled", value: handledCount, icon: CircleCheck, tone: "handled", href: "/today" },
          { label: "Upcoming", value: upcoming.length, icon: CalendarHeart, tone: "people", href: "/family" },
          { label: "Checked", value: agenda.checked, icon: Sparkles, tone: "ai", href: "/certification" },
        ]}
      />

      {family.length > 0 ? (
        <Card className="wh-rise p-2" style={{ "--wh-rise-delay": "30ms" } as React.CSSProperties}>
          <div className="mb-1 flex items-center justify-between gap-3 px-2 pt-2">
            <h2 className="text-base font-semibold tracking-tight">Family status</h2>
            <PillLink href="/family" tone="quiet">
              See all
            </PillLink>
          </div>
          {/* A row each, opening in place onto what that person owns and
              backs up — the same responsibilities the Responsibilities
              screen lists, read from here instead of a link the Family
              screen did not actually honour. */}
          <ul className="divide-y divide-[var(--wh-border)]">
            {family.map((member) => {
              const { owned, backup } = responsibilitiesFor(member.id, responsibilities);
              return (
                <ExpandableRow
                  key={member.id}
                  summary={
                    <>
                      <Avatar name={member.displayName} size="md" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{member.displayName}</span>
                        <span className="block text-xs text-[var(--wh-foreground-subtle)]">
                          {describeRoles(member.roles, member.isOwner)}
                          {member.status !== "active" ? ` · ${memberStatusLabel(member.status)}` : ""}
                          {owned.length > 0
                            ? ` · ${owned.length} ${owned.length === 1 ? "responsibility" : "responsibilities"}`
                            : ""}
                        </span>
                      </span>
                    </>
                  }
                >
                  <MemberActivities owned={owned} backup={backup} />
                </ExpandableRow>
              );
            })}
          </ul>
        </Card>
      ) : null}

      {/* Helpers below the family, and separate from it: they are part of
          how the home runs without being part of the family (the same
          separation the Family screen makes). */}
      {helpers.length > 0 ? (
        <Card className="wh-rise p-2" style={{ "--wh-rise-delay": "45ms" } as React.CSSProperties}>
          <div className="mb-1 flex items-center justify-between gap-3 px-2 pt-2">
            <h2 className="text-base font-semibold tracking-tight">Househelp</h2>
            <PillLink href="/househelper" tone="quiet">
              Manage
            </PillLink>
          </div>
          <ul className="divide-y divide-[var(--wh-border)]">
            {helpers.map((helper) => {
              const profile = helperProfiles.find((row) => row.member_id === helper.id);
              const windows = helperWindows.filter((row) => row.member_id === helper.id);
              const todayException = helperExceptions.find(
                (row) => row.member_id === helper.id && row.on_date === todayIso,
              );
              const expected = todayException ? todayException.available : windows.some((row) => row.day_of_week === now.getDay());
              const nextAbsence = helperExceptions.find(
                (row) => row.member_id === helper.id && !row.available && row.on_date > todayIso,
              );
              const { owned } = responsibilitiesFor(helper.id, responsibilities);
              return (
                <ExpandableRow
                  key={helper.id}
                  summary={
                    <>
                      <Avatar name={helper.displayName} size="md" badge="🤝" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{helper.displayName}</span>
                        <span className="block text-xs text-[var(--wh-foreground-subtle)]">
                          {profile ? ENGAGEMENT_LABEL[profile.engagement] : "Househelp"}
                          {profile?.started_on ? ` · since ${formatDate(timezone, new Date(profile.started_on))}` : ""}
                        </span>
                      </span>
                      <Badge tone={expected ? "handled" : "neutral"}>
                        {expected ? "Expected today" : todayException ? "Away today" : "Not today"}
                      </Badge>
                    </>
                  }
                >
                  <div className="space-y-2.5">
                    <div>
                      <p className="mb-1 text-[0.6875rem] font-semibold tracking-wide text-[var(--wh-foreground-subtle)] uppercase">
                        Usual days
                      </p>
                      <ul className="flex gap-1">
                        {DAYS.map((day, index) => {
                          const on = windows.some((row) => row.day_of_week === index);
                          return (
                            <li
                              key={day}
                              className={cn(
                                "grid size-7 place-items-center rounded-full text-[0.625rem] font-semibold",
                                on
                                  ? "bg-[var(--wh-primary)] text-[var(--wh-primary-foreground)]"
                                  : "bg-[var(--wh-surface-muted)] text-[var(--wh-foreground-subtle)]",
                              )}
                            >
                              {day.slice(0, 2)}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                    <div>
                      <p className="mb-1 text-[0.6875rem] font-semibold tracking-wide text-[var(--wh-foreground-subtle)] uppercase">
                        Looks after
                      </p>
                      {owned.length === 0 ? (
                        <p className="text-xs text-[var(--wh-foreground-muted)]">No responsibilities assigned yet.</p>
                      ) : (
                        <ul className="flex flex-wrap gap-1.5">
                          {owned.map((row) => (
                            <li
                              key={row.outcome_key}
                              className="rounded-[var(--wh-radius-pill)] bg-[var(--wh-surface-muted)] px-2.5 py-1 text-xs font-medium"
                            >
                              {outcomeTitle(row)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    {nextAbsence ? (
                      <p className="flex items-center gap-1.5 text-xs text-[var(--wh-foreground-muted)]">
                        <CalendarOff aria-hidden className="size-3.5 shrink-0" />
                        Away {formatDate(timezone, new Date(nextAbsence.on_date), "long")}
                        {nextAbsence.reason ? ` — ${nextAbsence.reason}` : ""}
                      </p>
                    ) : null}
                  </div>
                </ExpandableRow>
              );
            })}
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
              {/* The real form, here. This used to link to the Family
                  screen, which is not planning anything — it is moving the
                  person somewhere they then have to find it. */}
              <div className="mt-3 flex justify-center">
                <NewEventForm householdId={householdId} label="Plan something" />
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

