import type { HouseholdIntent } from "./intent";
import { APPOINTMENT_TYPES, type AppointmentType } from "../health/appointments";
import { matchAppointmentType } from "./rules";
import { SPOKEN_DAY_PHRASE } from "./temporal";
import { TIME_PHRASE } from "./time-of-day";

/**
 * "Add a reminder for tomorrow doctor appointment at 1 o'clock" is a doctor's
 * appointment, said as a reminder (the owner's example, 2026-11-20). It is
 * recorded where appointments live — Health, for the speaker, private — whose
 * own reminders already follow the policy (`health/reminders.ts`: the evening
 * before and on the morning of the day), instead of a bare reminder that goes
 * off at the appointment's own time, or a question.
 *
 * Only a health appointment of the speaker's own with a day and a time: one
 * for someone else named ("Asmi's dentist", "for mom") stays a reminder (who a
 * health record is for is never assumed), and a reminder to do something about
 * an appointment ("remind me to book the dentist") stays a reminder.
 *
 * Pure: it only re-reads an understanding the way the rules would; grounding,
 * consent ("Wait for review" for health) and the governed health service still
 * decide everything after it.
 */

/** "appointment" as typed and as dictation hears it ("apartment", "apointment", "appt"). */
const APPOINTMENT_WORDS = /\b(?:appointments?|appt\.?|apointment|appoinment|appointmnt|apartment|check-?up|consultation|visit)\b/i;
const HEALTH_WORDS = /\b(?:doctor|docter|doc|doctor's|dr\.?|gp|dentist|dentist's|dental|eye|physio\w*|derma\w*|skin|therap\w*|counsel\w*|psych\w*|vaccin\w*|scan|x-?ray|blood test|lab test|paediatrician|pediatrician|gyn\w*|ent|ortho\w*|clinic|hospital)\b/i;
/** Doing something about an appointment is a reminder to do it, not the appointment. */
const ABOUT_IT = /^(?:to\s+)?(?:book|call|ring|phone|schedule|reschedule|cancel|confirm|fix|make|get|take|send|pay|ask|message|email|whatsapp|text)\b/i;
/** Someone other than the speaker named. */
const SOMEONE_ELSE = /\b(?!(?:doctor|dentist|dr|gp|it|that|what|there|here|he|she|let|who|today|tomorrow|tonight)'s\b)[a-z]+'s\b|\bfor\s+(?!me\b|myself\b|tomorrow\b|today\b|tonight\b|the\b|an?\b|my\s+(?:doctor|dentist|own)\b|(?:mon|tues|wednes|thurs|fri|satur|sun)day\b|next\b|this\b|\d)\w+|\b(?:his|her|their)\b/i;

const SAID_DAY = new RegExp(`\\b(${SPOKEN_DAY_PHRASE})\\b`, "i");
const SAID_TIME = new RegExp(`\\b(?:at|@|by)\\s+(${TIME_PHRASE})(?![\\w:])`, "i");
const BARE_TIME = new RegExp(`\\b(\\d{1,2}(?:[:.]\\d{2})?\\s*(?:o'?\\s?clock|a\\.?m\\.?|p\\.?m\\.?)|noon)(?![\\w:])`, "i");

export function appointmentFromReminder(intent: HouseholdIntent): HouseholdIntent {
  if (intent.action !== "set_reminder") return intent;
  const what = typeof intent.parameters.what === "string" ? intent.parameters.what : "";
  const said = intent.utterance ?? "";
  const subject = what || said;
  if (!APPOINTMENT_WORDS.test(subject) && !/\b(?:doctor|docter|dentist)\b/i.test(subject)) return intent;
  if (!HEALTH_WORDS.test(subject) || ABOUT_IT.test(what.trim())) return intent;
  if (SOMEONE_ELSE.test(said.replace(/\breminder for\b/i, "reminder"))) return intent;
  const appointmentType = appointmentTypeOf(subject);
  if (appointmentType === "other" && !/\b(?:clinic|hospital|paediatrician|pediatrician|gyn\w*|ent|ortho\w*)\b/i.test(subject)) return intent;

  const when = nonEmpty(intent.parameters.when) ?? SAID_DAY.exec(said)?.[1]?.toLowerCase() ?? null;
  const time = nonEmpty(intent.parameters.time) ?? (SAID_TIME.exec(said)?.[1] ?? BARE_TIME.exec(said)?.[1] ?? null)?.toLowerCase() ?? null;
  if (!when || !time) return intent;

  return {
    ...intent,
    action: "record_health_appointment",
    target: { kind: "member", reference: "self" },
    parameters: { typeText: typeTextOf(subject, appointmentType), appointmentType, when, time, saidAsReminder: true },
  };
}

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null;
}

/** "doctor", "dentist", "eye" — the words the reply names it by. */
function typeTextOf(subject: string, type: string): string {
  if (type === "doctor" && /\b(?:dr\.?|doc|docter)(?=\s|$)/i.test(subject) && !/\bdoctor\b/i.test(subject)) return "doctor";
  const named = /\b(doctor|dentist|dental|eye|physio\w*|derma\w*|skin|vaccination|blood test|scan|paediatrician|pediatrician|ent|ortho\w*|gyn\w*)\b/i.exec(subject);
  return named ? named[1]!.toLowerCase() : type.replace(/_/g, " ");
}

/** The appointment type, reading "Dr", "doc" and "docter" as the doctor (dictation, 2026-11-20). */
export function appointmentTypeOf(text: string): AppointmentType {
  const type = matchAppointmentType(text);
  if (type !== "other") return type;
  return /\b(?:dr\.?|doc|docter)(?=\s|$)/i.test(text) ? "doctor" : "other";
}

/**
 * Any reading of a health appointment, the model's or the rules', made whole
 * before anything is decided (the owner, 2026-11-20, "add a reminder for
 * tomorrow Dr apartment at 1 o'clock" was held as "book a Dr apartment
 * appointment" and then could not be done): its type is read from its words
 * ("Dr apartment" is the doctor); one that is not a health appointment at all
 * ("bank appointment") is the reminder the person asked for, with their own
 * words, day and time. Never a booking: recording an appointment books
 * nothing with anyone.
 */
export function settleAppointment(intent: HouseholdIntent): HouseholdIntent {
  if (intent.action !== "record_health_appointment") return intent;
  const said = [intent.parameters.typeText, intent.parameters.what, intent.utterance].filter((value): value is string => typeof value === "string").join(" ");
  const given = typeof intent.parameters.appointmentType === "string" && (APPOINTMENT_TYPES as readonly string[]).includes(intent.parameters.appointmentType) && intent.parameters.appointmentType !== "other" ? (intent.parameters.appointmentType as AppointmentType) : null;
  const type = given ?? appointmentTypeOf(said);
  const typeText = typeof intent.parameters.typeText === "string" && intent.parameters.typeText.trim() ? intent.parameters.typeText.trim() : null;
  // Someone else's appointment is never filed as a health record by assumption (the executor files for the speaker): a reminder.
  const named = intent.target.kind === "member" && typeof intent.target.reference === "string" && !/^(?:self|me|myself|i|you)$/i.test(intent.target.reference.trim());
  const someoneElse = named || SOMEONE_ELSE.test((intent.utterance ?? "").replace(/\breminder for\b/i, "reminder"));
  if ((type === "other" && !HEALTH_WORDS.test(said)) || someoneElse) {
    const base = typeof intent.parameters.what === "string" && intent.parameters.what.trim() ? intent.parameters.what.trim() : typeText ? `${typeText.replace(/\s+(?:appointments?|appt\.?|apointment|appoinment|appointmnt|apartment)$/i, "")} appointment` : "appointment";
    const whose = named ? String(intent.target.reference) : /\b([a-z]+)'s\b/i.exec((intent.utterance ?? "").replace(/\b(?:doctor|dentist|dr|gp|it|that|what|there|here|he|she|let|who|today|tomorrow|tonight)'s\b/gi, ""))?.[1] ?? null;
    const what = whose && !base.toLowerCase().includes(whose.toLowerCase()) ? `${whose.charAt(0).toUpperCase()}${whose.slice(1)}'s ${base}` : base;
    const parameters: Record<string, unknown> = { what };
    if (typeof intent.parameters.when === "string") parameters.when = intent.parameters.when;
    if (typeof intent.parameters.time === "string") parameters.time = intent.parameters.time;
    return { ...intent, action: "set_reminder", target: { kind: "outcome", reference: "reminders" }, parameters };
  }
  const cleanText = typeText ? typeText.replace(/\s+(?:appointments?|appt\.?|apointment|appoinment|appointmnt|apartment)$/i, "").replace(/^(?:dr\.?|doc|docter)$/i, "doctor") : typeTextOf(said, type);
  // The speaker's own unless someone was named: a model may leave the target unspecified.
  const target = intent.target.kind === "unspecified" || !intent.target.reference ? { kind: "member" as const, reference: "self" } : intent.target;
  return { ...intent, target, parameters: { ...intent.parameters, appointmentType: type, typeText: cleanText || typeTextOf(said, type) } };
}
