import {
  CalendarDays,
  CalendarOff,
  HandHeart,
  LifeBuoy,
  ListChecks,
  ShieldOff,
  UserPlus,
} from "lucide-react";

import {
  arrangedCover,
  listBackupServices,
  planBackupCoverage,
  type BackupService,
} from "@wonderhome/core/household/backup-services";

import {
  isHouseholdAdmin,
  listMembers,
} from "@wonderhome/core/identity/households";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { ActionRow } from "@wonderhome/core/ui/action-row";
import { Avatar } from "@wonderhome/core/ui/avatar";
import { Card } from "@wonderhome/core/ui/card";
import { ExpandableRow } from "@wonderhome/core/ui/expandable-row";
import { Badge, PillLink } from "@wonderhome/core/ui/pill";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { SegmentedControl } from "@wonderhome/core/ui/segmented-control";
import { EmptyState, ErrorState } from "@wonderhome/core/ui/states";

import {
  AddHelperEngagementButton,
  HelperEngagementRowControls,
  RecordLeaveButton,
  WeeklyPatternButton,
} from "../_components/helper-forms";
import {
  AddBackupServiceButton,
  ArrangeCoverButton,
  BackupServiceRowControls,
} from "../_components/backup-service-forms";
import { MemberDetail } from "../_components/member-detail";
import { backupServiceFormLabels, helperFormLabels } from "../_lib/helper-form-labels";
import { formatDate, requireSession } from "../_lib/session";

export const metadata = { title: "Househelper" };
export const dynamic = "force-dynamic";

type ProfileRow = {
  id: string;
  member_id: string;
  engagement: "regular" | "occasional" | "service";
  started_on: string | null;
  notes: string | null;
};
type WindowRow = {
  member_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
};
type ExceptionRow = {
  member_id: string;
  on_date: string;
  available: boolean;
  reason: string | null;
};
type ResponsibilityRow = {
  outcome_key: string;
  primary_member_id: string | null;
  backup_member_id: string | null;
  priority: number;
  playbook_items: { name: string } | { name: string }[] | null;
};

/**
 * Househelper (requirements §17): coordinate service without surveillance.
 *
 * Overview shows who helps, when they are expected and what changes today.
 * Schedule is the weekly pattern and its exceptions. Tasks are the outcomes
 * they own — by name, never by tick — with who covers when they are away.
 * There are no productivity scores here, and there never will be.
 */
export default async function HousehelperPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ tab }, session] = await Promise.all([
    searchParams,
    requireSession("/househelper"),
  ]);
  const { supabase, membership, view, viewer, secondary, locale } = session;
  const { t } = locale;
  const householdId = membership.household.id;
  const timezone = membership.household.timezone;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const active = tab === "schedule" || tab === "tasks" ? tab : "overview";
  const shell = {
    active: "more" as const,
    viewer,
    secondary,
    pathname: "/househelper",
    back: { href: "/more", label: t("common.back") },
    title: t("nav.item.househelper"),
  };

  if (view.tone === "child") {
    return (
      <AppShell {...shell}>
        <EmptyState
          icon={ShieldOff}
          title={t("helpers.notAvailable.title")}
          description={t("helpers.notAvailable.body")}
        />
      </AppShell>
    );
  }

  const [
    membersResult,
    profileRows,
    windowRows,
    exceptionRows,
    responsibilityRows,
  ] = await Promise.all([
    listMembers(supabase, householdId, membership.household.ownerMemberId).then(
      (data) => ({ data, failed: false }),
      () => ({
        data: [] as Awaited<ReturnType<typeof listMembers>>,
        failed: true,
      }),
    ),
    supabase
      .from("helper_profiles")
      .select("id, member_id, engagement, started_on, notes")
      .eq("household_id", householdId),
    supabase
      .from("member_availability")
      .select("member_id, day_of_week, start_time, end_time")
      .eq("household_id", householdId),
    supabase
      .from("availability_exceptions")
      .select("member_id, on_date, available, reason")
      .eq("household_id", householdId)
      .gte("on_date", today)
      .order("on_date"),
    supabase
      .from("responsibilities")
      .select(
        "outcome_key, primary_member_id, backup_member_id, priority, playbook_items(name)",
      )
      .eq("household_id", householdId),
  ]);

  const members = membersResult.data;
  const membersFailed = membersResult.failed;
  const helpers = members.filter((member) => member.memberType === "helper");
  const profiles = (profileRows.data as ProfileRow[] | null) ?? [];
  const windows = (windowRows.data as WindowRow[] | null) ?? [];
  const exceptions = (exceptionRows.data as ExceptionRow[] | null) ?? [];
  const responsibilities =
    (responsibilityRows.data as ResponsibilityRow[] | null) ?? [];
  const nameOf = (id: string | null) =>
    members.find((member) => member.id === id)?.displayName ?? null;
  const helperIds = new Set(helpers.map((helper) => helper.id));
  const todayDow = now.getDay();
  const admin = isHouseholdAdmin(membership);
  const helperOptions = helpers.map((helper) => ({
    id: helper.id,
    displayName: helper.displayName,
  }));
  // Admins set anyone's arrangement; a helper with an account may set their own days and leave.
  const mayEdit = (memberId: string) =>
    admin || memberId === membership.memberId;

  // Backup cover (story 07-008): Admin only, because which outside service
  // stands in for a helper is the Admin's arrangement, and RLS says so too.
  const coverUntil = new Date(now.getTime() + 14 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const [backupServices, arranged] = admin
    ? await Promise.all([
        listBackupServices(supabase, householdId).catch(
          () => [] as BackupService[],
        ),
        arrangedCover(supabase, householdId, today).catch(
          () => new Set<string>(),
        ),
      ])
    : [[] as BackupService[], new Set<string>()];
  const helperOutcomes = responsibilities
    .filter((r) => r.primary_member_id && helperIds.has(r.primary_member_id))
    .map((r) => ({ key: r.outcome_key, name: nameOfOutcome(r) }));
  const coverage = admin
    ? planBackupCoverage({
        absences: exceptions
          .filter(
            (e) =>
              !e.available &&
              helperIds.has(e.member_id) &&
              e.on_date <= coverUntil,
          )
          .map((e) => ({
            memberId: e.member_id,
            onDate: e.on_date,
            reason: e.reason,
          })),
        responsibilities: responsibilities.map((r) => ({
          outcomeKey: r.outcome_key,
          outcomeName: nameOfOutcome(r),
          primaryMemberId: r.primary_member_id,
          backupMemberId: r.backup_member_id,
          priority: r.priority,
        })),
        services: backupServices,
        arranged,
      })
    : [];

  const expectedToday = (memberId: string) => {
    const exception = exceptions.find(
      (e) => e.member_id === memberId && e.on_date === today,
    );
    if (exception) return exception.available;
    return windows.some(
      (w) => w.member_id === memberId && w.day_of_week === todayDow,
    );
  };

  // Words in the viewer's language (story 22-004). Names, notes and reasons
  // are the household's own and are shown exactly as they were typed.
  const formLabels = helperFormLabels(t);
  const serviceLabels = backupServiceFormLabels(t);
  // Sunday-first: the index is the stored day of the week.
  const dayInitials = [
    t("helpers.day.initial.0"),
    t("helpers.day.initial.1"),
    t("helpers.day.initial.2"),
    t("helpers.day.initial.3"),
    t("helpers.day.initial.4"),
    t("helpers.day.initial.5"),
    t("helpers.day.initial.6"),
  ];
  const dayShort = [
    t("helpers.day.short.0"),
    t("helpers.day.short.1"),
    t("helpers.day.short.2"),
    t("helpers.day.short.3"),
    t("helpers.day.short.4"),
    t("helpers.day.short.5"),
    t("helpers.day.short.6"),
  ];
  const engagementLabel = (engagement: ProfileRow["engagement"]) =>
    engagement === "occasional"
      ? t("helpers.engagement.occasional")
      : engagement === "service"
        ? t("helpers.engagement.service")
        : t("helpers.engagement.regular");

  return (
    <AppShell {...shell}>
      <div className="space-y-5">
        <header className="wh-rise flex flex-wrap items-end justify-between gap-3">
          <div className="hidden lg:block">
            <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">
              {t("nav.item.househelper")}
            </h1>
            <p className="text-sm text-[var(--wh-foreground-muted)]">
              {t("helpers.lede")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Always reachable, not only from the empty state (rule 12) —
                a household with one househelper can still take on a
                second, different person (a cook alongside a cleaner). */}
            {view.permissions.includes("members.manage") ? (
              <PillLink href="/household/members" tone="quiet">
                <UserPlus aria-hidden className="size-3.5" /> {t("helpers.addHelper")}
              </PillLink>
            ) : null}
            {helpers.length > 0 ? (
              <RecordLeaveButton
                householdId={householdId}
                helpers={helperOptions}
                labels={formLabels}
              />
            ) : null}
          </div>
        </header>

        <SegmentedControl
          label={t("helpers.view")}
          active={active}
          segments={[
            { key: "overview", label: t("helpers.tab.overview"), href: "/househelper" },
            {
              key: "schedule",
              label: t("helpers.tab.schedule"),
              href: "/househelper?tab=schedule",
              count: exceptions.length,
            },
            {
              key: "tasks",
              label: t("helpers.tab.tasks"),
              href: "/househelper?tab=tasks",
              count: responsibilities.filter(
                (r) =>
                  r.primary_member_id && helperIds.has(r.primary_member_id),
              ).length,
            },
          ]}
        />

        {membersFailed ? (
          <ErrorState
            title={t("helpers.error.title")}
            description={t("helpers.error.body")}
            retryHref="/househelper"
          />
        ) : active === "overview" && helpers.length === 0 ? (
          // The one "add" action is the header's own "Add helper" pill
          // (rule 14) — always there, not only here, so it stays reachable
          // once a first helper stops this state from showing.
          <EmptyState
            icon={HandHeart}
            tone="people"
            title={t("helpers.empty.title")}
            description={t("helpers.empty.body")}
          />
        ) : null}

        {active === "overview" && coverage.length > 0 ? (
          <section>
            <SectionHeader title={t("helpers.away.title")} count={coverage.filter((item) => item.state !== "arranged").length} />
            <Card className="p-2">
              <ul className="divide-y divide-[var(--wh-border)]">
                {coverage.map((item) => (
                  <ActionRow
                    key={`${item.outcomeKey}@${item.date}`}
                    icon={LifeBuoy}
                    tone="people"
                    title={item.outcomeName}
                    meta={t(
                      item.state === "arranged"
                        ? "helpers.away.arranged"
                        : item.state === "service_available"
                          ? "helpers.away.serviceAvailable"
                          : "helpers.away.uncovered",
                      {
                        helper: nameOf(item.helperMemberId) ?? t("helpers.yourHelper"),
                        date: formatDate(timezone, new Date(`${item.date}T12:00:00Z`)),
                      },
                    )}
                    action={
                      item.state === "arranged" ? (
                        <Badge tone="handled">{t("helpers.arranged")}</Badge>
                      ) : item.state === "service_available" ? (
                        <ArrangeCoverButton
                          householdId={householdId}
                          outcomeKey={item.outcomeKey}
                          outcomeName={item.outcomeName}
                          date={item.date}
                          services={item.services.map((service) => ({
                            id: service.id,
                            name: service.name,
                          }))}
                          labels={serviceLabels}
                        />
                      ) : (
                        <PillLink href="/househelper?tab=tasks" tone="soft">
                          {t("helpers.findCover")}
                        </PillLink>
                      )
                    }
                  />
                ))}
              </ul>
            </Card>
          </section>
        ) : null}

        {active === "overview" && helpers.length > 0 ? (
          <Card className="p-2">
            <ul className="divide-y divide-[var(--wh-border)]">
              {helpers.map((helper) => {
                const engagements = profiles.filter((p) => p.member_id === helper.id);
                const profile = engagements[0];
                const todayException = exceptions.find(
                  (e) => e.member_id === helper.id && e.on_date === today,
                );
                const expected = expectedToday(helper.id);
                const owned = responsibilities.filter(
                  (r) => r.primary_member_id === helper.id,
                );
                const nextAbsence = exceptions.find(
                  (e) =>
                    e.member_id === helper.id &&
                    !e.available &&
                    e.on_date > today,
                );
                return (
                  <ExpandableRow
                    key={helper.id}
                    summary={
                      <>
                        <Avatar
                          name={helper.displayName}
                          size="md"
                          imageUrl={helper.avatarUrl}
                          badge="🤝"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">
                            {helper.displayName}
                          </span>
                          <span className="block text-xs text-[var(--wh-foreground-subtle)]">
                            {engagements.length === 0
                              ? t("role.househelper")
                              : engagements.length === 1
                                ? engagementLabel(profile!.engagement)
                                : t("helpers.engagements.count", { count: engagements.length })}
                            {engagements.length === 1 && profile?.started_on
                              ? ` · ${t("helpers.sinceInline", { date: formatDate(timezone, new Date(profile.started_on)) })}`
                              : ""}
                          </span>
                        </span>
                        <Badge tone={expected ? "handled" : "neutral"}>
                          {expected
                            ? t("helpers.expectedToday")
                            : todayException
                              ? t("helpers.awayToday")
                              : t("helpers.notToday")}
                        </Badge>
                      </>
                    }
                  >
                    <div className="space-y-4">
                      {todayException?.reason ? (
                        <p className="rounded-[var(--wh-radius-sm)] bg-[var(--wh-attention-soft)] px-3 py-2 text-xs text-[var(--wh-attention)]">
                          {todayException.reason}
                        </p>
                      ) : null}

                      <MemberDetail
                        member={helper}
                        allMembers={helpers}
                        timezone={timezone}
                        editable={admin || helper.id === membership.memberId}
                        householdId={householdId}
                        currentMemberId={membership.memberId}
                        statusLabel={
                          helper.status === "invited"
                            ? t("family.status.invitedLong")
                            : helper.status === "inactive"
                              ? t("family.status.inactive")
                              : null
                        }
                      />

                      <div>
                        <p className="mb-1.5 text-xs font-semibold tracking-wide text-[var(--wh-foreground-subtle)] uppercase">
                          {t("helpers.section.engagements")}
                        </p>
                        {engagements.length === 0 ? (
                          <p className="text-sm text-[var(--wh-foreground-muted)]">
                            {t("helpers.noArrangement")}
                          </p>
                        ) : (
                          <ul className="space-y-2">
                            {engagements.map((engagement) => (
                              <li
                                key={engagement.id}
                                className="flex items-start justify-between gap-3 rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] px-3 py-2"
                              >
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm font-medium">
                                    {engagementLabel(engagement.engagement)}
                                  </span>
                                  <span className="block text-xs text-[var(--wh-foreground-subtle)]">
                                    {engagement.started_on
                                      ? t("helpers.since", { date: formatDate(timezone, new Date(engagement.started_on)) })
                                      : t("helpers.noStartDate")}
                                    {engagement.notes ? ` · ${engagement.notes}` : ""}
                                  </span>
                                </span>
                                {admin ? (
                                  <HelperEngagementRowControls
                                    householdId={householdId}
                                    helper={{ id: helper.id, displayName: helper.displayName }}
                                    current={{
                                      id: engagement.id,
                                      engagement: engagement.engagement,
                                      startedOn: engagement.started_on,
                                      notes: engagement.notes,
                                    }}
                                    labels={formLabels}
                                  />
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        )}
                        {admin ? (
                          <div className="mt-2">
                            <AddHelperEngagementButton
                              householdId={householdId}
                              helper={{ id: helper.id, displayName: helper.displayName }}
                              labels={formLabels}
                            />
                          </div>
                        ) : null}
                      </div>
                      <div>
                        <p className="mb-1.5 text-xs font-semibold tracking-wide text-[var(--wh-foreground-subtle)] uppercase">
                          {t("helpers.section.usualDays")}
                        </p>
                        <ul className="flex gap-1.5">
                          {dayInitials.map((day, index) => {
                            const on = windows.some(
                              (w) =>
                                w.member_id === helper.id &&
                                w.day_of_week === index,
                            );
                            return (
                              <li
                                key={index}
                                className={`grid size-9 place-items-center rounded-full text-[0.6875rem] font-semibold ${on ? "bg-[var(--wh-primary)] text-[var(--wh-primary-foreground)]" : "bg-[var(--wh-surface-muted)] text-[var(--wh-foreground-subtle)]"}`}
                              >
                                {day}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                      <div>
                        <p className="mb-1.5 text-xs font-semibold tracking-wide text-[var(--wh-foreground-subtle)] uppercase">
                          {t("helpers.section.looksAfter")}
                        </p>
                        {owned.length === 0 ? (
                          <p className="text-sm text-[var(--wh-foreground-muted)]">
                            {t("helpers.noResponsibilities")}
                          </p>
                        ) : (
                          <ul className="flex flex-wrap gap-1.5">
                            {owned.map((r) => (
                              <li
                                key={r.outcome_key}
                                className="rounded-[var(--wh-radius-pill)] bg-[var(--wh-surface-muted)] px-2.5 py-1 text-xs font-medium"
                              >
                                {nameOfOutcome(r)}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      {nextAbsence ? (
                        <p className="flex items-center gap-2 text-xs text-[var(--wh-foreground-muted)]">
                          <CalendarOff aria-hidden className="size-3.5" />{" "}
                          {t("helpers.awayOn", {
                            date: formatDate(
                              timezone,
                              new Date(nextAbsence.on_date),
                              "long",
                            ),
                          })}
                          {nextAbsence.reason ? ` — ${nextAbsence.reason}` : ""}
                        </p>
                      ) : null}
                      {mayEdit(helper.id) ? (
                        <div className="flex flex-wrap gap-1.5">
                          <WeeklyPatternButton
                            householdId={householdId}
                            helper={{
                              id: helper.id,
                              displayName: helper.displayName,
                            }}
                            current={windows
                              .filter((w) => w.member_id === helper.id)
                              .map((w) => ({
                                dayOfWeek: w.day_of_week,
                                startTime: w.start_time,
                                endTime: w.end_time,
                              }))}
                            labels={formLabels}
                          />
                        </div>
                      ) : null}
                    </div>
                  </ExpandableRow>
                );
              })}
            </ul>
          </Card>
        ) : null}

        {active === "schedule" ? (
          <>
            <section>
              <SectionHeader
                title={t("helpers.leave.title")}
                count={exceptions.length}
              />
              {exceptions.length === 0 ? (
                <EmptyState
                  icon={CalendarDays}
                  tone="people"
                  title={t("helpers.leave.empty.title")}
                  description={t("helpers.leave.empty.body")}
                  action={
                    helpers.length > 0 ? (
                      <RecordLeaveButton
                        householdId={householdId}
                        helpers={helperOptions}
                        tone="primary"
                        labels={formLabels}
                      />
                    ) : null
                  }
                />
              ) : (
                <Card className="p-2">
                  <ul className="divide-y divide-[var(--wh-border)]">
                    {exceptions.map((exception) => (
                      <ActionRow
                        key={`${exception.member_id}-${exception.on_date}`}
                        icon={exception.available ? CalendarDays : CalendarOff}
                        tone="people"
                        title={`${nameOf(exception.member_id) ?? t("helpers.helper")} · ${formatDate(timezone, new Date(exception.on_date), "long")}`}
                        meta={
                          exception.reason ??
                          (exception.available ? t("helpers.extraDay") : t("helpers.away"))
                        }
                        action={
                          <Badge
                            tone={exception.available ? "handled" : "attention"}
                          >
                            {exception.available ? t("helpers.extra") : t("helpers.away")}
                          </Badge>
                        }
                      />
                    ))}
                  </ul>
                </Card>
              )}
            </section>
            <section>
              <SectionHeader title={t("helpers.pattern.title")} />
              <Card className="p-2">
                <ul className="divide-y divide-[var(--wh-border)]">
                  {helpers.map((helper) => {
                    const own = windows
                      .filter((w) => w.member_id === helper.id)
                      .sort((a, b) => a.day_of_week - b.day_of_week);
                    return (
                      <ActionRow
                        key={helper.id}
                        icon={CalendarDays}
                        tone="people"
                        title={helper.displayName}
                        meta={
                          own.length === 0
                            ? t("helpers.pattern.none")
                            : own
                                .map(
                                  (w) =>
                                    `${dayShort[w.day_of_week]} ${w.start_time.slice(0, 5)}–${w.end_time.slice(0, 5)}`,
                                )
                                .join(" · ")
                        }
                        action={
                          mayEdit(helper.id) ? (
                            <WeeklyPatternButton
                              householdId={householdId}
                              helper={{
                                id: helper.id,
                                displayName: helper.displayName,
                              }}
                              current={own.map((w) => ({
                                dayOfWeek: w.day_of_week,
                                startTime: w.start_time,
                                endTime: w.end_time,
                              }))}
                              labels={formLabels}
                            />
                          ) : undefined
                        }
                      />
                    );
                  })}
                </ul>
              </Card>
            </section>
          </>
        ) : null}

        {active === "tasks" ? (
          <>
            <Card className="flex items-start gap-3 bg-[var(--wh-primary-soft)]/50 p-4">
              <ListChecks
                aria-hidden
                className="mt-0.5 size-5 shrink-0 text-[var(--wh-primary)]"
              />
              <p className="text-sm text-[var(--wh-foreground-muted)]">
                {t("helpers.tasks.note")}
              </p>
            </Card>
            {responsibilities.filter(
              (r) => r.primary_member_id && helperIds.has(r.primary_member_id),
            ).length === 0 ? (
              <EmptyState
                icon={ListChecks}
                title={t("helpers.tasks.empty.title")}
                description={t("helpers.tasks.empty.body")}
                action={
                  <PillLink href="/household/responsibilities">
                    {t("nav.item.responsibilities")}
                  </PillLink>
                }
              />
            ) : (
              <Card className="p-2">
                <ul className="divide-y divide-[var(--wh-border)]">
                  {responsibilities
                    .filter(
                      (r) =>
                        r.primary_member_id &&
                        helperIds.has(r.primary_member_id),
                    )
                    .map((r) => (
                      <ActionRow
                        key={r.outcome_key}
                        icon={ListChecks}
                        tone="primary"
                        title={nameOfOutcome(r)}
                        meta={
                          r.backup_member_id
                            ? t("helpers.tasks.withBackup", {
                                helper: nameOf(r.primary_member_id) ?? t("helpers.helper"),
                                backup: nameOf(r.backup_member_id) ?? "",
                              })
                            : t("helpers.tasks.noBackup", {
                                helper: nameOf(r.primary_member_id) ?? t("helpers.helper"),
                              })
                        }
                        action={
                          r.backup_member_id ? undefined : (
                            <PillLink
                              href="/household/responsibilities"
                              tone="soft"
                            >
                              {t("helpers.tasks.addBackup")}
                            </PillLink>
                          )
                        }
                      />
                    ))}
                </ul>
              </Card>
            )}

            {admin ? (
              <section>
                <SectionHeader
                  title={t("helpers.backup.title")}
                  action={
                    <AddBackupServiceButton
                      householdId={householdId}
                      outcomes={helperOutcomes}
                      labels={serviceLabels}
                    />
                  }
                />
                {backupServices.length === 0 ? (
                  <p className="text-sm text-[var(--wh-foreground-muted)]">
                    {t("helpers.backup.empty")}
                  </p>
                ) : (
                  <Card className="p-2">
                    <ul className="divide-y divide-[var(--wh-border)]">
                      {backupServices.map((service) => (
                        <ActionRow
                          key={service.id}
                          icon={LifeBuoy}
                          tone={service.active ? "people" : "neutral"}
                          title={service.name}
                          meta={[
                            service.active ? null : t("helpers.backup.retired"),
                            service.contact,
                            service.covers.length === 0
                              ? t("helpers.backup.coversNothing")
                              : t("helpers.backup.covers", {
                                  outcomes: service.covers
                                    .map(
                                      (key) =>
                                        helperOutcomes.find((o) => o.key === key)
                                          ?.name ?? key.replace(/[._]/g, " "),
                                    )
                                    .join(", "),
                                }),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                          action={
                            <BackupServiceRowControls
                              householdId={householdId}
                              service={service}
                              outcomes={helperOutcomes}
                              labels={serviceLabels}
                            />
                          }
                        />
                      ))}
                    </ul>
                  </Card>
                )}
              </section>
            ) : null}
          </>
        ) : null}

        <QuoteCard>{t("helpers.quote")}</QuoteCard>
      </div>
    </AppShell>
  );
}

function nameOfOutcome(row: ResponsibilityRow): string {
  const embedded = Array.isArray(row.playbook_items)
    ? row.playbook_items[0]
    : row.playbook_items;
  return embedded?.name ?? row.outcome_key.replace(/[._]/g, " ");
}
