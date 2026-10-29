import { CalendarDays, CalendarHeart, GraduationCap, HandHeart, Heart, MapPin, MessageCircle, MessagesSquare, PawPrint, Sun, UserPlus, Users } from "lucide-react";
import Link from "next/link";

import { may } from "@wonderhome/core/billing/repository";
import { describeCalendarHealth } from "@wonderhome/core/family/calendar-connector";
import { familyAgenda } from "@wonderhome/core/family/repository";
import { isFamilyMoment } from "@wonderhome/core/family/schedule";
import { listPets } from "@wonderhome/core/home/repository";
import { platformMailConfig } from "@wonderhome/core/email/mailer";
import { isHouseholdAdmin, listMembers } from "@wonderhome/core/identity/households";
import { listInvitations } from "@wonderhome/core/identity/invitations";
import { listGuardianLinks, listRelationships, suggestRelationships } from "@wonderhome/core/identity/relationships";
import { readMemberEmails } from "@wonderhome/core/identity/member-email";
import { readMemberPhones } from "@wonderhome/core/identity/member-phone";
import { listIntegrations } from "@wonderhome/core/integrations/repository";
import { agoText, isFresh, loadKnownPlaces, loadLocations, mapLink, placeAt } from "@wonderhome/core/location/sharing";
import { listEnrolments } from "@wonderhome/core/school/enrolments";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Avatar } from "@wonderhome/core/ui/avatar";
import { ButtonLink } from "@wonderhome/core/ui/button";
import { CalendarItem } from "@wonderhome/core/ui/calendar-item";
import { Card } from "@wonderhome/core/ui/card";
import { CollapsibleSection } from "@wonderhome/core/ui/collapsible-section";
import { ExpandableRow } from "@wonderhome/core/ui/expandable-row";
import { HomeIllustration } from "@wonderhome/core/ui/home-illustration";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Badge, PillLink } from "@wonderhome/core/ui/pill";
import { ScriptAccent } from "@wonderhome/core/ui/script-accent";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { EmptyState } from "@wonderhome/core/ui/states";

import { ActionRow } from "@wonderhome/core/ui/action-row";

import { presentationFor } from "../_components/agenda-row";
import { FamilyNeedAction, SettleEventPill, type FamilyNeedLabels } from "../_components/family-need-action";
import { listWorkPlaces } from "@wonderhome/core/household/work-place";
import { MemberDetail } from "../_components/member-detail";
import { PetDetail } from "../_components/pet-detail";
import { readHelperAvailability, readResponsibilities, responsibilitiesFor } from "../_lib/family-reads";
import { eventGoing, eventWhen } from "../_lib/event-when";
import { describeRoles } from "../_lib/member-role";
import { describeRelationships, describeSuggestions, relationsLine, relationshipWords } from "../_lib/relationship-words";
import { memberFormLabels, pendingInvitationLabels } from "../_lib/member-form-labels";
import { AddChildForm } from "../_components/add-child-form";
import { AddHelperForm } from "../_components/add-helper-form";
import { AddPetForm } from "../_components/add-pet-form";
import { OpenOnHash } from "../_components/open-on-hash";
import { InviteMemberForm } from "../_components/invite-member-form";
import { PendingInvitations } from "../_components/pending-invitations";
import { RemoveMemberControl } from "../_components/remove-member-control";
import { RelationshipsCard } from "./relationships";
import { formatDate, formatTime, requireSession } from "../_lib/session";
import { MemberRoleControl } from "../_components/member-role-control";
import { ChildQuietControl } from "../_components/child-quiet-control";
import { LocationAudienceChoice } from "../_components/location-audience-choice";
import { LocationSharingToggle } from "../_components/location-sharing-toggle";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { childQuietHours } from "@wonderhome/core/notifications/child-quiet";
import { atLocal, localMoment } from "@wonderhome/core/notifications/timing";

export const metadata = { title: "Our Family" };

/** A row's own icon control: a 36px target with its name for assistive technology (rule 11). */
const ICON_LINK =
  "grid size-9 shrink-0 place-items-center rounded-full text-[var(--wh-foreground-muted)] transition-colors hover:bg-[var(--wh-surface-muted)] hover:text-[var(--wh-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]";

export const dynamic = "force-dynamic";

/**
 * Our Family (requirements §13): everyone, what each person is carrying, and
 * the time the family keeps for itself.
 *
 * It is also the one place a person is managed (design/UI-SIMPLIFICATION-v1.md
 * M3): each person opens to their role and Remove, how the family is related
 * sits below them, and an Admin adds someone at the foot of the page — what
 * Members & roles held before it was folded in here.
 */
export default async function FamilyPage() {
  const session = await requireSession("/family");
  const { supabase, membership, view, viewer, secondary, locale } = session;
  const { t } = locale;
  const householdId = membership.household.id;
  const timezone = membership.household.timezone;
  const now = new Date();

  const [members, entitlement, familyRead, integrations, pets, enrolments, emails, offices, phones, relationships, whereabouts, knownPlaces, responsibilityRows, helperReads] = await Promise.all([
    listMembers(supabase, householdId, membership.household.ownerMemberId).catch(() => []),
    may(supabase, householdId, "family.events"),
    // Every upcoming event and what needs a person, read once and alongside
    // the plan check; shown only when the plan includes family events.
    familyAgenda(supabase, householdId, { now }).catch(() => null),
    listIntegrations(supabase, householdId).catch(() => []),
    listPets(supabase, householdId).catch(() => []),
    listEnrolments(supabase, householdId).catch(() => []),
    // Sign-in emails this viewer may read: every member's for an Admin, their own otherwise.
    readMemberEmails(supabase, householdId).catch(() => new Map<string, string>()),
    // Adults' picked offices; RLS returns only what this viewer may see.
    listWorkPlaces(supabase, householdId).catch(() => []),
    // Phone numbers this viewer may read: Admins and adults see everyone's, others their own.
    readMemberPhones(supabase, householdId).catch(() => new Map<string, string>()),
    // How the family is related (Members & roles), for each person's details.
    listRelationships(supabase, householdId).catch(() => []),
    // Who shares where they are, and the positions this viewer may see (adults: everyone sharing; others: their own).
    loadLocations(supabase, householdId).catch(() => ({ sharing: [], locations: [] })),
    loadKnownPlaces(supabase, householdId, t("location.home")).catch(() => []),
    // The same join the Responsibilities screen reads, so a member's count is the same rows it lists.
    readResponsibilities(supabase, householdId).catch(() => []),
    // The three tables the Househelper screen reads, so "Expected today" means the same thing there.
    readHelperAvailability(supabase, householdId, now.toISOString().slice(0, 10)),
  ]);
  const [, helperWindows, helperExceptions] = helperReads;
  const todayIso = now.toISOString().slice(0, 10);
  const admin = isHouseholdAdmin(membership);
  // What an Admin needs to add and relate people: pending invitations and the guardian links suggestions come from.
  const [invitations, guardianLinks] = admin
    ? await Promise.all([listInvitations(supabase, householdId).catch(() => []), listGuardianLinks(supabase, householdId).catch(() => [])])
    : [[], []];
  // A child's quiet hours (story 27-015): an Admin, or the child's own guardian, sees and sets them.
  const childIds = members.filter((member) => member.memberType === "child").map((member) => member.id);
  const isAdminViewer = isHouseholdAdmin(membership);
  const quietAdmin = childIds.length > 0 ? createAdminClient() : null;
  const [guardedRows, quietRows] = quietAdmin
    ? await Promise.all([
        isAdminViewer
          ? Promise.resolve({ data: [] as { child_member_id: string }[] })
          : quietAdmin.from("member_guardians").select("child_member_id").eq("household_id", householdId).eq("guardian_member_id", membership.memberId).in("child_member_id", childIds),
        quietAdmin.from("notification_preferences").select("member_id, quiet_from, quiet_until, quiet_from_minute, quiet_until_minute").eq("household_id", householdId).eq("channel", "in_app").in("member_id", childIds),
      ]).catch(() => [{ data: [] }, { data: [] }] as const)
    : [{ data: [] }, { data: [] }];
  const guarded = new Set(((guardedRows.data ?? []) as { child_member_id: string }[]).map((row) => row.child_member_id));
  const quietOf = new Map(((quietRows.data ?? []) as { member_id: string; quiet_from: number | null; quiet_until: number | null; quiet_from_minute: number | null; quiet_until_minute: number | null }[]).map((row) => [row.member_id, row]));
  const todayKey = localMoment(now, timezone).dateKey;
  const quietTimes = Array.from({ length: 96 }, (_, index) => ({
    value: `${String(Math.floor(index / 4)).padStart(2, "0")}:${String((index % 4) * 15).padStart(2, "0")}`,
    label: locale.format.time(atLocal(todayKey, index * 15, timezone)),
  }));
  const clockOf = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  const childQuiet = (member: (typeof members)[number]) => {
    const row = quietOf.get(member.id);
    const own = row && row.quiet_from !== null && row.quiet_until !== null ? { fromMinute: row.quiet_from * 60 + (row.quiet_from_minute ?? 0), untilMinute: row.quiet_until * 60 + (row.quiet_until_minute ?? 0) } : null;
    const window = own ?? childQuietHours({ memberType: member.memberType, dateOfBirth: member.dateOfBirth }, now);
    if (!window) return null;
    const label = (minute: number) => locale.format.time(atLocal(todayKey, minute, timezone));
    return { from: clockOf(window.fromMinute), until: clockOf(window.untilMinute), current: t(own ? "family.childQuiet.custom" : "family.childQuiet.default", { from: label(window.fromMinute), until: label(window.untilMinute) }) };
  };
  // Where each sharing member is, said as a saved place or "out" (consent-based, 2026-10-20).
  const sharingOn = new Set(whereabouts.sharing.filter((row) => row.enabled).map((row) => row.memberId));
  const shownToChildren = new Set(whereabouts.sharing.filter((row) => row.visibleToChildren).map((row) => row.memberId));
  const whereIs = (memberId: string) => {
    const position = whereabouts.locations.find((row) => row.memberId === memberId);
    if (!position) return null;
    const place = placeAt(position, knownPlaces);
    const ago = agoText(locale.preferences.language, position.recordedAt, now);
    return { line: `${place ? t("location.at", { place: place.name }) : t("location.out")} · ${ago}`, fresh: isFresh(position.recordedAt, now), map: mapLink(position) };
  };
  const viewerIsAdult = membership.memberType === "adult";
  const officeOf = (memberId: string) => offices.find((office) => office.memberId === memberId) ?? null;
  // Each child's current school and its day, read beside their other details.
  const schoolOf = (memberId: string) => {
    const enrolment = enrolments.find((entry) => entry.childMemberId === memberId);
    return enrolment ? { schoolName: enrolment.schoolName, hours: enrolment.hours ?? null, placeId: enrolment.placeId ?? null, schoolAddress: enrolment.schoolAddress ?? null } : null;
  };

  // A stale calendar and a free afternoon must never look alike (17-002): if a
  // connected calendar is not working, the screen says so before the events.
  const calendarHealth =
    integrations
      .filter((integration) => integration.kind === "calendar")
      .map((integration) => describeCalendarHealth({ status: integration.status, lastSuccessAt: integration.lastSuccessAt, now }))
      .find((health) => health.tone !== "silent") ?? null;

  const agenda = entitlement.allowed ? familyRead : null;
  const events = agenda?.rows ?? [];

  const familyMembers = members.filter((member) => member.memberType !== "helper");
  const helpers = members.filter((member) => member.memberType === "helper");
  // Whether a househelper is expected today: an exception for today wins, else their usual days.
  const todayException = (id: string) => helperExceptions.find((row) => row.member_id === id && row.on_date === todayIso);
  const expectedToday = (id: string) => {
    const exception = todayException(id);
    return exception ? exception.available : helperWindows.some((row) => row.member_id === id && row.day_of_week === now.getDay());
  };
  const expectedLabel = (id: string) =>
    expectedToday(id) ? t("homeScreen.helper.expected") : todayException(id) ? t("homeScreen.helper.away") : t("homeScreen.helper.notToday");
  const needs = agenda ? [...agenda.events, ...agenda.conflicts, ...agenda.gifts] : [];
  // A family moment is shared family time (`isFamilyMoment`), never just the next protected event.
  const moment = events.find((event) => event.protected && isFamilyMoment(event)) ?? events.find((event) => isFamilyMoment(event)) ?? null;
  // Admins invite the people the household keeps without an account to sign in as themselves.
  const invite = admin ? { householdName: membership.household.name, inviterName: membership.displayName, canEmail: platformMailConfig() !== null } : null;
  const needLabels: FamilyNeedLabels = {
    replied: t("family.need.replied"),
    giftSorted: t("family.need.giftSorted"),
    prepared: t("family.need.prepared"),
    travelSorted: t("family.need.travelSorted"),
    done: t("family.need.done"),
    chosen: t("family.need.chosen"),
    ordered: t("family.need.ordered"),
    given: t("family.need.given"),
    sorted: t("family.need.sorted"),
    fineAsIs: t("family.need.fineAsIs"),
  };
  const formLabels = memberFormLabels(t);
  // How the family is related: active family only, never a househelper.
  const relatable = familyMembers.filter((member) => member.status !== "inactive");
  const relationshipRows = describeRelationships(t, relationships, members);
  const suggestions = admin ? describeSuggestions(t, suggestRelationships(members, relationships, guardianLinks), members) : [];
  const removable = (member: (typeof members)[number]) => admin && !member.isOwner && member.id !== membership.memberId && member.status === "active";
  const statusLabel = (status: string) => (status === "invited" ? t("family.status.invitedLong") : status === "inactive" ? t("family.status.inactive") : null);

  return (
    <AppShell active="family" viewer={viewer} secondary={secondary} pathname="/family">
      <OpenOnHash />
      <div className="space-y-6">
        <header className="wh-rise relative flex items-start justify-between gap-3 overflow-hidden">
          <div className="min-w-0">
            <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">{t("family.title")}</h1>
            <p className="text-sm text-[var(--wh-foreground-muted)]">{t("family.lede")}</p>
          </div>
          {/* Decoration only — every fact on this screen is still said in
              words below, never only in the picture (rule 8). */}
          <HomeIllustration className="w-24 shrink-0 sm:w-36" />
        </header>

        <Card className="wh-rise flex items-center gap-3 bg-[var(--wh-handled-soft)] p-4" style={{ "--wh-rise-delay": "30ms" } as React.CSSProperties}>
          <IconTile icon={Sun} tone="money" />
          <p className="min-w-0 flex-1 text-sm font-semibold">{t("family.banner")}</p>
          {/* The one handwritten line this screen gets (rule 2) — the
              closing note lives here instead of a second script accent
              further down the page. */}
          <ScriptAccent tone="primary" size="sm" heart tilt={false} className="hidden max-w-[9rem] text-right sm:block">
            {t("family.script")}
          </ScriptAccent>
        </Card>

        {calendarHealth ? (
          <Card className="flex items-start gap-3 p-4">
            <CalendarDays aria-hidden className="mt-0.5 size-5 shrink-0 text-[var(--wh-foreground-muted)]" />
            <div className="min-w-0 flex-1">
              <p className="text-sm">{calendarHealth.message}</p>
              {calendarHealth.tone === "needs_action" && admin ? (
                <div className="mt-2">
                  <PillLink href="/settings/connections" tone="primary">{t("family.fixConnection")}</PillLink>
                </div>
              ) : null}
            </div>
          </Card>
        ) : null}

        <section className="wh-rise" style={{ "--wh-rise-delay": "60ms" } as React.CSSProperties}>
          <SectionHeader
            title={t("family.members")}
            count={familyMembers.length}
            action={
              admin || session.chatOn ? (
                // Manage and the family chat are icons with their names (rule 11), so the title and Invite stay whole on one line (the owner, 2026-10-21).
                <div className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
                  {session.chatOn && membership.memberType !== "helper" ? (
                    <Link href="/chat/family" aria-label={t("chat.familyChat")} title={t("chat.familyChat")} className={ICON_LINK}>
                      <MessagesSquare aria-hidden className="size-4" />
                    </Link>
                  ) : null}
                  {admin ? (
                    <>
                      <PillLink href="#add" tone="primary">
                        <UserPlus aria-hidden className="size-3.5" /> <span className="sm:hidden">{t("family.inviteShort")}</span><span className="hidden sm:inline">{t("family.inviteMember")}</span>
                      </PillLink>
                    </>
                  ) : null}
                </div>
              ) : null
            }
          />
          {familyMembers.length === 0 ? (
            <EmptyState icon={Users} tone="people" title={t("family.empty.members")} description={t("family.empty.membersLede")} action={admin ? <ButtonLink href="#add">{t("family.inviteSomeone")}</ButtonLink> : null} />
          ) : (
            // Full-width rows that open in place (rule 15, rule 19: primary
            // information is never squeezed into a half-width card) — the
            // one thing a person came to this screen for.
            <Card className="p-2">
              <ul className="divide-y divide-[var(--wh-border)]">
                {familyMembers.map((member) => (
                  <ExpandableRow
                    key={member.id}
                    trailing={
                      // A chat with this person (story 12-015): anyone else in the family (the owner, 2026-10-21); someone not signed in yet reads it once they do.
                      session.chatOn && member.id !== membership.memberId && member.status === "active" ? (
                        <Link href={`/chat/with/${member.id}`} aria-label={t("chat.with", { name: member.displayName })} title={t("chat.with", { name: member.displayName })} className={ICON_LINK}>
                          <MessageCircle aria-hidden className="size-4" />
                        </Link>
                      ) : null
                    }
                    summary={
                      <>
                        <Avatar name={member.displayName} size="md" imageUrl={member.avatarUrl} badge={member.memberType === "child" ? "🧒" : member.isOwner || member.roles.includes("head") || member.roles.includes("administrator") ? "👑" : undefined} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">{member.displayName}</span>
                          <span className="block text-xs text-[var(--wh-foreground-subtle)]">
                            {describeRoles(member.roles, member.isOwner)}
                            {member.status === "invited" ? ` · ${t("family.status.invited")}` : member.id === membership.memberId ? ` · ${t("family.you")}` : ""}
                            {responsibilitiesFor(member.id, responsibilityRows).owned.length > 0 ? ` · ${t("homeScreen.responsibilities", { count: responsibilitiesFor(member.id, responsibilityRows).owned.length })}` : ""}
                          </span>
                          {whereIs(member.id) ? (
                            <span className={`mt-0.5 flex items-center gap-1 text-xs ${whereIs(member.id)!.fresh ? "text-[var(--wh-foreground-muted)]" : "text-[var(--wh-foreground-subtle)]"}`}>
                              <MapPin aria-hidden className="size-3 shrink-0" />
                              {whereIs(member.id)!.line}
                            </span>
                          ) : null}
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
                        statusLabel={statusLabel(member.status)}
                        school={member.memberType === "child" ? schoolOf(member.id) : null}
                        email={emails.get(member.id) ?? null}
                        phone={phones.get(member.id) ?? null}
                        invite={invite}
                        workPlace={member.memberType === "adult" ? officeOf(member.id) : null}
                        relations={relationsLine(t, member.id, relationships, members)}
                        relationshipRows={relationships}
                        responsibilitiesHref={`/household/responsibilities?group=person#person-${member.id}`}
                        responsibilitiesCount={responsibilitiesFor(member.id, responsibilityRows).owned.length}
                      />
                      {/* Every Admin is equal: any Admin makes an adult an Admin, or steps one back. */}
                      {admin && !member.isOwner && member.memberType === "adult" && member.status === "active" ? (
                        <MemberRoleControl
                          householdId={householdId}
                          memberId={member.id}
                          isAdministrator={member.roles.includes("administrator")}
                          labels={{ makeAdmin: t("manage.members.makeAdmin"), removeAdmin: t("manage.members.removeAdmin") }}
                          withLabel
                        />
                      ) : null}
                      {removable(member) ? <RemoveMemberControl householdId={householdId} memberId={member.id} displayName={member.displayName} labels={formLabels} /> : null}
                      {member.memberType === "child" && (isAdminViewer || guarded.has(member.id)) && childQuiet(member) ? (
                        <ChildQuietControl
                          householdId={householdId}
                          childId={member.id}
                          from={childQuiet(member)!.from}
                          until={childQuiet(member)!.until}
                          times={quietTimes}
                          labels={{
                            title: t("family.childQuiet.title", { name: member.displayName }),
                            current: childQuiet(member)!.current,
                            from: t("family.childQuiet.from"),
                            until: t("family.childQuiet.until"),
                            save: t("common.save"),
                            saving: t("common.saving"),
                            useDefault: t("family.childQuiet.useDefault"),
                            saved: t("family.childQuiet.saved"),
                            restored: t("family.childQuiet.restored"),
                          }}
                        />
                      ) : null}
                      {whereIs(member.id) || (viewerIsAdult && sharingOn.has(member.id)) || (member.memberType === "child" && (isAdminViewer || guarded.has(member.id))) || member.id === membership.memberId ? (
                        <div className="space-y-2 rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] p-3 text-sm">
                          <p className="flex items-center gap-1.5 font-medium">
                            <MapPin aria-hidden className="size-4 shrink-0 text-[var(--wh-foreground-muted)]" />
                            {whereIs(member.id)?.line ?? (sharingOn.has(member.id) ? t("location.waiting") : t("location.notSharing"))}
                          </p>
                          {whereIs(member.id) ? (
                            <a href={whereIs(member.id)!.map} target="_blank" rel="noopener noreferrer" className="inline-block text-xs font-semibold text-[var(--wh-primary)] underline-offset-2 hover:underline">
                              {t("location.map")}
                            </a>
                          ) : null}
                          {/* A child's sharing is their guardian's or an Admin's to set; an adult sets their own in Settings. */}
                          {member.memberType === "child" && (isAdminViewer || guarded.has(member.id)) ? (
                            <>
                              <p className="text-xs text-[var(--wh-foreground-muted)]">
                                {sharingOn.has(member.id) ? t("location.child.on", { name: member.displayName }) : t("location.child.title", { name: member.displayName })}
                              </p>
                              <LocationSharingToggle
                                householdId={householdId}
                                memberId={member.id}
                                enabled={sharingOn.has(member.id)}
                                labels={{ turnOn: t("location.turnOn"), turnOff: t("location.turnOff"), turnedOn: t("location.turnedOn"), turnedOff: t("location.turnedOff") }}
                              />
                              {sharingOn.has(member.id) ? (
                                <LocationAudienceChoice
                                  householdId={householdId}
                                  memberId={member.id}
                                  visibleToChildren={shownToChildren.has(member.id)}
                                  labels={{ legend: t("location.audience.childLegend", { name: member.displayName }), adultsOnly: t("location.audience.adults"), alsoChildren: t("location.audience.children"), saved: t("location.audience.saved") }}
                                />
                              ) : null}
                            </>
                          ) : member.id === membership.memberId && member.memberType !== "child" ? (
                            <PillLink href="/settings/location" tone="quiet">{t("location.title")}</PillLink>
                          ) : null}
                        </div>
                      ) : null}
                      {member.memberType === "child" && view.permissions.includes("school.manage") ? (
                        <PillLink href={`/school?child=${member.id}`} tone="quiet">
                          <GraduationCap aria-hidden className="size-3.5" /> {t("family.viewSchool")}
                        </PillLink>
                      ) : null}
                    </div>
                  </ExpandableRow>
                ))}
              </ul>
            </Card>
          )}
        </section>

        {relatable.length >= 2 || relationshipRows.length > 0 ? (
          <RelationshipsCard
            householdId={householdId}
            admin={admin}
            people={relatable.map((member) => ({ id: member.id, name: member.displayName }))}
            rows={relationshipRows}
            suggestions={suggestions}
            words={relationshipWords(t)}
          />
        ) : null}

        {pets.length > 0 || admin ? (
          <section id="pets" className="wh-rise scroll-mt-20" style={{ "--wh-rise-delay": "75ms" } as React.CSSProperties}>
            <SectionHeader
              title={t("family.pets")}
              count={pets.length}
              action={admin ? <PillLink href="#add" tone="quiet"><PawPrint aria-hidden className="size-3.5" /> {t("family.addPet")}</PillLink> : null}
            />
            {pets.length === 0 ? (
              <EmptyState icon={PawPrint} tone="care" title={t("family.empty.pets")} description={t("family.empty.petsLede")} action={admin ? <ButtonLink href="#add">{t("family.addAPet")}</ButtonLink> : null} />
            ) : (
              <Card className="p-2">
                <ul className="divide-y divide-[var(--wh-border)]">
                  {pets.map((pet) => (
                    <ExpandableRow
                      key={pet.id}
                      summary={
                        <>
                          {pet.photoUrl ? <Avatar name={pet.name} size="sm" imageUrl={pet.photoUrl} /> : <IconTile icon={PawPrint} tone="care" size="sm" />}
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">{pet.name}</span>
                            <span className="block text-xs text-[var(--wh-foreground-subtle)]">
                              {pet.species}
                              {pet.active === false ? ` · ${t("family.retired")}` : ""}
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
              title={t("family.help")}
              count={helpers.length}
              action={admin ? <PillLink href="#add" tone="quiet"><UserPlus aria-hidden className="size-3.5" /> {t("family.addHelper")}</PillLink> : null}
            />
            <p className="mb-2 text-sm text-[var(--wh-foreground-muted)]">
              {t("family.helpLede")}
            </p>
            {helpers.length === 0 ? (
              <EmptyState icon={Users} tone="people" title={t("family.empty.help")} description={t("family.empty.helpLede")} />
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
                              {member.status === "invited" ? `${t("family.status.invited")} · ${t("role.househelper")}` : t("role.househelper")}
                            </span>
                          </span>
                          <Badge tone={expectedToday(member.id) ? "handled" : "neutral"}>{expectedLabel(member.id)}</Badge>
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
                          statusLabel={statusLabel(member.status)}
                          email={emails.get(member.id) ?? null}
                        phone={phones.get(member.id) ?? null}
                          invite={invite}
                        />
                        <PillLink href="/househelper" tone="quiet">
                          {t("family.fullHelperProfile")}
                        </PillLink>
                        {removable(member) ? <RemoveMemberControl householdId={householdId} memberId={member.id} displayName={member.displayName} labels={formLabels} /> : null}
                      </div>
                    </ExpandableRow>
                  ))}
                </ul>
              </Card>
            )}
          </section>
        ) : null}

        {!entitlement.allowed ? (
          <EmptyState icon={CalendarHeart} tone="people" title={t("family.notInPlan")} description={entitlement.reason} />
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
                    <p className="text-base font-semibold">{t("family.moment")}</p>
                    <p className="text-sm text-[var(--wh-foreground-muted)]">{moment.title}</p>
                    <p className="mt-1 text-xs text-[var(--wh-foreground-subtle)]">
                      {formatDate(timezone, moment.startsAt, "long")} · {formatTime(timezone, moment.startsAt)} – {formatTime(timezone, moment.endsAt)}
                    </p>
                    {moment.protected ? (
                      <p className="mt-2 text-xs font-medium text-[var(--wh-tone-people)]">{t("family.protectedLine")}</p>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="rounded-[var(--wh-radius)] bg-[var(--wh-tone-people-soft)] p-4">
                  <div className="flex items-start gap-3">
                    <IconTile icon={Heart} tone="people" />
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-semibold">{t("family.moment")}</p>
                      <p className="text-sm text-[var(--wh-foreground-muted)]">{t("family.momentLede")}</p>
                    </div>
                  </div>
                  <p className="mt-3 rounded-[var(--wh-radius-pill)] bg-[var(--wh-surface)]/70 px-3 py-2 text-center text-sm text-[var(--wh-tone-people)] italic">
                    &ldquo;{t("family.momentQuote")}&rdquo;
                  </p>
                </div>
              )}
            </section>

            {needs.length > 0 ? (
              <section>
                <SectionHeader title={t("family.needsReply")} count={needs.length} />
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
                          action={<FamilyNeedAction householdId={householdId} item={item} labels={needLabels} />}
                        />
                      );
                    })}
                  </ul>
                </Card>
              </section>
            ) : null}

            <section className="wh-rise" style={{ "--wh-rise-delay": "180ms" } as React.CSSProperties}>
              {/* The next few only; planning and the rest are the Calendar's (design/UI-SIMPLIFICATION-v1.md M4). */}
              <SectionHeader title={t("family.upcoming")} count={events.length} action={<PillLink href="/calendar" tone="quiet">{t("family.seeAllCalendar")}</PillLink>} />
              {events.length === 0 ? (
                <EmptyState icon={CalendarHeart} tone="people" title={t("family.empty.events")} description={t("family.empty.eventsLede")} />
              ) : (
                <Card className="p-2">
                  <ul className="divide-y divide-[var(--wh-border)]">
                    {events.slice(0, 3).map((event) => (
                      <CalendarItem
                        key={event.id}
                        title={event.title}
                        kind={event.kind}
                        protectedTime={event.protected}
                        protectedLabel={t("family.protected")}
                        day={formatDate(timezone, event.startsAt).split(" ")[0] ?? ""}
                        month={formatDate(timezone, event.startsAt).split(" ")[1] ?? ""}
                        when={eventWhen(event, timezone, t)}
                        place={event.location}
                        people={(() => {
                          // Only a list worth reading: who is going, when anyone is.
                          const going = eventGoing(event, (id) => members.find((member) => member.id === id)?.displayName ?? null, t, session.locale.format.locale);
                          return going.names.length > 0 ? going.words : null;
                        })()}
                        href={`/calendar/events/${event.id}`}
                        action={event.actionState === "needs_gift" ? <SettleEventPill householdId={householdId} eventId={event.id} label={needLabels.giftSorted} /> : undefined}
                      />
                    ))}
                  </ul>
                </Card>
              )}
            </section>
          </>
        )}

        {admin ? (
          // Adding someone, at the foot of the page every "Invite" and "Add" above leads to.
          <CollapsibleSection id="add" icon={UserPlus} tone="people" title={t("family.addSection")} intro={t("family.inviteSomeone")}>
            <InviteMemberForm householdId={householdId} canInviteAdministrator={admin} labels={formLabels} />
            <PendingInvitations invitations={invitations} timezone={timezone} labels={pendingInvitationLabels(t)} />
            <AddChildForm householdId={householdId} labels={formLabels} />
            <AddHelperForm householdId={householdId} labels={formLabels} />
            <AddPetForm householdId={householdId} labels={formLabels} />
          </CollapsibleSection>
        ) : null}
      </div>
    </AppShell>
  );
}
