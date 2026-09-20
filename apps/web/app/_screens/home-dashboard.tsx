import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AlertTriangle,
  CalendarHeart,
  CircleCheck,
  Clock3,
  Sparkles,
  Sun,
  Users,
} from "lucide-react";

import { listEvents } from "@wonderhome/core/family/repository";
import { assessSetup, setupWindow } from "@wonderhome/core/household/setup";
import { loadSetupFacts } from "@wonderhome/core/household/setup-repository";
import { listMembers } from "@wonderhome/core/identity/households";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Avatar, AvatarGroup } from "@wonderhome/core/ui/avatar";
import { ButtonLink } from "@wonderhome/core/ui/button";
import { CalendarItem } from "@wonderhome/core/ui/calendar-item";
import { Card } from "@wonderhome/core/ui/card";
import { DomainCard, DomainGrid } from "@wonderhome/core/ui/domain-card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { MetricGrid } from "@wonderhome/core/ui/metric-card";
import { AI_MODE_LABEL, HandledList } from "@wonderhome/core/ui/outcome-card";
import { PillLink } from "@wonderhome/core/ui/pill";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { SetupProgressCard } from "@wonderhome/core/ui/setup-progress";
import { EmptyState, LoadingState } from "@wonderhome/core/ui/states";
import { Suspense } from "react";

import { AgendaRow } from "../_components/agenda-row";
import { householdAgenda } from "../_lib/agenda";
import { formatDate, formatTime, formatToday, greetingFor, type Session } from "../_lib/session";
import { describeRoles } from "../_lib/member-role";
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
          <div className="flex shrink-0 flex-col items-end rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 py-2 text-right shadow-[var(--wh-shadow-card)]">
            <Sun aria-hidden className="size-5 text-[var(--wh-tone-money)]" />
            <span className="mt-1 text-xs font-semibold">{formatToday(timezone, now)}</span>
            <span className="text-[0.6875rem] text-[var(--wh-foreground-subtle)]">{view.householdName}</span>
          </div>
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

  const [agenda, members, upcoming, setupFacts, responsibilityRows] = await Promise.all([
    householdAgenda(supabase, householdId, view),
    listMembers(supabase, householdId, membership.household.ownerMemberId).catch(() => []),
    listEvents(supabase, householdId, { from: now, to: new Date(now.getTime() + 14 * 86_400_000) }).catch(() => []),
    manages ? loadSetupFacts(supabase, membership.household).catch(() => null) : Promise.resolve(null),
    listResponsibilitySummaries(supabase, householdId),
  ]);

  const setup = setupFacts ? assessSetup(setupFacts) : null;
  const week = setupWindow({ firstSeenAt: membership.firstSeenAt, adminSince: membership.adminSince, now });

  const urgent = agenda.needsYou.filter((item) => item.riskLevel === "high").length;
  const handledCount = Math.max(0, agenda.checked - agenda.needsYou.length);

  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const todayFocus = upcoming.filter((event) => event.startsAt <= endOfToday && event.status !== "cancelled").slice(0, 3);
  const nextMoment = upcoming.find((event) => event.protected || event.kind === "family_time" || event.kind === "outing") ?? upcoming[0] ?? null;

  const domainTiles = secondary.filter((item) => !["manage", "settings", "notifications", "certification"].includes(item.key));
  const familyStatus = buildFamilyStatus(members, responsibilityRows);

  return (
    <>
        {setup && week.prominent ? (
          <SetupProgressCard assessment={setup} variant="prominent" daysLeft={week.daysLeft} />
        ) : setup && !setup.complete ? (
          <SetupProgressCard assessment={setup} variant="compact" />
        ) : null}

        <MetricGrid
          metrics={[
            { label: "Need attention", value: agenda.needsYou.length, icon: AlertTriangle, tone: "attention" },
            { label: "Handled quietly", value: handledCount, icon: CircleCheck, tone: "handled" },
            { label: "Urgent", value: urgent, icon: Clock3, tone: urgent > 0 ? "risk" : "neutral" },
            { label: "Checked today", value: agenda.checked, icon: Sparkles, tone: "ai" },
          ]}
        />

        {familyStatus.people.length > 0 ? (
          <section className="wh-rise" style={{ "--wh-rise-delay": "30ms" } as React.CSSProperties}>
            <SectionHeader
              title="Family status"
              action={<PillLink href="/household/responsibilities" tone="quiet">Responsibilities</PillLink>}
            />
            <p className="mb-2 text-sm text-[var(--wh-foreground-muted)]">
              Who is covering what, and what still needs someone.
            </p>
            <Card className="p-2">
              <ul className="divide-y divide-[var(--wh-border)]">
                {familyStatus.people.map((person) => (
                  <li key={person.memberId} className="space-y-3 px-2 py-5">
                    <div className="flex items-center gap-3">
                      <Avatar name={person.displayName} size="md" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{person.displayName}</p>
                        <p className="text-xs text-[var(--wh-foreground-subtle)]">{person.roleLabel}</p>
                      </div>
                    </div>
                    {person.owned.length === 0 ? (
                      <p className="pl-1 text-sm text-[var(--wh-foreground-subtle)]">Nothing assigned yet — on track by default, with nothing to watch.</p>
                    ) : (
                      <ul className="space-y-2.5 pl-1">
                        {person.owned.map((item) => (
                          <li key={item.key} className="flex items-center gap-3">
                            <IconTile icon={item.icon} tone={item.tone} size="sm" />
                            <div className="min-w-0">
                              <p className="text-sm">{item.title}</p>
                              <p className="text-[0.6875rem] font-medium text-[var(--wh-primary)]">{AI_MODE_LABEL[item.aiMode]}</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </Card>

            {familyStatus.unowned.length > 0 ? (
              <Card className="mt-2 flex items-center gap-3 bg-[var(--wh-attention-soft)]/60 p-4">
                <IconTile icon={AlertTriangle} tone="attention" size="sm" />
                <p className="text-sm text-[var(--wh-foreground-muted)]">
                  <span className="font-semibold text-[var(--wh-foreground)]">{familyStatus.unowned.length} outcome{familyStatus.unowned.length === 1 ? "" : "s"}</span>{" "}
                  {familyStatus.unowned.length === 1 ? "has" : "have"} nobody covering{" "}
                  {familyStatus.unowned.length === 1 ? "it" : "them"} — {familyStatus.unowned.map((item) => item.title).join(", ")}.
                </p>
              </Card>
            ) : null}
          </section>
        ) : null}

        <section className="wh-rise" style={{ "--wh-rise-delay": "60ms" } as React.CSSProperties}>
          <SectionHeader
            title="Needs you"
            count={agenda.needsYou.length}
            action={agenda.needsYou.length > 4 ? <PillLink href="/notifications" tone="quiet">View all</PillLink> : null}
          />
          {agenda.needsYou.length === 0 ? (
            <EmptyState
              icon={CircleCheck}
              tone="handled"
              title="Nothing is waiting on you"
              description={
                agenda.checked === 0
                  ? "Tell WonderHome about your home — a bill, a pet, a child's school — and it will start keeping watch."
                  : "Everything WonderHome checked is on track. It will say something the moment that changes."
              }
              action={agenda.checked === 0 ? <ButtonLink href="/ai">Tell WonderHome about your home</ButtonLink> : null}
            />
          ) : (
            <Card className="p-2">
              <ul className="divide-y divide-[var(--wh-border)]">
                {agenda.needsYou.slice(0, 4).map((item) => (
                  <AgendaRow key={item.subjectKey} item={item} />
                ))}
              </ul>
            </Card>
          )}
        </section>

        {agenda.handled.length > 0 ? (
          <section className="wh-rise" style={{ "--wh-rise-delay": "120ms" } as React.CSSProperties}>
            <SectionHeader title="WonderHome handled" />
            <HandledList items={agenda.handled} />
          </section>
        ) : null}

        <section className="wh-rise grid gap-4 sm:grid-cols-2" style={{ "--wh-rise-delay": "180ms" } as React.CSSProperties}>
          <div>
            <SectionHeader title="Family moment" action={<PillLink href="/family" tone="quiet">Family</PillLink>} />
            {nextMoment ? (
              <Card className="p-2">
                <ul>
                  <CalendarItem
                    title={nextMoment.title}
                    kind={nextMoment.kind}
                    protectedTime={nextMoment.protected}
                    day={formatDate(timezone, nextMoment.startsAt).split(" ")[0] ?? ""}
                    month={formatDate(timezone, nextMoment.startsAt).split(" ")[1] ?? ""}
                    when={`${formatDate(timezone, nextMoment.startsAt, "long")} · ${formatTime(timezone, nextMoment.startsAt)} – ${formatTime(timezone, nextMoment.endsAt)}`}
                  />
                </ul>
                <div className="flex items-center justify-between px-2 pt-1 pb-1">
                  <AvatarGroup names={members.filter((member) => member.memberType !== "helper").map((member) => member.displayName)} />
                  <span className="text-[0.6875rem] text-[var(--wh-foreground-subtle)]">Everyone together</span>
                </div>
              </Card>
            ) : (
              <EmptyState
                icon={CalendarHeart}
                tone="people"
                title="No family time planned yet"
                description="Protect a slot for the family and WonderHome will keep everything else out of it."
                action={<PillLink href="/family">Plan something</PillLink>}
                className="py-6"
              />
            )}
          </div>

          <div>
            <SectionHeader title="Today's focus" action={<PillLink href="/today" tone="quiet">Today</PillLink>} />
            {todayFocus.length === 0 ? (
              <EmptyState
                icon={Users}
                title="A clear day"
                description="Nothing important is on the family calendar for the rest of today."
                className="py-6"
              />
            ) : (
              <Card className="p-2">
                <ul className="divide-y divide-[var(--wh-border)]">
                  {todayFocus.map((event) => (
                    <CalendarItem
                      key={event.id}
                      title={event.title}
                      kind={event.kind}
                      protectedTime={event.protected}
                      day={formatDate(timezone, event.startsAt).split(" ")[0] ?? ""}
                      month={formatDate(timezone, event.startsAt).split(" ")[1] ?? ""}
                      when={`${formatTime(timezone, event.startsAt)} – ${formatTime(timezone, event.endsAt)}`}
                    />
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </section>

        {domainTiles.length > 0 ? (
          <section className="wh-rise" style={{ "--wh-rise-delay": "240ms" } as React.CSSProperties}>
            <SectionHeader title="Your household" action={<PillLink href="/more" tone="quiet">All</PillLink>} />
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

type ResponsibilityRow = {
  outcome_key: string;
  primary_member_id: string | null;
  ai_mode: "observe" | "prepare" | "approve" | "execute";
  playbook_items: { name: string } | { name: string }[] | null;
};

async function listResponsibilitySummaries(supabase: SupabaseClient, householdId: string): Promise<ResponsibilityRow[]> {
  try {
    const { data, error } = await supabase
      .from("responsibilities")
      .select("outcome_key, primary_member_id, ai_mode, playbook_items(name)")
      .eq("household_id", householdId);
    if (error) return [];
    return (data as ResponsibilityRow[] | null) ?? [];
  } catch {
    return [];
  }
}

type FamilyStatusItem = ReturnType<typeof iconForOutcome> & { key: string; title: string; aiMode: ResponsibilityRow["ai_mode"] };

/**
 * Ownership-based, on purpose: who owns what is real, already-tracked data.
 * Nobody covering an outcome is a genuine gap; whether a covered one is
 * currently at risk lives in each domain's own agenda, not here, so this
 * never guesses at somebody's live status from data that isn't attached to
 * them.
 */
function buildFamilyStatus(
  members: { id: string; displayName: string; roles: readonly string[]; isOwner: boolean }[],
  rows: readonly ResponsibilityRow[],
): { people: { memberId: string; displayName: string; roleLabel: string; owned: FamilyStatusItem[] }[]; unowned: FamilyStatusItem[] } {
  const byMember = new Map<string, FamilyStatusItem[]>();
  const unowned: FamilyStatusItem[] = [];

  for (const row of rows) {
    const item = Array.isArray(row.playbook_items) ? row.playbook_items[0] : row.playbook_items;
    const entry: FamilyStatusItem = {
      key: row.outcome_key,
      title: item?.name ?? row.outcome_key.replace(/[._]/g, " "),
      aiMode: row.ai_mode,
      ...iconForOutcome(row.outcome_key),
    };
    if (row.primary_member_id) {
      const list = byMember.get(row.primary_member_id) ?? [];
      list.push(entry);
      byMember.set(row.primary_member_id, list);
    } else {
      unowned.push(entry);
    }
  }

  const people = members.map((member) => ({
    memberId: member.id,
    displayName: member.displayName,
    roleLabel: describeRoles(member.roles, member.isOwner),
    owned: byMember.get(member.id) ?? [],
  }));

  return { people, unowned };
}
