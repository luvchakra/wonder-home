import { silent, type HomeAssessment } from "../home/assessment";
import type { AppointmentType, HealthAppointment } from "./appointments";
import { classifyCheckup, type CheckupType, type HealthCheckup } from "./checkups";
import { assessForMedicalAttention } from "./issue-safety";
import type { HealthIssue } from "./issues";
import { classifyRoutine, type MeasurementRoutine, type VitalType } from "./measurement-routines";
import type { HealthRecord, RecordType } from "./records";
import { describeVitalTrend, summarizeVitalTrend, type HealthVital } from "./vitals";

/**
 * Appointments as the Overview screen's rows (story 21-002) — the same
 * `HomeAssessment` shape every other domain already renders through
 * `AgendaExpandableRow`, so this screen does not invent its own row.
 */

const TYPE_LABEL: Record<AppointmentType, string> = {
  doctor: "Doctor",
  dentist: "Dentist",
  eye_care: "Eye care",
  physiotherapy: "Physiotherapy",
  dermatology: "Dermatology",
  specialist: "Specialist",
  diagnostic: "Diagnostic",
  vaccination: "Vaccination",
  mental_wellness: "Mental wellness",
  other: "Appointment",
};

function formatWhen(startsAt: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: timezone }).format(new Date(startsAt));
  } catch {
    return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(startsAt));
  }
}

function toAssessment(appointment: HealthAppointment, memberName: string, timezone: string): HomeAssessment {
  const typeLabel = TYPE_LABEL[appointment.appointmentType];
  const when = formatWhen(appointment.startsAt, timezone);

  if (appointment.status === "proposed") {
    return {
      subjectKey: `appointment.${appointment.id}`,
      title: `${memberName} — ${typeLabel}`,
      status: "pending",
      riskLevel: "low",
      notable: true,
      reason: `${memberName} — ${typeLabel}, not yet confirmed for ${when}.`,
      action: { action: "confirm_appointment" },
      dueOn: appointment.startsAt.slice(0, 10),
    };
  }

  return {
    subjectKey: `appointment.${appointment.id}`,
    title: `${memberName} — ${typeLabel}`,
    status: "on_track",
    riskLevel: "none",
    notable: true,
    reason: `${memberName} — ${typeLabel}, ${when}.`,
    action: null,
    dueOn: appointment.startsAt.slice(0, 10),
  };
}

export type HealthAppointmentsAgenda = {
  needsAttention: HomeAssessment[];
  comingUp: HomeAssessment[];
  recent: HomeAssessment[];
};

export function healthAppointmentsAgenda(
  appointments: readonly HealthAppointment[],
  nameOf: (memberId: string) => string,
  timezone: string,
): HealthAppointmentsAgenda {
  const needsAttention = appointments.filter((a) => a.status === "proposed").map((a) => toAssessment(a, nameOf(a.memberId), timezone));
  const comingUp = appointments.filter((a) => a.status === "confirmed").map((a) => toAssessment(a, nameOf(a.memberId), timezone));
  const recent = appointments
    .filter((a) => a.status === "completed" || a.status === "cancelled")
    .slice(0, 5)
    .map((a) => ({
      ...silent(`appointment.${a.id}`, `${nameOf(a.memberId)} — ${TYPE_LABEL[a.appointmentType]}`, a.status === "completed" ? "Completed." : "Cancelled."),
      status: a.status === "completed" ? "met" : "cancelled",
    })) as HomeAssessment[];

  return { needsAttention, comingUp, recent };
}

/**
 * Health issues (story 21-003) as the same Overview rows — active/mentioned
 * ones in "Needs attention", monitoring in its own section, resolved/closed
 * in "Recent". Never a flat list: the reader thinks in terms of what still
 * needs them, not creation order.
 */
function issueToAssessment(issue: HealthIssue, memberName: string): HomeAssessment {
  const medicalAttention = assessForMedicalAttention(issue.label, issue.description, issue.notes);
  const reason = medicalAttention.recommend
    ? `${memberName} — ${issue.label}. ${medicalAttention.message}`
    : `${memberName} — ${issue.label}${issue.description ? `: ${issue.description}` : "."}`;

  return {
    subjectKey: `issue.${issue.id}`,
    title: `${memberName} — ${issue.label}`,
    status: medicalAttention.recommend ? "at_risk" : "pending",
    riskLevel: medicalAttention.recommend ? "high" : "low",
    notable: true,
    reason,
    action: null,
    dueOn: null,
  };
}

export type HealthIssuesAgenda = {
  needsAttention: HomeAssessment[];
  monitoring: HomeAssessment[];
  recent: HomeAssessment[];
};

export function healthIssuesAgenda(issues: readonly HealthIssue[], nameOf: (memberId: string) => string): HealthIssuesAgenda {
  const needsAttention = issues.filter((i) => i.status === "mentioned" || i.status === "active").map((i) => issueToAssessment(i, nameOf(i.memberId)));
  const monitoring = issues.filter((i) => i.status === "monitoring").map((i) => issueToAssessment(i, nameOf(i.memberId)));
  const recent = issues
    .filter((i) => i.status === "resolved" || i.status === "closed")
    .slice(0, 5)
    .map((i) => ({
      ...silent(`issue.${i.id}`, `${nameOf(i.memberId)} — ${i.label}`, i.status === "resolved" ? "Resolved." : "Closed."),
      status: "met",
    })) as HomeAssessment[];

  return { needsAttention, monitoring, recent };
}

/**
 * Checkups (story 21-004) as the same Overview rows — overdue in "Needs
 * attention", due soon in "Coming up" alongside confirmed appointments, a
 * recent completion in "Recent". A checkup that is neither due nor overdue
 * is silent, per the story's own acceptance criterion — `classifyCheckup`
 * is the one place that decides, so the Overview never invents its own
 * notion of "due soon".
 */
const CHECKUP_TYPE_LABEL: Record<CheckupType, string> = {
  doctor: "Doctor",
  dentist: "Dentist",
  eye_care: "Eye care",
  physiotherapy: "Physiotherapy",
  dermatology: "Dermatology",
  specialist: "Specialist",
  diagnostic: "Diagnostic",
  vaccination: "Vaccination",
  screening: "Screening",
  other: "Checkup",
};

function formatDueDate(dueOn: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(`${dueOn}T00:00:00Z`));
  } catch {
    return dueOn;
  }
}

function checkupToAssessment(checkup: HealthCheckup, memberName: string, urgency: "overdue" | "due_soon"): HomeAssessment {
  const when = formatDueDate(checkup.nextDueOn);
  const reason =
    urgency === "overdue"
      ? `${memberName} — ${checkup.label}, was due ${when}.`
      : `${memberName} — ${checkup.label}, due ${when}.`;

  return {
    subjectKey: `checkup.${checkup.id}`,
    title: `${memberName} — ${checkup.label}`,
    status: urgency === "overdue" ? "at_risk" : "pending",
    riskLevel: urgency === "overdue" ? "medium" : "low",
    notable: true,
    reason,
    action: null,
    dueOn: checkup.nextDueOn,
  };
}

export type HealthCheckupsAgenda = {
  needsAttention: HomeAssessment[];
  comingUp: HomeAssessment[];
  recent: HomeAssessment[];
};

export function healthCheckupsAgenda(checkups: readonly HealthCheckup[], nameOf: (memberId: string) => string, today: Date = new Date()): HealthCheckupsAgenda {
  const needsAttention: HomeAssessment[] = [];
  const comingUp: HomeAssessment[] = [];

  for (const checkup of checkups) {
    const urgency = classifyCheckup(checkup, today);
    if (urgency === "overdue") needsAttention.push(checkupToAssessment(checkup, nameOf(checkup.memberId), "overdue"));
    else if (urgency === "due_soon") comingUp.push(checkupToAssessment(checkup, nameOf(checkup.memberId), "due_soon"));
  }

  const recent = checkups
    .filter((c) => c.lastCompletedOn)
    .sort((a, b) => (b.lastCompletedOn ?? "").localeCompare(a.lastCompletedOn ?? ""))
    .slice(0, 5)
    .map((c) =>
      silent(`checkup.${c.id}`, `${nameOf(c.memberId)} — ${CHECKUP_TYPE_LABEL[c.checkupType]}`, `${c.label} completed ${c.lastCompletedOn ? formatDueDate(c.lastCompletedOn) : ""}.`),
    );

  return { needsAttention, comingUp, recent };
}

/**
 * Records (story 21-005) as Overview rows — a filed document never needs
 * attention or comes up on its own, so this only ever feeds "Recent",
 * newest first. Includes archived records too (not just active): Recent is
 * a record's only home anywhere in this Overview, so an archived one has to
 * stay reachable here for "bring back" to mean anything (CLAUDE.md rule 12).
 */
const RECORD_TYPE_LABEL: Record<RecordType, string> = {
  lab_result: "Lab result",
  prescription: "Prescription",
  imaging_report: "Imaging report",
  vaccination_certificate: "Vaccination certificate",
  discharge_summary: "Discharge summary",
  referral: "Referral",
  insurance_document: "Insurance document",
  visit_summary: "Visit summary",
  other: "Document",
};

export function healthRecordsAgenda(records: readonly HealthRecord[], nameOf: (memberId: string) => string): HomeAssessment[] {
  return records
    .slice(0, 5)
    .map((r) => {
      const reason = `${RECORD_TYPE_LABEL[r.recordType]}${r.documentDate ? `, ${formatDueDate(r.documentDate)}` : ""}${r.status === "archived" ? " — removed." : "."}`;
      return silent(`record.${r.id}`, `${nameOf(r.memberId)} — ${r.label}`, reason);
    });
}

/**
 * Vitals (story 21-007) as Overview rows — a reading never needs attention
 * on its own, so this only ever feeds "Recent", newest first. When a
 * reading has company (more than one of the same measurement for the same
 * person), the row's reason adds the same verifiable arithmetic the Vitals
 * detail view shows (`describeVitalTrend`) — never a stated conclusion
 * about what the numbers mean.
 */
export const VITAL_TYPE_LABEL: Record<VitalType, string> = {
  weight: "Weight",
  height: "Height",
  temperature: "Temperature",
  blood_pressure: "Blood pressure",
  pulse: "Pulse",
  steps: "Steps",
  distance: "Distance",
  exercise_duration: "Exercise duration",
  resting_heart_rate: "Resting heart rate",
  custom: "Measurement",
};

function vitalLabel(vital: Pick<HealthVital, "vitalType" | "customLabel">): string {
  return vital.vitalType === "custom" ? (vital.customLabel ?? "Measurement") : VITAL_TYPE_LABEL[vital.vitalType];
}

function formatVitalValue(vital: HealthVital): string {
  return vital.vitalType === "blood_pressure" && vital.secondaryValue !== null ? `${vital.value}/${vital.secondaryValue} ${vital.unit}` : `${vital.value} ${vital.unit}`;
}

export function healthVitalsAgenda(vitals: readonly HealthVital[], nameOf: (memberId: string) => string): HomeAssessment[] {
  const groupKey = (v: HealthVital) => `${v.memberId}:${v.vitalType}:${v.customLabel ?? ""}`;
  const groups = new Map<string, HealthVital[]>();
  for (const vital of vitals) {
    const key = groupKey(vital);
    const list = groups.get(key) ?? [];
    list.push(vital);
    groups.set(key, list);
  }

  return vitals.slice(0, 5).map((vital) => {
    const group = groups.get(groupKey(vital)) ?? [vital];
    const trend = group.length > 1 ? describeVitalTrend(summarizeVitalTrend(group)) : null;
    const when = formatDueDate(vital.measuredAt.slice(0, 10));
    const reason = `${formatVitalValue(vital)}, ${when}.${trend ? ` ${trend}` : ""}${vital.status === "archived" ? " — removed." : ""}`;
    return silent(`vital.${vital.id}`, `${nameOf(vital.memberId)} — ${vitalLabel(vital)}`, reason);
  });
}

/**
 * Measurement routines (story 21-007) as Overview rows — the same
 * overdue/due-soon/silent discipline `classifyCheckup` already established,
 * via `classifyRoutine`.
 */
function routineToAssessment(routine: MeasurementRoutine, memberName: string, urgency: "overdue" | "due_soon"): HomeAssessment {
  const when = formatDueDate(routine.nextDueOn);
  const label = vitalLabel(routine);
  const reason = urgency === "overdue" ? `${memberName} — ${label}, was due ${when}.` : `${memberName} — ${label}, due ${when}.`;

  return {
    subjectKey: `routine.${routine.id}`,
    title: `${memberName} — ${label}`,
    status: urgency === "overdue" ? "at_risk" : "pending",
    riskLevel: urgency === "overdue" ? "medium" : "low",
    notable: true,
    reason,
    action: null,
    dueOn: routine.nextDueOn,
  };
}

export type HealthRoutinesAgenda = {
  needsAttention: HomeAssessment[];
  comingUp: HomeAssessment[];
  recent: HomeAssessment[];
};

export function healthRoutinesAgenda(routines: readonly MeasurementRoutine[], nameOf: (memberId: string) => string, today: Date = new Date()): HealthRoutinesAgenda {
  const needsAttention: HomeAssessment[] = [];
  const comingUp: HomeAssessment[] = [];

  for (const routine of routines) {
    const urgency = classifyRoutine(routine, today);
    if (urgency === "overdue") needsAttention.push(routineToAssessment(routine, nameOf(routine.memberId), "overdue"));
    else if (urgency === "due_soon") comingUp.push(routineToAssessment(routine, nameOf(routine.memberId), "due_soon"));
  }

  const recent = routines
    // A completed routine's history lands here, and so does a dismissed one
    // that was never completed — otherwise it has no home anywhere on this
    // page and "bring back" would be unreachable (CLAUDE.md rule 12).
    .filter((r) => r.lastCompletedOn || r.status === "dismissed")
    .sort((a, b) => (b.lastCompletedOn ?? b.createdAt).localeCompare(a.lastCompletedOn ?? a.createdAt))
    .slice(0, 5)
    .map((r) =>
      silent(
        `routine.${r.id}`,
        `${nameOf(r.memberId)} — ${vitalLabel(r)}`,
        r.lastCompletedOn ? `Measured ${formatDueDate(r.lastCompletedOn)}.` : "Removed.",
      ),
    );

  return { needsAttention, comingUp, recent };
}
