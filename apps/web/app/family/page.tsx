import { CalendarDays, CalendarHeart, GraduationCap, HandHeart, Heart, PawPrint, Sun, UserPlus, Users } from "lucide-react";

import { may } from "@wonderhome/core/billing/repository";
import { describeCalendarHealth } from "@wonderhome/core/family/calendar-connector";
import { familyAgenda, listEvents } from "@wonderhome/core/family/repository";
import { EVENT_KINDS } from "@wonderhome/core/family/schedule";
import { listPets } from "@wonderhome/core/home/repository";
import { isHouseholdAdmin, listMembers } from "@wonderhome/core/identity/households";
import { listIntegrations } from "@wonderhome/core/integrations/repository";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Avatar } from "@wonderhome/core/ui/avatar";
import { ButtonLink } from "@wonderhome/core/ui/button";
import { CalendarItem } from "@wonderhome/core/ui/calendar-item";
import { Card } from "@wonderhome/core/ui/card";
import { ExpandableRow } from "@wonderhome/core/ui/expandable-row";
import { HomeIllustration } from "@wonderhome/core/ui/home-illustration";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { PillLink } from "@wonderhome/core/ui/pill";
import { ScriptAccent } from "@wonderhome/core/ui/script-accent";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { EmptyState } from "@wonderhome/core/ui/states";

import { ActionRow } from "@wonderhome/core/ui/action-row";

import { presentationFor } from "../_components/agenda-row";
import { FamilyNeedAction, SettleEventPill } from "../_components/family-need-action";
import { MemberDetail } from "../_components/member-detail";
import { NewEventForm } from "../_components/new-event-form";
import { PetDetail } from "../_components/pet-detail";
import { describeRoles } from "../_lib/member-role";
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

  const [members, entitlement, integrations, pets] = await Promise.all([
    listMembers(supabase, householdId, membership.household.ownerMemberId).catch(() => []),
    may(supabase, householdId, "family.events"),
    listIntegrations(supabase, householdId).catch(() => []),
    listPets(supabase, householdId).catch(() => []),
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
        <header className="wh-rise relative flex items-start justify-between gap-3 overflow-hidden">
          <div className="min-w-0">
            <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">Our Family</h1>
            <p className="text-sm text-[var(--wh-foreground-muted)]">Everyone, together.</p>
          </div>
          {/* Decoration only — every fact on this screen is still said in
              words below, never only in the picture (rule 8). */}
          <HomeIllustration className="w-24 shrink-0 sm:w-36" />
        </header>

        <Card className="wh-rise flex items-center gap-3 bg-[var(--wh-handled-soft)] p-4" style={{ "--wh-rise-delay": "30ms" } as React.CSSProperties}>
          <IconTile icon={Sun} tone="money" />
          <p className="min-w-0 flex-1 text-sm font-semibold">A happier home starts with all of us!</p>
          {/* The one handwritten line this screen gets (rule 2) — the
              closing note lives here instead of a second script accent
              further down the page. */}
          <ScriptAccent tone="primary" size="sm" heart tilt={false} className="hidden max-w-[9rem] text-right sm:block">
            Together Brighter Days!
          </ScriptAccent>
        </Card>

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
          <SectionHeader
            title="Family members"
            count={familyMembers.length}
            action={
              admin ? (
                <div className="flex gap-2">
                  <PillLink href="/household/members" tone="quiet">
                    Manage
                  </PillLink>
                  <PillLink href="/household/members" tone="primary">
                    <Users aria-hidden className="size-3.5" /> Invite member
                  </PillLink>
                </div>
              ) : null
            }
          />
          {familyMembers.length === 0 ? (
            <EmptyState icon={Users} tone="people" title="Just you so far" description="Invite the family so everyone gets their own view of the home." action={admin ? <ButtonLink href="/household/members">Invite someone</ButtonLink> : null} />
          ) : (
            // Full-width rows that open in place (rule 15, rule 19: primary
            // information is never squeezed into a half-width card) — the
            // one thing a person came to this screen for.
            <Card className="p-2">
              <ul className="divide-y divide-[var(--wh-border)]">
                {familyMembers.map((member) => (
                  <ExpandableRow
                    key={member.id}
                    summary={
                      <>
                        <Avatar name={member.displayName} size="md" imageUrl={member.avatarUrl} badge={member.memberType === "child" ? "🧒" : member.isOwner || member.roles.includes("head") ? "👑" : undefined} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">{member.displayName}</span>
                          <span className="block text-xs text-[var(--wh-foreground-subtle)]">
                            {describeRoles(member.roles, member.isOwner)}
                            {member.status === "invited" ? " · Invited" : member.id === membership.memberId ? " · You" : ""}
                          </span>
                        </span>
                      </>
                    }
                  >
                    <div className="space-y-3">
                      <MemberDetail
                        member={member}
                        allMembers={familyMembers}
                        timezone={timezone}
                        editable={admin || member.id === membership.memberId}
                        householdId={householdId}
                        currentMemberId={membership.memberId}
                        statusLabel={member.status === "invited" ? "Invited, hasn't joined yet" : member.status === "inactive" ? "Inactive" : null}
                      />
                      {member.memberType === "child" && view.permissions.includes("school.manage") ? (
                        <PillLink href={`/school?child=${member.id}`} tone="quiet">
                          <GraduationCap aria-hidden className="size-3.5" /> View school
                        </PillLink>
                      ) : null}
                    </div>
                  </ExpandableRow>
                ))}
              </ul>
            </Card>
          )}
        </section>

        {pets.length > 0 || admin ? (
          <section className="wh-rise" style={{ "--wh-rise-delay": "75ms" } as React.CSSProperties}>
            <SectionHeader
              title="Pets"
              count={pets.length}
              action={admin ? <PillLink href="/household/members" tone="quiet"><PawPrint aria-hidden className="size-3.5" /> Add pet</PillLink> : null}
            />
            {pets.length === 0 ? (
              <EmptyState icon={PawPrint} tone="care" title="No pets yet" description="Add a pet and WonderHome tracks their care alongside everyone else's." action={admin ? <ButtonLink href="/household/members">Add a pet</ButtonLink> : null} />
            ) : (
              <Card className="p-2">
                <ul className="divide-y divide-[var(--wh-border)]">
                  {pets.map((pet) => (
                    <ExpandableRow
                      key={pet.id}
                      summary={
                        <>
                          <IconTile icon={PawPrint} tone="care" size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">{pet.name}</span>
                            <span className="block text-xs text-[var(--wh-foreground-subtle)]">
                              {pet.species}
                              {pet.active === false ? " · Retired" : ""}
                            </span>
                          </span>
                        </>
                      }
                    >
                      <PetDetail pet={pet} timezone={timezone} editable={admin} householdId={householdId} />
                    </ExpandableRow>
                  ))}
                </ul>
              </Card>
            )}
          </section>
        ) : null}

        {helpers.length > 0 || admin ? (
          <section className="wh-rise" style={{ "--wh-rise-delay": "90ms" } as React.CSSProperties}>
            <SectionHeader
              title="Household help"
              count={helpers.length}
              action={admin ? <PillLink href="/household/members" tone="quiet"><UserPlus aria-hidden className="size-3.5" /> Add helper</PillLink> : null}
            />
            <p className="mb-2 text-sm text-[var(--wh-foreground-muted)]">
              Who keeps the home running day to day — not family, but part of how it works.
            </p>
            {helpers.length === 0 ? (
              <EmptyState icon={Users} tone="people" title="No househelp yet" description="Add the people who help at home, so WonderHome can coordinate around them too." />
            ) : (
              <Card className="p-2">
                <ul className="divide-y divide-[var(--wh-border)]">
                  {helpers.map((member) => (
                    <ExpandableRow
                      key={member.id}
                      summary={
                        <>
                          <IconTile icon={HandHeart} tone="people" size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">{member.displayName}</span>
                            <span className="block text-xs text-[var(--wh-foreground-subtle)]">
                              {member.status === "invited" ? "Invited · Househelper" : "Househelper"}
                            </span>
                          </span>
                        </>
                      }
                    >
                      <div className="space-y-3">
                        <MemberDetail
                          member={member}
                          allMembers={helpers}
                          timezone={timezone}
                          editable={admin || member.id === membership.memberId}
                          householdId={householdId}
                          currentMemberId={membership.memberId}
                          statusLabel={member.status === "invited" ? "Invited, hasn't joined yet" : member.status === "inactive" ? "Inactive" : null}
                        />
                        <PillLink href="/househelper" tone="quiet">
                          Full househelp profile
                        </PillLink>
                      </div>
                    </ExpandableRow>
                  ))}
                </ul>
              </Card>
            )}
          </section>
        ) : null}

        {!entitlement.allowed ? (
          <EmptyState icon={CalendarHeart} tone="people" title="Family time is not part of this plan" description={entitlement.reason} />
        ) : (
          <>
            <section className="wh-rise" style={{ "--wh-rise-delay": "120ms" } as React.CSSProperties}>
              {moment ? (
                // Not a link: nothing on this screen goes deeper than what
                // is already said here, and a chevron with nowhere to go
                // would be exactly the dead control rule 10 forbids.
                <div className="flex items-start gap-3 rounded-[var(--wh-radius)] bg-[var(--wh-tone-people-soft)] p-4">
                  <IconTile icon={Heart} tone="people" />
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold">Family moment</p>
                    <p className="text-sm text-[var(--wh-foreground-muted)]">{moment.title}</p>
                    <p className="mt-1 text-xs text-[var(--wh-foreground-subtle)]">
                      {formatDate(timezone, moment.startsAt, "long")} · {formatTime(timezone, moment.startsAt)} – {formatTime(timezone, moment.endsAt)}
                    </p>
                    {moment.protected ? (
                      <p className="mt-2 text-xs font-medium text-[var(--wh-tone-people)]">Protected — nothing gets scheduled over this.</p>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="rounded-[var(--wh-radius)] bg-[var(--wh-tone-people-soft)] p-4">
                  <div className="flex items-start gap-3">
                    <IconTile icon={Heart} tone="people" />
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-semibold">Family moment</p>
                      <p className="text-sm text-[var(--wh-foreground-muted)]">Small moments. A happier home.</p>
                    </div>
                  </div>
                  <p className="mt-3 rounded-[var(--wh-radius-pill)] bg-[var(--wh-surface)]/70 px-3 py-2 text-center text-sm text-[var(--wh-tone-people)] italic">
                    &ldquo;Keep an evening for the family — WonderHome plans everything else around it.&rdquo;
                  </p>
                </div>
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
      </div>
    </AppShell>
  );
}
