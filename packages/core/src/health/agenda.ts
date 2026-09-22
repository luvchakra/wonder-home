import { silent, type HomeAssessment } from "../home/assessment";
import type { AppointmentType, HealthAppointment } from "./appointments";

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
