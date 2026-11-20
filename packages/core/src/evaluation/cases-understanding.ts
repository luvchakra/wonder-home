import type { HomeTalkCase } from "./types";

/**
 * HomeTalk understanding, the owner's review of 20 Nov 2026 ("I have given
 * clear instruction … but it's asking questions which it should not ask").
 * Sentences typed and spoken the way people do; each says what a sensible
 * person expects recorded and whether a question is justified. The golden
 * clock is Wed 23 Sep 2026, 10:00 in Kolkata: "tomorrow" is 2026-09-24.
 * HT-300 onwards.
 */
export const UNDERSTANDING: HomeTalkCase[] = [
  {
    id: "HT-300", surface: "hometalk", household: "A", category: "time_date", actor: "a-kunal",
    description: "The owner's sentence, word for word: a doctor's appointment tomorrow at 1pm, recorded in Health with its own reminders, never \"what time?\".",
    utterance: "add a reminder for tomorrow doctor appointment at 1 o'clock",
    expected: { interpretation: "record_health_appointment", date: "2026-09-24", time: "13:00", action: "executed", answer: { excludes: ["What time", "When should"] } },
  },
  {
    id: "HT-301", surface: "hometalk", household: "A", category: "time_date", actor: "a-kunal", channel: "voice",
    description: "The same sentence spoken: no punctuation, \"one o clock\".",
    utterance: "add a reminder for tomorrow doctor appointment at one o clock",
    expected: { interpretation: "record_health_appointment", date: "2026-09-24", time: "13:00", action: "executed" },
  },
  {
    id: "HT-302", surface: "hometalk", household: "A", category: "time_date", actor: "a-kunal",
    description: "Any reminder with its day and time inside it: set for that day and time, the half of the day chosen and said, no question.",
    utterance: "add a reminder for tomorrow parents meeting at 5",
    expected: { interpretation: "set_reminder", date: "2026-09-24", time: "17:00", action: "executed", answer: { includes: ["parents meeting", "5pm"] } },
  },
  {
    id: "HT-303", surface: "hometalk", household: "A", category: "time_date", actor: "a-kunal",
    description: "\"Half past 6\" is a time: the reminder goes off then.",
    utterance: "remind me to call mom tomorrow at half past 6",
    expected: { interpretation: "set_reminder", date: "2026-09-24", time: "18:30", action: "executed" },
  },
  {
    id: "HT-304", surface: "hometalk", household: "A", category: "privacy", actor: "a-kunal",
    description: "Someone else's appointment is never filed as a health record by assumption: it stays a reminder for the speaker.",
    utterance: "add reminder for Asmi's dentist appointment tomorrow at 4",
    expected: { interpretation: "set_reminder", date: "2026-09-24", time: "16:00", action: "executed" },
  },
];
