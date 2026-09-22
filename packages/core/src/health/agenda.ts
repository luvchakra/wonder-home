import { silent, type HomeAssessment } from "../home/assessment";
import type { AppointmentType, HealthAppointment } from "./appointments";
import { classifyCheckup, type CheckupType, type HealthCheckup } from "./checkups";
import { assessForMedicalAttention } from "./issue-safety";
import type { HealthIssue } from "./issues";

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
