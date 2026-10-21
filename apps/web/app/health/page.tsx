import {
  CalendarClock,
  CircleCheck,
  Clock,
  HeartPulse,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";

import { may } from "@wonderhome/core/billing/repository";
import { listAppointments } from "@wonderhome/core/health/appointments";
import {
  healthAppointmentsAgenda,
  healthCheckupsAgenda,
  healthFitnessGoalsAgenda,
  healthFitnessSessionsAgenda,
  healthIssuesAgenda,
  healthRecordsAgenda,
  healthRoutinesAgenda,
  healthVitalsAgenda,
} from "@wonderhome/core/health/agenda";
import { listCheckups } from "@wonderhome/core/health/checkups";
import { listFitnessGoals, listFitnessSessions } from "@wonderhome/core/health/fitness";
import { listIssues } from "@wonderhome/core/health/issues";
import { listRoutines } from "@wonderhome/core/health/measurement-routines";
import { listRecords } from "@wonderhome/core/health/records";
import { latestByRecord, listRecentReadings } from "@wonderhome/core/health/report-readings";
import { getHealthProfile, listGuardedChildIds, listHealthConsents, listHouseholdHealthConsents, type PrivacyScope } from "@wonderhome/core/health/repository";
import { viewersBySubject } from "@wonderhome/core/health/sharing";
import { listVitals } from "@wonderhome/core/health/vitals";
import { listMembers } from "@wonderhome/core/identity/households";
import { localMoment } from "@wonderhome/core/notifications/timing";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Card } from "@wonderhome/core/ui/card";
import { ActionRow } from "@wonderhome/core/ui/action-row";
import { ExpandableRow } from "@wonderhome/core/ui/expandable-row";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { SegmentedControl } from "@wonderhome/core/ui/segmented-control";
import { EmptyState } from "@wonderhome/core/ui/states";

import { HealthAddMenu } from "../_components/health-add-menu";
import { AppointmentStatusActions } from "../_components/health-appointment-forms";
import { CheckupActions } from "../_components/health-checkup-forms";
import {
  GrantHealthConsentButton,
  HealthAiAssistanceToggle,
  PrivacyScopeForm,
  RevokeHealthConsentButton,
} from "../_components/health-forms";
import { GoalActions, SessionActions } from "../_components/health-fitness-forms";
import { HealthSharingProvider, type HealthSharing } from "../_components/health-privacy-field";
import { EditIssueButton, IssueStatusActions } from "../_components/health-issue-forms";
import { RoutineActions } from "../_components/health-measurement-routine-forms";
import { RecordActions } from "../_components/health-record-forms";
import { HealthReportPanel } from "../_components/health-report-panel";
import { VitalActions } from "../_components/health-vital-forms";
import { healthFormLabels } from "../_lib/health-form-labels";
import { requireSession } from "../_lib/session";

export const metadata = { title: "Health & Fitness" };
export const dynamic = "force-dynamic";

/**
 * Health & Fitness (story 21-001): the domain's foundation. Appointments,
 * health issues, checkups and vitals are later stories (21-002 through
 * 21-008) — this Overview genuinely has nothing to show yet, so every
 * section says that honestly rather than inventing a figure (CLAUDE.md rule
 * 9). No health score anywhere on this screen: the spec is explicit that
 * this is not a fitness-surveillance product.
 */
export default async function HealthPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ tab }, session] = await Promise.all([searchParams, requireSession("/health")]);
  const { supabase, membership, view, viewer, secondary, locale } = session;
  const { t } = locale;
  const householdId = membership.household.id;
  const shell = {
    active: "more" as const,
    viewer,
    secondary,
    pathname: "/health",
    back: { href: "/more", label: t("common.back") },
    title: t("nav.item.health"),
  };

  if (view.tone === "child") {
    return (
      <AppShell {...shell}>
        <EmptyState icon={HeartPulse} tone="health" title={t("health.notAvailable")} description={t("health.notAvailableLede")} />
      </AppShell>
    );
  }

  const entitlement = await may(supabase, householdId, "health.tracking");
  if (!entitlement.allowed) {
    return (
      <AppShell {...shell}>
        <EmptyState icon={HeartPulse} tone="health" title={t("health.notInPlan")} description={entitlement.reason} />
      </AppShell>
    );
  }

  const active = tab === "privacy" ? "privacy" : "overview";
  const memberId = membership.memberId;

  const [profile, consents, members, appointments, issues, checkups, records, vitals, routines, fitnessGoals, fitnessSessions, householdConsents, guardedChildIds, recentReadings] = await Promise.all([
    getHealthProfile(supabase, householdId, memberId).catch(() => null),
    listHealthConsents(supabase, householdId, memberId).catch(() => []),
    listMembers(supabase, householdId, membership.household.ownerMemberId).catch(() => []),
    listAppointments(supabase, householdId).catch(() => []),
    listIssues(supabase, householdId).catch(() => []),
    listCheckups(supabase, householdId).catch(() => []),
    // Both statuses -- Recent is this entity's only home in the Overview
    // (see healthRecordsAgenda's own comment), so an archived record must
    // stay reachable here too, or "bring back" would have nowhere to live.
    listRecords(supabase, householdId, { statuses: ["active", "archived"] }).catch(() => []),
    listVitals(supabase, householdId, { statuses: ["active", "archived"] }).catch(() => []),
    listRoutines(supabase, householdId).catch(() => []),
    listFitnessGoals(supabase, householdId, { statuses: ["active", "dismissed"] }).catch(() => []),
    listFitnessSessions(supabase, householdId, { statuses: ["active", "archived"] }).catch(() => []),
    // Every sheet's "People I choose" list (the owner, 2026-10-21): the
    // sharing lists this session can read, and whose it may change.
    listHouseholdHealthConsents(supabase, householdId).catch(() => []),
    listGuardedChildIds(supabase, householdId, memberId),
    // What each attached report says (story 21-012); empty until the table reaches the project.
    listRecentReadings(supabase, householdId).catch(() => ({ available: false, readings: [] })),
  ]);

  // The sheets' words in the viewer's language; the vital and activity names
  // below are the same ones the sheets show, so a row and its sheet agree.
  const formLabels = healthFormLabels(t, locale.preferences.language);
  const nameOf = (id: string) => members.find((member) => member.id === id)?.displayName ?? t("health.someone");
  const vitalLabel = (item: { vitalType: keyof typeof formLabels.vitalTypes; customLabel: string | null }) =>
    item.vitalType === "custom" ? (item.customLabel ?? formLabels.vitalTypes.custom) : formLabels.vitalTypes[item.vitalType];
  const activityLabel = (item: { activityType: keyof typeof formLabels.activityTypes; customLabel: string | null }) =>
    item.activityType === "other" ? (item.customLabel ?? formLabels.activityTypes.other) : formLabels.activityTypes[item.activityType];
  const candidates = members
    .filter((member) => member.id !== memberId)
    .map((member) => ({ id: member.id, displayName: member.displayName }));
  const currentScope: PrivacyScope = profile?.privacyScope ?? "private";
  const aiAssistanceEnabled = profile?.aiAssistanceEnabled ?? true;

  const appointmentAgenda = healthAppointmentsAgenda(appointments, nameOf, membership.household.timezone);
  const issueAgenda = healthIssuesAgenda(issues, nameOf);
  const checkupAgenda = healthCheckupsAgenda(checkups, nameOf);
  const recordAgenda = healthRecordsAgenda(records, nameOf);
  const vitalAgenda = healthVitalsAgenda(vitals, nameOf);
  const routineAgenda = healthRoutinesAgenda(routines, nameOf);
  const fitnessGoalAgenda = healthFitnessGoalsAgenda(fitnessGoals, nameOf);
  const fitnessSessionAgenda = healthFitnessSessionsAgenda(fitnessSessions, nameOf);
  const appointmentById = new Map(appointments.map((appointment) => [appointment.id, appointment]));
  const issueById = new Map(issues.map((issue) => [issue.id, issue]));
  const checkupById = new Map(checkups.map((checkup) => [checkup.id, checkup]));
  const recordById = new Map(records.map((record) => [record.id, record]));
  const readingByRecord = latestByRecord(recentReadings.readings, records);
  const today = localMoment(new Date(), membership.household.timezone).dateKey;
  const vitalById = new Map(vitals.map((vital) => [vital.id, vital]));
  const routineById = new Map(routines.map((routine) => [routine.id, routine]));
  const fitnessGoalById = new Map(fitnessGoals.map((goal) => [goal.id, goal]));
  const fitnessSessionById = new Map(fitnessSessions.map((session) => [session.id, session]));
  const activeFitnessGoals = fitnessGoals
    .filter((goal) => goal.status === "active")
    .map((goal) => ({ id: goal.id, label: activityLabel(goal) }));
  const memberList = members.map((m) => ({ id: m.id, displayName: m.displayName }));
  const shareableSubjectIds = [memberId, ...guardedChildIds];
  const sharing: HealthSharing = {
    viewerMemberId: memberId,
    members: memberList,
    // Only the lists this viewer may change are shown, so only those are passed.
    viewersBySubject: viewersBySubject(householdConsents.filter((consent) => shareableSubjectIds.includes(consent.subjectMemberId))),
    shareableSubjectIds,
  };

  const sections = [
    {
      key: "attention",
      title: t("health.section.attention"),
      icon: HeartPulse,
      tone: "attention" as const,
      description: t("health.section.attentionLede"),
      items: [...appointmentAgenda.needsAttention, ...issueAgenda.needsAttention, ...checkupAgenda.needsAttention, ...routineAgenda.needsAttention],
    },
    {
      key: "coming_up",
      title: t("health.section.comingUp"),
      icon: CalendarClock,
      tone: "health" as const,
      description: t("health.section.comingUpLede"),
      items: [...appointmentAgenda.comingUp, ...checkupAgenda.comingUp, ...routineAgenda.comingUp],
    },
    {
      key: "monitoring",
      title: t("health.section.monitoring"),
      icon: Clock,
      tone: "care" as const,
      description: t("health.section.monitoringLede"),
      items: issueAgenda.monitoring,
    },
    {
      key: "recent",
      title: t("health.section.recent"),
      icon: CircleCheck,
      tone: "handled" as const,
      description: t("health.section.recentLede"),
      items: [...appointmentAgenda.recent, ...issueAgenda.recent, ...checkupAgenda.recent, ...recordAgenda, ...vitalAgenda, ...routineAgenda.recent, ...fitnessGoalAgenda, ...fitnessSessionAgenda],
    },
  ];

  return (
    <AppShell {...shell}>
      <HealthSharingProvider value={sharing}>
        <div className="space-y-5">
          <header className="wh-rise flex flex-wrap items-end justify-between gap-3">
            <div className="hidden lg:block">
              <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">{t("nav.item.health")}</h1>
              <p className="text-sm text-[var(--wh-foreground-muted)]">{t("health.lede")}</p>
            </div>
            {active === "overview" ? (
              // One Add for all eight kinds (the owner, 2026-10-21: "too many entry options"), grouped by what is being decided.
              <HealthAddMenu
                householdId={householdId}
                members={memberList}
                defaultPrivacyScope={currentScope}
                goals={activeFitnessGoals}
                labels={formLabels}
                words={{
                  label: t("healthForm.menu.label"),
                  title: t("healthForm.menu.title"),
                  description: t("healthForm.menu.description"),
                  groups: { health: t("healthForm.menu.group.health"), visits: t("healthForm.menu.group.visits"), fitness: t("healthForm.menu.group.fitness") },
                  meta: {
                    issue: t("healthForm.menu.meta.issue"),
                    vital: t("healthForm.menu.meta.vital"),
                    routine: t("healthForm.menu.meta.routine"),
                    record: t("healthForm.menu.meta.record"),
                    appointment: t("healthForm.menu.meta.appointment"),
                    checkup: t("healthForm.menu.meta.checkup"),
                    session: t("healthForm.menu.meta.session"),
                    goal: t("healthForm.menu.meta.goal"),
                  },
                }}
              />
            ) : null}
          </header>

          <SegmentedControl
            label={t("health.view")}
            active={active}
            segments={[
              { key: "overview", label: t("health.tab.overview"), href: "/health" },
              { key: "privacy", label: t("health.tab.privacy"), href: "/health?tab=privacy" },
            ]}
          />

          {active === "overview" ? (
            <>
              {sections.map((section) => (
                <section key={section.key}>
                  <SectionHeader title={section.title} count={section.items.length || undefined} />
                  {section.items.length === 0 ? (
                    <EmptyState icon={section.icon} tone={section.tone} title={t("health.emptyTitle")} description={section.description} />
                  ) : (
                    <Card className="p-2">
                      <ul className="divide-y divide-[var(--wh-border)]">
                        {section.items.map((item) => {
                          if (item.subjectKey.startsWith("checkup.")) {
                            const checkup = checkupById.get(item.subjectKey.replace("checkup.", ""));
                            return (
                              <ActionRow
                                key={item.subjectKey}
                                icon={section.icon}
                                tone={section.tone}
                                title={item.title}
                                meta={item.reason}
                                action={
                                  checkup && section.key !== "recent" ? (
                                    <CheckupActions householdId={householdId} checkup={checkup} members={memberList} defaultPrivacyScope={currentScope} labels={formLabels} />
                                  ) : null
                                }
                              />
                            );
                          }

                          if (item.subjectKey.startsWith("issue.")) {
                            const issue = issueById.get(item.subjectKey.replace("issue.", ""));
                            return (
                              <ActionRow
                                key={item.subjectKey}
                                icon={section.icon}
                                tone={section.tone}
                                title={item.title}
                                meta={item.reason}
                                action={
                                  issue && section.key !== "recent" ? (
                                    <div className="flex items-center gap-1.5">
                                      <IssueStatusActions householdId={householdId} issueId={issue.id} status={issue.status} labels={formLabels} />
                                      <EditIssueButton
                                        householdId={householdId}
                                        issueId={issue.id}
                                        label={issue.label}
                                        description={issue.description}
                                        notes={issue.notes}
                                        memberId={issue.memberId}
                                        privacyScope={issue.privacyScope}
                                        labels={formLabels}
                                      />
                                    </div>
                                  ) : null
                                }
                              />
                            );
                          }

                          if (item.subjectKey.startsWith("routine.")) {
                            const routine = routineById.get(item.subjectKey.replace("routine.", ""));
                            return (
                              <ActionRow
                                key={item.subjectKey}
                                icon={section.icon}
                                tone={section.tone}
                                title={item.title}
                                meta={item.reason}
                                action={
                                  // Normally silent history once in Recent, like
                                  // a checkup — except a dismissed routine with
                                  // no completion has no other home, so its
                                  // "Bring back" stays reachable here too.
                                  routine && (section.key !== "recent" || routine.status === "dismissed") ? (
                                    <RoutineActions householdId={householdId} routine={{ ...routine, label: vitalLabel(routine) }} labels={formLabels} />
                                  ) : null
                                }
                              />
                            );
                          }

                          if (item.subjectKey.startsWith("vital.")) {
                            // Vitals only ever live in "Recent" (a reading has
                            // no due date to be overdue against), so — like a
                            // record — its actions stay visible here: this is
                            // its only home, not a silent history of something
                            // that already happened elsewhere.
                            const vital = vitalById.get(item.subjectKey.replace("vital.", ""));
                            return (
                              <ActionRow
                                key={item.subjectKey}
                                icon={section.icon}
                                tone={section.tone}
                                title={item.title}
                                meta={item.reason}
                                action={
                                  vital ? (
                                    <VitalActions householdId={householdId} vital={{ ...vital, label: vitalLabel(vital) }} labels={formLabels} />
                                  ) : null
                                }
                              />
                            );
                          }

                          if (item.subjectKey.startsWith("fitness_goal.")) {
                            // A goal only ever lives in "Recent" (never scored,
                            // never escalated to Needs attention — story
                            // 21-008's own no-guilt-messaging rule), so its
                            // actions stay visible here: this is its only home.
                            const goal = fitnessGoalById.get(item.subjectKey.replace("fitness_goal.", ""));
                            return (
                              <ActionRow
                                key={item.subjectKey}
                                icon={section.icon}
                                tone={section.tone}
                                title={item.title}
                                meta={item.reason}
                                action={
                                  goal ? (
                                    <GoalActions
                                      householdId={householdId}
                                      goal={{
                                        id: goal.id,
                                        label: activityLabel(goal),
                                        targetCount: goal.targetCount,
                                        frequencyPeriod: goal.frequencyPeriod,
                                        notes: goal.notes,
                                        status: goal.status,
                                        memberId: goal.memberId,
                                        privacyScope: goal.privacyScope,
                                      }}
                                      labels={formLabels}
                                    />
                                  ) : null
                                }
                              />
                            );
                          }

                          if (item.subjectKey.startsWith("fitness_session.")) {
                            // A logged session only ever lives in "Recent" (a
                            // session has no due date to be overdue against),
                            // so its actions stay visible here too.
                            const fitnessSession = fitnessSessionById.get(item.subjectKey.replace("fitness_session.", ""));
                            return (
                              <ActionRow
                                key={item.subjectKey}
                                icon={section.icon}
                                tone={section.tone}
                                title={item.title}
                                meta={item.reason}
                                action={
                                  fitnessSession ? (
                                    <SessionActions
                                      householdId={householdId}
                                      session={{
                                        id: fitnessSession.id,
                                        label: activityLabel(fitnessSession),
                                        durationMinutes: fitnessSession.durationMinutes,
                                        distanceValue: fitnessSession.distanceValue,
                                        distanceUnit: fitnessSession.distanceUnit,
                                        notes: fitnessSession.notes,
                                        status: fitnessSession.status,
                                        memberId: fitnessSession.memberId,
                                        privacyScope: fitnessSession.privacyScope,
                                      }}
                                      labels={formLabels}
                                    />
                                  ) : null
                                }
                              />
                            );
                          }

                          if (item.subjectKey.startsWith("record.")) {
                            // Records only ever live in "Recent" (a filed
                            // document has no due date to be overdue against),
                            // so — unlike the other rows in this same section —
                            // its actions stay visible here: this is its only
                            // home, not a silent history of something that
                            // already happened elsewhere.
                            const record = recordById.get(item.subjectKey.replace("record.", ""));
                            if (!record) {
                              return <ActionRow key={item.subjectKey} icon={section.icon} tone={section.tone} title={item.title} meta={item.reason} />;
                            }
                            // Opens in place to its notes, its report and what the report says (rule 21, story 21-012).
                            const stored = readingByRecord.get(record.id);
                            return (
                              <ExpandableRow
                                key={item.subjectKey}
                                summary={
                                  <>
                                    <IconTile icon={section.icon} tone={section.tone} />
                                    <span className="min-w-0 flex-1">
                                      <span className="block text-sm font-medium break-words">{item.title}</span>
                                      <span className="block text-xs break-words text-[var(--wh-foreground-subtle)]">{item.reason}</span>
                                    </span>
                                  </>
                                }
                                trailing={<RecordActions householdId={householdId} record={record} labels={formLabels} />}
                              >
                                <HealthReportPanel
                                  householdId={householdId}
                                  record={{
                                    id: record.id,
                                    memberId: record.memberId,
                                    label: record.label,
                                    documentDate: record.documentDate,
                                    notes: record.notes,
                                    filePath: record.filePath,
                                    privacyScope: record.privacyScope,
                                  }}
                                  stored={stored ? { reading: stored.reading, readAt: stored.readAt } : null}
                                  canAsk={record.status === "active" && (record.memberId === memberId || guardedChildIds.includes(record.memberId))}
                                  today={today}
                                  language={locale.preferences.language}
                                  timeZone={membership.household.timezone}
                                  members={memberList}
                                  labels={formLabels}
                                />
                              </ExpandableRow>
                            );
                          }

                          const appointment = appointmentById.get(item.subjectKey.replace("appointment.", ""));
                          return (
                            <ActionRow
                              key={item.subjectKey}
                              icon={section.icon}
                              tone={section.tone}
                              title={item.title}
                              meta={item.reason}
                              action={
                                appointment && section.key !== "recent" ? (
                                  <AppointmentStatusActions householdId={householdId} appointmentId={appointment.id} status={appointment.status} labels={formLabels} />
                                ) : null
                              }
                            />
                          );
                        })}
                      </ul>
                    </Card>
                  )}
                </section>
              ))}
              <QuoteCard>{t("health.quote")}</QuoteCard>
            </>
          ) : (
            <>
              <Card className="space-y-4 p-4">
                <div className="flex items-start gap-3">
                  <Sparkles aria-hidden className="mt-0.5 size-5 shrink-0 text-[var(--wh-foreground-muted)]" />
                  <div>
                    <p className="text-sm font-medium">{t("health.privacy.title")}</p>
                    <p className="text-xs text-[var(--wh-foreground-subtle)]">{t("health.privacy.lede")}</p>
                  </div>
                </div>
                <PrivacyScopeForm householdId={householdId} memberId={memberId} currentScope={currentScope} labels={formLabels} />
              </Card>

              <Card className="p-4">
                <HealthAiAssistanceToggle householdId={householdId} memberId={memberId} enabled={aiAssistanceEnabled} labels={formLabels} />
              </Card>

              {currentScope === "selected_family" ? (
                <section>
                  <SectionHeader
                    title={t("health.sharedWith")}
                    count={consents.length}
                    action={<GrantHealthConsentButton householdId={householdId} subjectMemberId={memberId} candidates={candidates} labels={formLabels} />}
                  />
                  {consents.length === 0 ? (
                    <EmptyState
                      icon={ShieldCheck}
                      tone="health"
                      title={t("health.sharedEmptyTitle")}
                      description={t("health.sharedEmptyLede")}
                    />
                  ) : (
                    <Card className="p-2">
                      <ul className="divide-y divide-[var(--wh-border)]">
                        {consents.map((consent) => (
                          <ActionRow
                            key={consent.id}
                            icon={ShieldCheck}
                            tone="health"
                            title={nameOf(consent.viewerMemberId)}
                            meta={t("health.canSee")}
                            action={<RevokeHealthConsentButton householdId={householdId} consent={consent} viewerName={nameOf(consent.viewerMemberId)} labels={formLabels} />}
                          />
                        ))}
                      </ul>
                    </Card>
                  )}
                </section>
              ) : null}

              <Card className="flex items-start gap-3 p-4">
                <Wallet aria-hidden className="mt-0.5 size-5 shrink-0 text-[var(--wh-foreground-muted)]" />
                <p className="text-sm text-[var(--wh-foreground-muted)]">{t("health.guardianNote")}</p>
              </Card>
            </>
          )}
        </div>
      </HealthSharingProvider>
    </AppShell>
  );
}
