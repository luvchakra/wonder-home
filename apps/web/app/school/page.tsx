import { redirect } from "next/navigation";
import { BookOpen, CalendarDays, GraduationCap, MessageSquareText, Plug, School, UserRound } from "lucide-react";

import { may } from "@wonderhome/core/billing/repository";
import type { HomeAssessment } from "@wonderhome/core/home/assessment";
import { isoDate } from "@wonderhome/core/home/assessment";
import { isHouseholdAdmin, listMembers } from "@wonderhome/core/identity/households";
import type { Translate } from "@wonderhome/core/i18n/translate";
import type { Integration } from "@wonderhome/core/integrations/repository";
import { describeSchoolHealth } from "@wonderhome/core/school/connector";
import { upcomingSchoolItems, type SchoolItem } from "@wonderhome/core/school/items";
import { listActivities, listTeachers } from "@wonderhome/core/school/activities";
import { listExamTypes, listExams, listTimetable } from "@wonderhome/core/school/exams";
import { listEnrolments } from "@wonderhome/core/school/enrolments";
import { listCheckIns, listGoals } from "@wonderhome/core/school/goal-repository";
import { schoolAgenda } from "@wonderhome/core/school/repository";
import { mapsLink } from "@wonderhome/core/places/provider";
import { schoolDateValue, schoolDayZone } from "@wonderhome/core/school/times";
import { isoDateIn } from "@wonderhome/core/context/format";
import { listIntegrations } from "@wonderhome/core/integrations/repository";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { ActionRow } from "@wonderhome/core/ui/action-row";
import { Badge, PillLink } from "@wonderhome/core/ui/pill";
import { Card } from "@wonderhome/core/ui/card";
import {
  ExpandableMetricRow,
  MetricDetailEmpty,
  MetricDetailList,
  MetricDetailRow,
  type ExpandableMetric,
} from "@wonderhome/core/ui/expandable-metric-card";
import { ExpandableRow } from "@wonderhome/core/ui/expandable-row";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { SegmentedControl } from "@wonderhome/core/ui/segmented-control";
import { EmptyState } from "@wonderhome/core/ui/states";

import { AgendaExpandableRow } from "../_components/agenda-expandable-row";
import { AddHomeworkButton } from "../_components/school-forms";
import { SchoolItemDetail } from "../_components/school-item-controls";
import { placeSearchLabels } from "../_lib/place-labels";
import { placeSearchAvailable } from "../_lib/places";
import { schoolFormLabels } from "../_lib/school-form-labels";
import { childDetailWords, schoolWeekWords } from "../_lib/child-detail-words";
import { ChildClasses } from "../_components/child-classes";
import { ChildSchoolWeek } from "../_components/child-school-week";
import { StandDownButton, TeacherSheet } from "./child-details";
import { ChildSchoolActions, type ChildSchoolLabels } from "./child-school";
import { GoalsTab } from "./goals-tab";
import { formatDate, formatTime, requireSession } from "../_lib/session";

export const metadata = { title: "Kids & School" };
export const dynamic = "force-dynamic";

/**
 * School (requirements §16): Overview, Homework and Calendar.
 *
 * Overview is the agenda — deadlines that will not fit and messages that ask
 * something. Homework is the child's live work. With more than one child it
 * is always one child at a time, picked by name, the first by default.
 * Guardianship is enforced underneath by RLS, so a parent sees their own
 * children and a child sees themselves.
 */
export default async function SchoolPage({ searchParams }: { searchParams: Promise<{ tab?: string; child?: string }> }) {
  const [{ tab, child }, session] = await Promise.all([searchParams, requireSession("/school")]);
  const { supabase, membership, view, viewer, secondary, locale } = session;
  const { t } = locale;
  const householdId = membership.household.id;
  const timezone = membership.household.timezone;

  if (view.tone === "child") redirect("/?tab=school");

  const entitlementCheck = may(supabase, householdId, "school.connector");
  const active = tab === "homework" || tab === "calendar" || tab === "goals" ? tab : "overview";
  const shell = { active: "more" as const, viewer, secondary, pathname: "/school", back: { href: "/more", label: t("common.back") }, title: t("nav.item.school") };

  // The plan check runs alongside the reads it gates; a refused plan drops them.
  const reads = Promise.all([
    // The agenda reads the household's school work and messages once; the
    // lists below are those same rows, not a second read of them.
    schoolAgenda(supabase, householdId).catch(() => null),
    listMembers(supabase, householdId, membership.household.ownerMemberId).catch(() => []),
    listIntegrations(supabase, householdId).catch(() => []),
    // Each child's school (story 24-010); RLS returns only the children this viewer may see.
    listEnrolments(supabase, householdId).catch(() => []),
    // Each child's teachers and classes outside school (08-010, 08-011); empty until the tables exist.
    listTeachers(supabase, householdId).catch(() => []),
    listActivities(supabase, householdId).catch(() => []),
    // Each child's timetable and exams (08-015); empty until the tables exist.
    listTimetable(supabase, householdId).catch(() => []),
    listExams(supabase, householdId).catch(() => []),
    listExamTypes(supabase, householdId).catch(() => ({ builtIn: ["Unit test", "Mid-term", "Finals"], own: [] })),
    // Each child's goals and the days kept (08-017), only for the tab that shows them (with each child's score).
    active === "goals" ? listGoals(supabase, householdId).catch(() => []) : Promise.resolve([]),
    active === "goals" ? listCheckIns(supabase, householdId).catch(() => []) : Promise.resolve([]),
  ]);
  // Marks a refusal handled when the page returns early; `await reads` below still throws.
  reads.catch(() => undefined);
  const entitlement = await entitlementCheck;
  if (!entitlement.allowed) {
    return (
      <AppShell {...shell}>
        <EmptyState icon={GraduationCap} tone="school" title={t("school.notInPlan")} description={entitlement.reason} />
      </AppShell>
    );
  }

  const [agenda, members, integrations, enrolments, teachers, activities, periods, exams, examTypes, goals, checkIns] = await reads;

  const children = members.filter((member) => member.memberType === "child");
  // One child at a time (the owner, 2026-10-19: no "Everyone"): the one asked for, else the first.
  const selected = children.find((kid) => kid.id === child)?.id ?? children[0]?.id ?? null;
  const items = (agenda?.items ?? []).filter((item) => !selected || item.childMemberId === selected);
  const communications = agenda?.communications ?? [];

  // A stale portal and "no homework" must never look alike (17-004): if a
  // connected school portal is not working, the screen says so up front.
  const portalHealth =
    integrations
      .filter((integration) => integration.kind === "school")
      .map((integration) => {
        const health = describeSchoolHealth({ status: integration.status, lastSuccessAt: integration.lastSuccessAt });
        return { tone: health.tone, message: portalWords(integration, t) ?? health.message };
      })
      .find((health) => health.tone !== "silent") ?? null;
  const admin = isHouseholdAdmin(membership);

  const schoolOf = (childId: string) => {
    const enrolment = enrolments.find((entry) => entry.childMemberId === childId);
    return enrolment
      ? {
          name: enrolment.schoolName,
          address: enrolment.schoolAddress ?? null,
          placeId: enrolment.placeId ?? null,
          mapsUri: mapsLink({ name: enrolment.schoolName, formattedAddress: enrolment.schoolAddress ?? "", placeId: enrolment.placeId }),
          grade: enrolment.grade,
          hours: enrolment.hours ?? null,
        }
      : null;
  };
  const schoolLabels: ChildSchoolLabels = {
    field: t("places.school.label"),
    gradeField: t("school.place.gradeField"),
    gradePlaceholder: t("school.place.gradePlaceholder"),
    starts: t("school.place.starts"),
    ends: t("school.place.ends"),
    hoursHint: t("school.place.hoursHint"),
    edit: t("school.place.edit", { name: "{name}" }),
    title: t("school.place.title", { name: "{name}" }),
    lede: t("school.place.lede"),
    save: t("school.place.save"),
    saving: t("common.saving"),
    open: t("hometalk.places.open", { name: "{name}" }),
    search: placeSearchLabels(t, "school"),
  };
  const shownChildren = selected ? children.filter((kid) => kid.id === selected) : children;
  const canChangeSchool = view.tone === "adult";
  const detailWords = childDetailWords(t, locale.preferences.language);
  const weekWords = schoolWeekWords(t, locale.preferences.language, examTypes);
  const clock = new Intl.DateTimeFormat(locale.preferences.language, { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
  const clockOf = (time: string) => clock.format(Date.UTC(2026, 0, 1, Number(time.slice(0, 2)), Number(time.slice(3, 5))));
  const childOptions = children.map((kid) => ({ id: kid.id, displayName: kid.displayName }));
  // The child picker says first names (the owner, 2026-10-20); two children who share one keep their full names.
  const firstOf = (name: string) => name.trim().split(/\s+/)[0] ?? name;
  const pickerName = (name: string) => (children.filter((kid) => firstOf(kid.displayName) === firstOf(name)).length > 1 ? name : firstOf(name));
  const nameOf = (id: string | null) => members.find((member) => member.id === id)?.displayName ?? t("school.unknownChild");
  const formLabels = schoolFormLabels(t, locale.preferences.language);
  // A stored kind is shown in the reader's words; the value itself never changes.
  const kindWords = (kind: SchoolItem["kind"]) => t(`school.kind.${kind}`);
  const dueWords = (item: SchoolItem) => (item.dueAt ? t("school.due", { date: formatDate(schoolDayZone(item, timezone), item.dueAt, "long") }) : t("school.noDueDate"));
  // Only a time somebody gave, in the reader's clock; an all-day item says so.
  const timeWords = (item: SchoolItem) =>
    item.dueAt && item.dueTimeKnown
      ? item.endsAt
        ? `${formatTime(timezone, item.dueAt)} – ${formatTime(timezone, item.endsAt)}`
        : formatTime(timezone, item.dueAt)
      : t("school.allDay");
  // Live work is what a child has to do: an event is something to know, kept under the Overview's Coming up, not homework (the owner, 2026-10-20).
  const live = items.filter((item) => (item.status === "pending" || item.status === "in_progress") && item.kind !== "event");
  const needsYou = agenda ? agenda.deadlines.length + agenda.messages.length : 0;

  // "Coming up" previews what's ahead (exams/projects/events a month out,
  // homework/worksheets a few days out) — distinct from "Deadlines at risk",
  // which only flags what won't fit in the time left. An item already
  // flagged there is left out here rather than shown twice.
  const atRiskIds = new Set((agenda?.deadlines ?? []).map((deadline) => deadline.subjectKey));
  const upcoming = upcomingSchoolItems(items).filter((item) => !atRiskIds.has(`school.${item.id}`));

  // What each Overview count opens onto: the real deadlines/messages behind
  // "Need you", the real live pieces of work behind "Live work" — the same
  // rows the sections below already render, reused rather than a second,
  // thinner list invented for the card — and the genuine split behind
  // "Checked" (rule 9: never more of a number's story than it can prove).
  const needsYouEntries: HomeAssessment[] = agenda ? [...agenda.deadlines, ...agenda.messages] : [];
  const metrics: ExpandableMetric[] = [
    {
      label: t("school.metric.needYou"),
      value: needsYou,
      icon: <IconTile icon={GraduationCap} tone="attention" size="sm" />,
      details:
        needsYouEntries.length === 0 ? (
          <MetricDetailEmpty>{t("school.needYou.empty")}</MetricDetailEmpty>
        ) : (
          <div className="space-y-2.5">
            <ul className="space-y-1">
              {needsYouEntries.slice(0, 4).map((item) => (
                <AgendaExpandableRow key={item.subjectKey} item={item} timezone={timezone} />
              ))}
            </ul>
            {needsYouEntries.length > 4 ? (
              <PillLink href="/school?tab=homework" tone="quiet">
                {t("school.viewAll", { count: needsYouEntries.length })}
              </PillLink>
            ) : null}
          </div>
        ),
    },
    {
      label: t("school.metric.liveWork"),
      value: live.length,
      icon: <IconTile icon={BookOpen} tone="school" size="sm" />,
      details:
        live.length === 0 ? (
          <MetricDetailEmpty>{t("school.liveWork.empty")}</MetricDetailEmpty>
        ) : (
          <div className="space-y-2.5">
            <ul className="space-y-1">
              {live.slice(0, 4).map((item) => (
                <ExpandableRow
                  key={item.id}
                  summary={
                    <>
                      <IconTile icon={item.kind === "exam" ? CalendarDays : BookOpen} tone="school" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{item.title}</span>
                        <span className="block text-xs text-[var(--wh-foreground-subtle)]">
                          {[nameOf(item.childMemberId), item.subject, dueWords(item)]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <Badge tone={item.status === "in_progress" ? "attention" : "neutral"}>
                        {item.status === "in_progress" ? t("school.status.inProgress") : kindWords(item.kind)}
                      </Badge>
                    </>
                  }
                >
                  <SchoolItemDetail item={item} householdId={householdId} kids={childOptions} timezone={timezone} editable labels={formLabels} />
                </ExpandableRow>
              ))}
            </ul>
            {live.length > 4 ? (
              <PillLink href="/school?tab=homework" tone="quiet">
                {t("school.viewAll", { count: live.length })}
              </PillLink>
            ) : null}
          </div>
        ),
    },
    {
      label: t("school.metric.checked"),
      value: agenda?.checked ?? 0,
      icon: <IconTile icon={MessageSquareText} tone="handled" size="sm" />,
      details:
        !agenda || agenda.checked === 0 ? (
          <MetricDetailEmpty>{t("school.checked.empty")}</MetricDetailEmpty>
        ) : (
          <MetricDetailList>
            <MetricDetailRow icon={<IconTile icon={BookOpen} tone="school" size="sm" />} title={t("school.checked.items")} meta={t("school.checked.count", { count: items.length })} />
            <MetricDetailRow icon={<IconTile icon={MessageSquareText} tone="handled" size="sm" />} title={t("school.checked.messages")} meta={t("school.checked.count", { count: communications.length })} />
          </MetricDetailList>
        ),
    },
  ];

  return (
    <AppShell {...shell}>
      <div className="space-y-5">
        <header className="wh-rise flex flex-wrap items-end justify-between gap-3">
          <div className="hidden lg:block">
            <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">{t("nav.item.school")}</h1>
            <p className="text-sm text-[var(--wh-foreground-muted)]">{t("school.lede")}</p>
          </div>
        </header>

        {portalHealth ? (
          <Card className="flex items-start gap-3 p-4">
            <Plug aria-hidden className="mt-0.5 size-5 shrink-0 text-[var(--wh-foreground-muted)]" />
            <div className="min-w-0 flex-1">
              <p className="text-sm">{portalHealth.message}</p>
              {portalHealth.tone === "needs_action" && admin ? (
                <div className="mt-2">
                  <PillLink href="/household/integrations" tone="primary">{t("school.fixConnection")}</PillLink>
                </div>
              ) : null}
            </div>
          </Card>
        ) : null}

        {children.length > 1 ? (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
            {children.map((kid) => (
              <PillLink key={kid.id} href={`/school?tab=${active}&child=${kid.id}`} tone={selected === kid.id ? "primary" : "quiet"}>{pickerName(kid.displayName)}</PillLink>
            ))}
          </div>
        ) : null}

        {/* What to do for the child picked above sits right under the picker, between it and the tabs
            (the owner, 2026-10-21: "bring this row in between these lines, these should specific to each child").
            Add homework starts on the picked child; a school portal is connected for the household. */}
        <div className="flex flex-wrap gap-2">
          {children.length > 0 ? <AddHomeworkButton householdId={householdId} kids={childOptions} labels={formLabels} defaultChildId={selected} /> : null}
          <PillLink href="/household/integrations/school" tone="quiet"><Plug aria-hidden className="size-3.5" /> {t("school.connect")}</PillLink>
        </div>

        <SegmentedControl
          label={t("school.view")}
          active={active}
          segments={[
            { key: "overview", label: t("school.tab.overview"), href: `/school${selected ? `?child=${selected}` : ""}`, count: needsYou },
            { key: "homework", label: t("school.tab.homework"), href: `/school?tab=homework${selected ? `&child=${selected}` : ""}`, count: live.length },
            { key: "calendar", label: t("school.tab.calendar"), href: `/school?tab=calendar${selected ? `&child=${selected}` : ""}` },
            { key: "goals", label: t("school.tab.goals"), href: `/school?tab=goals${selected ? `&child=${selected}` : ""}` },
          ]}
        />

        {active === "overview" ? (
          <>
            <ExpandableMetricRow metrics={metrics} />
            {shownChildren.map((kid) => {
              const school = schoolOf(kid.id);
              const enrolment = enrolments.find((entry) => entry.childMemberId === kid.id);
              const theirTeachers = teachers.filter((teacher) => teacher.childMemberId === kid.id);
              const theirClasses = activities.filter((activity) => activity.childMemberId === kid.id);
              const childRef = { id: kid.id, name: kid.displayName };
              return (
                <section key={kid.id} className="space-y-2">
                  <SectionHeader title={t("school.details.title")} />
                  <Card className="px-3 pb-1">
                    <ul className="divide-y divide-[var(--wh-border)]">
                      <ActionRow
                        icon={School}
                        tone="school"
                        title={school ? school.name : t("school.place.label")}
                        meta={school ? [enrolment?.grade ? t("school.place.grade", { grade: enrolment.grade }) : null, enrolment?.hours ? `${clockOf(enrolment.hours.starts)} – ${clockOf(enrolment.hours.ends)}` : null, school.address].filter(Boolean).join(" · ") : t("school.place.none")}
                        action={<ChildSchoolActions householdId={householdId} child={childRef} school={school} canChange={canChangeSchool} available={placeSearchAvailable()} labels={schoolLabels} />}
                      />
                      {theirTeachers.map((teacher) => (
                        <ActionRow
                          key={teacher.id}
                          icon={UserRound}
                          tone="school"
                          title={teacher.name}
                          meta={[teacher.role === "class_teacher" ? detailWords.teacher.roles.class_teacher : teacher.subject, teacher.contact].filter(Boolean).join(" · ")}
                          action={
                            canChangeSchool ? (
                              <div className="flex items-center gap-1">
                                <TeacherSheet householdId={householdId} child={childRef} teacher={teacher} words={detailWords} />
                                <StandDownButton kind="teacher" householdId={householdId} id={teacher.id} label={t("school.teachers.remove", { name: teacher.name })} />
                              </div>
                            ) : undefined
                          }
                        />
                      ))}
                    </ul>
                    {theirTeachers.length === 0 ? <p className="px-1 pb-2 text-xs text-[var(--wh-foreground-subtle)]">{t("school.teachers.none")}</p> : null}
                    {canChangeSchool ? <TeacherSheet householdId={householdId} child={childRef} words={detailWords} /> : null}
                  </Card>
                  <ChildSchoolWeek
                    householdId={householdId}
                    child={childRef}
                    teachers={[...new Set(theirTeachers.map((teacher) => teacher.name))]}
                    periods={periods}
                    exams={exams.filter((exam) => exam.childMemberId === kid.id)}
                    canChange={canChangeSchool}
                    words={weekWords}
                    timezone={timezone}
                    language={locale.preferences.language}
                  />
                  <ChildClasses householdId={householdId} child={childRef} activities={theirClasses} canChange={canChangeSchool} words={detailWords} timezone={timezone} language={locale.preferences.language} />
                </section>
              );
            })}
            {agenda === null ? (
              <EmptyState icon={GraduationCap} tone="school" title={t("school.loadFailed.title")} description={t("school.loadFailed.lede")} />
            ) : needsYou === 0 ? (
              <EmptyState
                icon={GraduationCap}
                tone="school"
                title={agenda.checked === 0 ? t("school.empty.title") : t("school.underControl.title")}
                description={agenda.checked === 0 ? t("school.empty.lede") : t("school.underControl.lede")}
                action={agenda.checked === 0 ? <PillLink href="/household/integrations/school"><Plug aria-hidden className="size-3.5" /> {t("school.connect")}</PillLink> : null}
              />
            ) : (
              <>
                {agenda.deadlines.length > 0 ? (
                  <section className="space-y-3">
                    <SectionHeader title={t("school.deadlines")} count={agenda.deadlines.length} />
                    {groupByDueDate(agenda.deadlines, timezone, t).map((group) => (
                      <div key={group.label}>
                        <h3 className="px-1 pb-1 text-[0.6875rem] font-semibold tracking-wide text-[var(--wh-foreground-subtle)] uppercase">{group.label}</h3>
                        <Card className="p-2"><ul className="divide-y divide-[var(--wh-border)]">{group.items.map((item) => <AgendaExpandableRow key={item.subjectKey} item={item} timezone={timezone} href="/school?tab=homework" />)}</ul></Card>
                      </div>
                    ))}
                  </section>
                ) : null}
                {agenda.messages.length > 0 ? (
                  <section>
                    <SectionHeader title={t("school.fromSchool")} count={agenda.messages.length} />
                    <Card className="p-2"><ul className="divide-y divide-[var(--wh-border)]">{agenda.messages.map((item) => <AgendaExpandableRow key={item.subjectKey} item={item} timezone={timezone} href="/school?tab=calendar" />)}</ul></Card>
                  </section>
                ) : null}
              </>
            )}
            {upcoming.length > 0 ? (
              <section className="space-y-3">
                <SectionHeader title={t("school.comingUp")} count={upcoming.length} />
                {groupSchoolItemsByDueDate(upcoming, timezone, t).map((group) => (
                  <div key={group.label}>
                    <h3 className="px-1 pb-1 text-[0.6875rem] font-semibold tracking-wide text-[var(--wh-foreground-subtle)] uppercase">{group.label}</h3>
                    <Card className="p-2">
                      <ul className="divide-y divide-[var(--wh-border)]">
                        {group.items.map((item) => (
                          <ExpandableRow
                            key={item.id}
                            summary={
                              <>
                                <IconTile icon={item.kind === "homework" || item.kind === "worksheet" ? BookOpen : CalendarDays} tone="school" />
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm font-medium">{item.title}</span>
                                  <span className="block text-xs text-[var(--wh-foreground-subtle)]">
                                    {[nameOf(item.childMemberId), item.subject, dueWords(item)].filter(Boolean).join(" · ")}
                                  </span>
                                </span>
                                <Badge tone="neutral">{kindWords(item.kind)}</Badge>
                              </>
                            }
                          >
                            <SchoolItemDetail item={item} householdId={householdId} kids={childOptions} timezone={timezone} editable labels={formLabels} />
                          </ExpandableRow>
                        ))}
                      </ul>
                    </Card>
                  </div>
                ))}
              </section>
            ) : null}
          </>
        ) : null}

        {active === "homework" ? (
          live.length === 0 ? (
            <EmptyState icon={BookOpen} tone="school" title={t("school.homework.emptyTitle")} description={t("school.homework.emptyLede")} />
          ) : (
            <Card className="p-2">
              <ul className="divide-y divide-[var(--wh-border)]">
                {live.map((item) => (
                  <ExpandableRow
                    key={item.id}
                    summary={
                      <>
                        <IconTile icon={item.kind === "exam" ? CalendarDays : BookOpen} tone="school" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">{item.title}</span>
                          <span className="block text-xs text-[var(--wh-foreground-subtle)]">
                            {[
                              nameOf(item.childMemberId),
                              item.subject,
                              dueWords(item),
                              item.estimatedMinutes ? t(item.estimateSource === "inferred" ? "school.minutesEstimated" : "school.minutes", { minutes: item.estimatedMinutes }) : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                        <Badge tone={item.status === "in_progress" ? "attention" : "neutral"}>{item.status === "in_progress" ? t("school.status.inProgress") : kindWords(item.kind)}</Badge>
                      </>
                    }
                  >
                    <SchoolItemDetail item={item} householdId={householdId} kids={childOptions} timezone={timezone} editable labels={formLabels} />
                  </ExpandableRow>
                ))}
              </ul>
            </Card>
          )
        ) : null}

        {active === "goals" ? (
          <GoalsTab
            householdId={householdId}
            kids={shownChildren.map((kid) => ({ id: kid.id, name: kid.displayName }))}
            goals={goals}
            checkIns={checkIns}
            items={agenda?.items ?? []}
            activities={activities}
            timezone={timezone}
            canChange={canChangeSchool}
            formatDay={(day) => formatDate("UTC", new Date(`${day}T00:00:00.000Z`), "long")}
            t={t}
          />
        ) : null}

        {active === "calendar" ? (
          <>
            <section>
              <SectionHeader title={t("school.events")} />
              {items.filter((item) => (item.kind === "event" || item.kind === "exam") && item.dueAt && item.status !== "cancelled").length === 0 ? (
                <EmptyState icon={CalendarDays} tone="school" title={t("school.events.emptyTitle")} description={t("school.events.emptyLede")} />
              ) : (
                <Card className="p-2">
                  <ul className="divide-y divide-[var(--wh-border)]">
                    {items.filter((item) => (item.kind === "event" || item.kind === "exam") && item.dueAt && item.status !== "cancelled").map((item) => (
                      <ExpandableRow
                        key={item.id}
                        summary={
                          <>
                            <IconTile icon={CalendarDays} tone="school" />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium">{item.title}</span>
                              <span className="block text-xs text-[var(--wh-foreground-subtle)]">
                                {[nameOf(item.childMemberId), formatDate(schoolDayZone(item, timezone), item.dueAt!, "long"), timeWords(item)].filter(Boolean).join(" · ")}
                              </span>
                            </span>
                          </>
                        }
                      >
                        <SchoolItemDetail item={item} householdId={householdId} kids={childOptions} timezone={timezone} editable labels={formLabels} />
                      </ExpandableRow>
                    ))}
                  </ul>
                </Card>
              )}
            </section>
            <section>
              <SectionHeader title={t("school.updates")} count={communications.filter((c) => c.requiresAction).length} />
              {communications.length === 0 ? (
                <EmptyState icon={MessageSquareText} tone="school" title={t("school.updates.emptyTitle")} description={t("school.updates.emptyLede")} />
              ) : (
                <Card className="p-2">
                  <ul className="divide-y divide-[var(--wh-border)]">
                    {communications.slice(0, 12).map((message) => (
                      <ActionRow
                        key={message.id}
                        icon={MessageSquareText}
                        tone="school"
                        title={message.subject ?? message.summary}
                        meta={[nameOf(message.childMemberId), formatDate(timezone, message.receivedAt, "long"), message.actionDueAt ? t("school.replyBy", { date: formatDate(timezone, message.actionDueAt) }) : null].filter(Boolean).join(" · ")}
                        action={message.requiresAction ? <Badge tone="attention">{message.actionLabel ?? t("school.reply")}</Badge> : undefined}
                      />
                    ))}
                  </ul>
                </Card>
              )}
            </section>
          </>
        ) : null}

        <QuoteCard>{t("school.quote")}</QuoteCard>
      </div>
    </AppShell>
  );
}

/**
 * "Deadlines at risk" grouped by when they're due, rather than one flat
 * list — every item here already has a real due date (`assessDeadline`
 * never marks an item without one notable), so this never invents a bucket
 * for a date that isn't there.
 */
function groupByDueDate(items: HomeAssessment[], timezone: string, t: Translate): { label: string; items: HomeAssessment[] }[] {
  const now = new Date();
  const today = isoDate(now);
  const tomorrow = isoDate(new Date(now.getTime() + 86_400_000));
  const sorted = [...items].sort((a, b) => (a.dueOn ?? "").localeCompare(b.dueOn ?? ""));

  const groups = new Map<string, HomeAssessment[]>();
  for (const item of sorted) {
    const due = item.dueOn;
    const label = !due
      ? t("school.group.noDate")
      : due < today
        ? t("school.group.overdue")
        : due === today
          ? t("school.group.today")
          : due === tomorrow
            ? t("school.group.tomorrow")
            : formatDate(timezone, new Date(`${due}T00:00:00.000Z`), "long");
    groups.set(label, [...(groups.get(label) ?? []), item]);
  }
  return [...groups.entries()].map(([label, groupItems]) => ({ label, items: groupItems }));
}

/**
 * Same Today/Tomorrow/date grouping as `groupByDueDate`, for the "Coming
 * up" list — a plain `SchoolItem[]` rather than `HomeAssessment[]`, and
 * every item here already has a due date and is due today or later
 * (`upcomingSchoolItems` guarantees both), so there is no "Overdue" or "No
 * date yet" bucket to account for.
 */
function groupSchoolItemsByDueDate(items: SchoolItem[], timezone: string, t: Translate): { label: string; items: SchoolItem[] }[] {
  const now = new Date();
  const today = isoDateIn(now, timezone);
  const tomorrow = isoDateIn(new Date(now.getTime() + 86_400_000), timezone);

  const groups = new Map<string, SchoolItem[]>();
  for (const item of items) {
    const due = schoolDateValue(item, timezone);
    const label = due === today ? t("school.group.today") : due === tomorrow ? t("school.group.tomorrow") : formatDate(schoolDayZone(item, timezone), item.dueAt!, "long");
    groups.set(label, [...(groups.get(label) ?? []), item]);
  }
  return [...groups.entries()].map(([label, groupItems]) => ({ label, items: groupItems }));
}

/**
 * A school portal's trouble in the reader's words — the same cases as
 * `describeSchoolHealth` (whose English stays the record); null for a state
 * the screen never shows.
 */
function portalWords(integration: Pick<Integration, "status" | "lastSuccessAt">, t: Translate, now = new Date()): string | null {
  switch (integration.status) {
    case "degraded":
      return integration.lastSuccessAt
        ? t("school.portal.lastWorked", { count: Math.floor((now.getTime() - integration.lastSuccessAt.getTime()) / 3_600_000) })
        : t("school.portal.trouble");
    case "error":
      return t("school.portal.error");
    case "revoked":
      return t("school.portal.revoked");
    default:
      return null;
  }
}
