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
import { healthAppointmentsAgenda, healthCheckupsAgenda, healthIssuesAgenda, healthRecordsAgenda, healthRoutinesAgenda, healthVitalsAgenda, VITAL_TYPE_LABEL } from "@wonderhome/core/health/agenda";
import { listCheckups } from "@wonderhome/core/health/checkups";
import { listIssues } from "@wonderhome/core/health/issues";
import { listRoutines } from "@wonderhome/core/health/measurement-routines";
import { listRecords } from "@wonderhome/core/health/records";
import { getHealthProfile, listHealthConsents, type PrivacyScope } from "@wonderhome/core/health/repository";
import { listVitals } from "@wonderhome/core/health/vitals";
import { listMembers } from "@wonderhome/core/identity/households";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Card } from "@wonderhome/core/ui/card";
import { ActionRow } from "@wonderhome/core/ui/action-row";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { SegmentedControl } from "@wonderhome/core/ui/segmented-control";
import { EmptyState } from "@wonderhome/core/ui/states";

import { AppointmentStatusActions, BookAppointmentButton } from "../_components/health-appointment-forms";
import { AddCheckupButton, CheckupActions } from "../_components/health-checkup-forms";
import {
  GrantHealthConsentButton,
  HealthAiAssistanceToggle,
  PrivacyScopeForm,
  RevokeHealthConsentButton,
} from "../_components/health-forms";
import { AddIssueButton, EditIssueButton, IssueStatusActions } from "../_components/health-issue-forms";
import { AddRoutineButton, RoutineActions } from "../_components/health-measurement-routine-forms";
import { AddRecordButton, RecordActions } from "../_components/health-record-forms";
import { AddVitalButton, VitalActions } from "../_components/health-vital-forms";
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
  const { supabase, membership, view, viewer, secondary } = session;
  const householdId = membership.household.id;
  const shell = {
    active: "more" as const,
    viewer,
    secondary,
    pathname: "/health",
    back: { href: "/more", label: "Back" },
    title: "Health & Fitness",
  };

  if (view.tone === "child") {
    return (
      <AppShell {...shell}>
        <EmptyState icon={HeartPulse} tone="health" title="Not available to you" description="Health & Fitness is for the adults in the household." />
      </AppShell>
    );
  }

  const entitlement = await may(supabase, householdId, "health.tracking");
  if (!entitlement.allowed) {
    return (
      <AppShell {...shell}>
        <EmptyState icon={HeartPulse} tone="health" title="Health & Fitness is not part of this plan" description={entitlement.reason} />
      </AppShell>
    );
  }

  const active = tab === "privacy" ? "privacy" : "overview";
  const memberId = membership.memberId;

  const [profile, consents, members, appointments, issues, checkups, records, vitals, routines] = await Promise.all([
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
  ]);

  const nameOf = (id: string) => members.find((member) => member.id === id)?.displayName ?? "Someone";
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
  const appointmentById = new Map(appointments.map((appointment) => [appointment.id, appointment]));
  const issueById = new Map(issues.map((issue) => [issue.id, issue]));
  const checkupById = new Map(checkups.map((checkup) => [checkup.id, checkup]));
  const recordById = new Map(records.map((record) => [record.id, record]));
  const vitalById = new Map(vitals.map((vital) => [vital.id, vital]));
  const routineById = new Map(routines.map((routine) => [routine.id, routine]));
  const memberList = members.map((m) => ({ id: m.id, displayName: m.displayName }));

  const sections = [
    {
      key: "attention",
      title: "Needs attention",
      icon: HeartPulse,
      tone: "attention" as const,
      description: "An overdue checkup, an unconfirmed appointment, something worth a look — none yet.",
      items: [...appointmentAgenda.needsAttention, ...issueAgenda.needsAttention, ...checkupAgenda.needsAttention, ...routineAgenda.needsAttention],
    },
    {
      key: "coming_up",
      title: "Coming up",
      icon: CalendarClock,
      tone: "health" as const,
      description: "Appointments and preventive care land here once you add them.",
      items: [...appointmentAgenda.comingUp, ...checkupAgenda.comingUp, ...routineAgenda.comingUp],
    },
    {
      key: "monitoring",
      title: "Monitoring",
      icon: Clock,
      tone: "care" as const,
      description: "A health issue you're keeping an eye on shows up here.",
      items: issueAgenda.monitoring,
    },
    {
      key: "recent",
      title: "Recent",
      icon: CircleCheck,
      tone: "handled" as const,
      description: "Nothing recorded yet.",
      items: [...appointmentAgenda.recent, ...issueAgenda.recent, ...checkupAgenda.recent, ...recordAgenda, ...vitalAgenda, ...routineAgenda.recent],
    },
  ];

  return (
    <AppShell {...shell}>
      <div className="space-y-5">
        <header className="wh-rise flex flex-wrap items-end justify-between gap-3">
          <div className="hidden lg:block">
            <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">Health &amp; Fitness</h1>
            <p className="text-sm text-[var(--wh-foreground-muted)]">Stay on top, without having to keep track of everything yourself.</p>
          </div>
          {active === "overview" ? (
            <div className="flex flex-wrap gap-2">
              <AddIssueButton householdId={householdId} members={memberList} defaultPrivacyScope={currentScope} />
              <AddCheckupButton householdId={householdId} members={memberList} defaultPrivacyScope={currentScope} />
              <AddVitalButton householdId={householdId} members={memberList} defaultPrivacyScope={currentScope} />
              <AddRoutineButton householdId={householdId} members={memberList} defaultPrivacyScope={currentScope} />
              <AddRecordButton householdId={householdId} members={memberList} defaultPrivacyScope={currentScope} />
              <BookAppointmentButton householdId={householdId} members={memberList} defaultPrivacyScope={currentScope} />
            </div>
          ) : null}
        </header>

        <SegmentedControl
          label="Health view"
          active={active}
          segments={[
            { key: "overview", label: "Overview", href: "/health" },
            { key: "privacy", label: "Privacy", href: "/health?tab=privacy" },
          ]}
        />

        {active === "overview" ? (
          <>
            {sections.map((section) => (
              <section key={section.key}>
                <SectionHeader title={section.title} count={section.items.length || undefined} />
                {section.items.length === 0 ? (
                  <EmptyState icon={section.icon} tone={section.tone} title="Nothing here yet" description={section.description} />
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
                                  <CheckupActions householdId={householdId} checkup={checkup} members={memberList} defaultPrivacyScope={currentScope} />
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
                                    <IssueStatusActions householdId={householdId} issueId={issue.id} status={issue.status} />
                                    <EditIssueButton householdId={householdId} issueId={issue.id} label={issue.label} description={issue.description} notes={issue.notes} />
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
                                  <RoutineActions
                                    householdId={householdId}
                                    routine={{ ...routine, label: routine.vitalType === "custom" ? (routine.customLabel ?? "Measurement") : VITAL_TYPE_LABEL[routine.vitalType] }}
                                  />
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
                                  <VitalActions
                                    householdId={householdId}
                                    vital={{ ...vital, label: vital.vitalType === "custom" ? (vital.customLabel ?? "Measurement") : VITAL_TYPE_LABEL[vital.vitalType] }}
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
                          return (
                            <ActionRow
                              key={item.subjectKey}
                              icon={section.icon}
                              tone={section.tone}
                              title={item.title}
                              meta={item.reason}
                              action={record ? <RecordActions householdId={householdId} record={record} /> : null}
                            />
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
                                <AppointmentStatusActions householdId={householdId} appointmentId={appointment.id} status={appointment.status} />
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
            <QuoteCard>Less to remember. More time for what matters.</QuoteCard>
          </>
        ) : (
          <>
            <Card className="space-y-4 p-4">
              <div className="flex items-start gap-3">
                <Sparkles aria-hidden className="mt-0.5 size-5 shrink-0 text-[var(--wh-foreground-muted)]" />
                <div>
                  <p className="text-sm font-medium">Your health privacy</p>
                  <p className="text-xs text-[var(--wh-foreground-subtle)]">
                    Household membership alone never gives anyone access to your health data — you decide who can see it.
                  </p>
                </div>
              </div>
              <PrivacyScopeForm householdId={householdId} memberId={memberId} currentScope={currentScope} />
            </Card>

            <Card className="p-4">
              <HealthAiAssistanceToggle householdId={householdId} memberId={memberId} enabled={aiAssistanceEnabled} />
            </Card>

            {currentScope === "selected_family" ? (
              <section>
                <SectionHeader
                  title="Shared with"
                  count={consents.length}
                  action={<GrantHealthConsentButton householdId={householdId} subjectMemberId={memberId} candidates={candidates} />}
                />
                {consents.length === 0 ? (
                  <EmptyState
                    icon={ShieldCheck}
                    tone="health"
                    title="Not shared with anyone yet"
                    description={'Choose "People I choose" and share it with whoever should see it.'}
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
                          meta="Can see your health data"
                          action={<RevokeHealthConsentButton householdId={householdId} consent={consent} viewerName={nameOf(consent.viewerMemberId)} />}
                        />
                      ))}
                    </ul>
                  </Card>
                )}
              </section>
            ) : null}

            <Card className="flex items-start gap-3 p-4">
              <Wallet aria-hidden className="mt-0.5 size-5 shrink-0 text-[var(--wh-foreground-muted)]" />
              <p className="text-sm text-[var(--wh-foreground-muted)]">
                A guardian can always see and manage a child they guard&apos;s health data, whatever privacy setting is chosen for it.
              </p>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
