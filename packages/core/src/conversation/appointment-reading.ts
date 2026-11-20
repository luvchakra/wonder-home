import type { HouseholdIntent } from "./intent";
import { matchAppointmentType } from "./rules";
import { TEMPORAL_PHRASE } from "./temporal";
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

const APPOINTMENT_WORDS = /\b(?:appointment|appt|check-?up|consultation|visit)\b/i;
const HEALTH_WORDS = /\b(?:doctor|doctor's|dr|gp|dentist|dentist's|dental|eye|physio\w*|derma\w*|skin|therap\w*|counsel\w*|psych\w*|vaccin\w*|scan|x-?ray|blood test|lab test|paediatrician|pediatrician|gyn\w*|ent|ortho\w*|clinic|hospital)\b/i;
/** Doing something about an appointment is a reminder to do it, not the appointment. */
const ABOUT_IT = /^(?:to\s+)?(?:book|call|ring|phone|schedule|reschedule|cancel|confirm|fix|make|get|take|send|pay|ask|message|email|whatsapp|text)\b/i;
/** Someone other than the speaker named. */
const SOMEONE_ELSE = /\b(?!(?:doctor|dentist|dr|gp)'s\b)[a-z]+'s\b|\bfor\s+(?!me\b|myself\b|tomorrow\b|today\b|tonight\b|the\b|an?\b|my\s+(?:doctor|dentist|own)\b|(?:mon|tues|wednes|thurs|fri|satur|sun)day\b|next\b|this\b|\d)\w+|\b(?:his|her|their)\b/i;

const SAID_DAY = new RegExp(`\\b(${TEMPORAL_PHRASE})\\b`, "i");
const SAID_TIME = new RegExp(`\\b(?:at|@|by)\\s+(${TIME_PHRASE})(?![\\w:])`, "i");
const BARE_TIME = new RegExp(`\\b(\\d{1,2}(?:[:.]\\d{2})?\\s*(?:o'?\\s?clock|a\\.?m\\.?|p\\.?m\\.?)|noon)(?![\\w:])`, "i");

export function appointmentFromReminder(intent: HouseholdIntent): HouseholdIntent {
  if (intent.action !== "set_reminder") return intent;
  const what = typeof intent.parameters.what === "string" ? intent.parameters.what : "";
  const said = intent.utterance ?? "";
  const subject = what || said;
  if (!APPOINTMENT_WORDS.test(subject) && !/\b(?:doctor|dentist)\b/i.test(subject)) return intent;
  if (!HEALTH_WORDS.test(subject) || ABOUT_IT.test(what.trim())) return intent;
  if (SOMEONE_ELSE.test(said.replace(/\breminder for\b/i, "reminder"))) return intent;
  const appointmentType = matchAppointmentType(subject);
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
  const named = /\b(doctor|dentist|dental|eye|physio\w*|derma\w*|skin|vaccination|blood test|scan|paediatrician|pediatrician|ent|ortho\w*|gyn\w*)\b/i.exec(subject);
  return named ? named[1]!.toLowerCase() : type.replace(/_/g, " ");
}
