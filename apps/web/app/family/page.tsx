import { CalendarDays, CalendarHeart, Heart, Users } from "lucide-react";

import { may } from "@wonderhome/core/billing/repository";
import { describeCalendarHealth } from "@wonderhome/core/family/calendar-connector";
import { familyAgenda, listEvents } from "@wonderhome/core/family/repository";
import { EVENT_KINDS } from "@wonderhome/core/family/schedule";
import { isHouseholdAdmin, listMembers } from "@wonderhome/core/identity/households";
import { listIntegrations } from "@wonderhome/core/integrations/repository";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { ButtonLink } from "@wonderhome/core/ui/button";
import { CalendarItem } from "@wonderhome/core/ui/calendar-item";
import { Card } from "@wonderhome/core/ui/card";
import { PersonCard } from "@wonderhome/core/ui/person-card";
import { PillLink } from "@wonderhome/core/ui/pill";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { EmptyState } from "@wonderhome/core/ui/states";

import { ActionRow } from "@wonderhome/core/ui/action-row";

import { presentationFor } from "../_components/agenda-row";
import { FamilyNeedAction, SettleEventPill } from "../_components/family-need-action";
import { NewEventForm } from "../_components/new-event-form";
import { formatDate, formatTime, requireSession } from "../_lib/session";

export const metadata = { title: "Our Family" };
export const dynamic = "force-dynamic";

/**
 * Our Family (requirements §13): everyone, what each person is carrying, and
 * the time the family keeps for itself.
 */
export default async function FamilyPage() {
  const session = await requireSession("/family");
  const { supabase, membership, view, viewer, secondary } = session;
  const householdId = membership.household.id;
  const timezone = membership.household.timezone;
  const now = new Date();

  const [members, entitlement, integrations] = await Promise.all([
    listMembers(supabase, householdId, membership.household.ownerMemberId).catch(() => []),
    may(supabase, householdId, "family.events"),
    listIntegrations(supabase, householdId).catch(() => []),
  ]);

  // A stale calendar and a free afternoon must never look alike (17-002): if a
  // connected calendar is not working, the screen says so before the events.
  const calendarHealth =
    integrations
      .filter((integration) => integration.kind === "calendar")
      .map((integration) => describeCalendarHealth({ status: integration.status, lastSuccessAt: integration.lastSuccessAt, now }))
      .find((health) => health.tone !== "silent") ?? null;

  const [events, agenda] = entitlement.allowed
    ? await Promise.all([
        listEvents(supabase, householdId, { from: now }).catch(() => []),
        familyAgenda(supabase, householdId).catch(() => null),
      ])
    : [[], null];

  const familyMembers = members.filter((member) => member.memberType !== "helper");
  const helpers = members.filter((member) => member.memberType === "helper");
  const needs = agenda ? [...agenda.events, ...agenda.conflicts, ...agenda.gifts] : [];
  const moment = events.find((event) => event.protected) ?? events.find((event) => event.kind === "family_time" || event.kind === "outing") ?? null;
  const admin = isHouseholdAdmin(membership);
  const kinds = EVENT_KINDS.map((kind) => ({ value: kind, label: kind.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) }));

  return (
    <AppShell active="family" viewer={viewer} secondary={secondary} pathname="/family">
      <div className="space-y-6">
        <header className="wh-rise flex items-end justify-between gap-3">
          <div>
            <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">Our Family</h1>
            <p className="text-sm text-[var(--wh-foreground-muted)]">Everyone, together.</p>
          </div>
          {admin ? <PillLink href="/household/members" tone="quiet"><Users aria-hidden className="size-3.5" /> Invite member</PillLink> : null}
        </header>

        {calendarHealth ? (
          <Card className="flex items-start gap-3 p-4">
            <CalendarDays aria-hidden className="mt-0.5 size-5 shrink-0 text-[var(--wh-foreground-muted)]" />
            <div className="min-w-0 flex-1">
              <p className="text-sm">{calendarHealth.message}</p>
              {calendarHealth.tone === "needs_action" && admin ? (
                <div className="mt-2">
                  <PillLink href="/household/integrations" tone="primary">Fix the connection</PillLink>
                </div>
              ) : null}
            </div>
          </Card>
        ) : null}

        <section className="wh-rise" style={{ "--wh-rise-delay": "60ms" } as React.CSSProperties}>
          <SectionHeader title="Family members" count={familyMembers.length} action={admin ? <PillLink href="/household/members" tone="quiet">Manage</PillLink> : null} />
          {familyMembers.length === 0 ? (
            <EmptyState icon={Users} tone="people" title="Just you so far" description="Invite the family so everyone gets their own view of the home." action={admin ? <ButtonLink href="/household/members">Invite someone</ButtonLink> : null} />
          ) : (
            <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
              {familyMembers.map((member) => (
                <PersonCard
                  key={member.id}
                  name={member.displayName}
                  role={roleLabel(member)}
                  now={member.status === "invited" ? "Invited" : member.id === membership.memberId ? "You" : null}
                  badge={member.memberType === "child" ? "🧒" : undefined}
                  href={member.memberType === "child" && view.permissions.includes("school.manage") ? `/school?child=${member.id}` : undefined}
                />
              ))}
            </div>
          )}
        </section>

        {helpers.length > 0 ? (
          <section className="wh-rise" style={{ "--wh-rise-delay": "90ms" } as React.CSSProperties}>
            <SectionHeader title="Household help" count={helpers.length} />
            <p className="mb-2 text-sm text-[var(--wh-foreground-muted)]">
              Who keeps the home running day to day — not family, but part of how it works.
            </p>
            <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
              {helpers.map((member) => (
                <PersonCard
                  key={member.id}
                  name={member.displayName}
                  role={roleLabel(member)}
                  now={member.status === "invited" ? "Invited" : null}
                  badge="🤝"
                />
              ))}
            </div>
          </section>
        ) : null}

        {!entitlement.allowed ? (
          <EmptyState icon={CalendarHeart} tone="people" title="Family time is not part of this plan" description={entitlement.reason} />
        ) : (
          <>
            <section className="wh-rise" style={{ "--wh-rise-delay": "120ms" } as React.CSSProperties}>
              <SectionHeader title="Family moment" />
              {moment ? (
                <Card className="overflow-hidden p-0">
                  <div className="h-28 w-full" style={{ background: "var(--wh-gradient-sunset)" }} aria-hidden>
                    <div className="flex h-full items-end px-5 pb-3">
                      <Heart className="size-6 text-[var(--wh-tone-people)]" fill="currentColor" />
                    </div>
                  </div>
                  <div className="p-4">
                    <p className="text-base font-semibold">{moment.title}</p>
                    <p className="text-sm text-[var(--wh-foreground-muted)]">
                      {formatDate(timezone, moment.startsAt, "long")} · {formatTime(timezone, moment.startsAt)} – {formatTime(timezone, moment.endsAt)}
                    </p>
                    {moment.protected ? <p className="mt-2 text-xs font-medium text-[var(--wh-tone-people)]">Protected — nothing gets scheduled over this.</p> : null}
                  </div>
                </Card>
              ) : (
                <EmptyState icon={Heart} tone="people" title="Nothing protected yet" description="Keep an evening or a Sunday for the family. WonderHome plans everything else around it." />
              )}
            </section>

            {needs.length > 0 ? (
              <section>
                <SectionHeader title="Needs a reply" count={needs.length} />
                <Card className="p-2">
                  <ul className="divide-y divide-[var(--wh-border)]">
                    {needs.map((item) => {
                      const presentation = presentationFor(item.subjectKey);
                      return (
                        <ActionRow
                          key={item.subjectKey}
                          icon={presentation.icon}
                          tone={presentation.tone}
                          title={item.title}
                          meta={item.reason}
                          action={<FamilyNeedAction householdId={householdId} item={item} />}
                        />
                      );
                    })}
                  </ul>
                </Card>
              </section>
            ) : null}

            <section className="wh-rise" style={{ "--wh-rise-delay": "180ms" } as React.CSSProperties}>
              <SectionHeader title="Upcoming events" count={events.length} action={<NewEventForm householdId={householdId} kinds={kinds} />} />
              {events.length === 0 ? (
                <EmptyState icon={CalendarHeart} tone="people" title="Nothing coming up" description="Birthdays, outings, visits — add one and WonderHome will keep everyone free for it." />
              ) : (
                <Card className="p-2">
                  <ul className="divide-y divide-[var(--wh-border)]">
                    {events.slice(0, 8).map((event) => (
                      <CalendarItem
                        key={event.id}
                        title={event.title}
                        kind={event.kind}
                        protectedTime={event.protected}
                        day={formatDate(timezone, event.startsAt).split(" ")[0] ?? ""}
                        month={formatDate(timezone, event.startsAt).split(" ")[1] ?? ""}
                        when={`${formatDate(timezone, event.startsAt, "long")} · ${formatTime(timezone, event.startsAt)} – ${formatTime(timezone, event.endsAt)}`}
                        action={event.actionState === "needs_gift" ? <SettleEventPill householdId={householdId} eventId={event.id} label="Gift sorted" /> : undefined}
                      />
                    ))}
                  </ul>
                </Card>
              )}
            </section>
          </>
        )}

        <QuoteCard>A happy family is a well-managed adventure.</QuoteCard>
      </div>
    </AppShell>
  );
}

function roleLabel(member: { roles: readonly string[]; memberType: string; isOwner: boolean }): string {
  if (member.isOwner || member.roles.includes("head")) return "Head of Family";
  if (member.roles.includes("administrator")) return "Admin";
  if (member.memberType === "child") return "Child";
  if (member.memberType === "helper") return "Househelper";
  return "Adult";
}
