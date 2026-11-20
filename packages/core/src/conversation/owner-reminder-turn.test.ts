import { describe, expect, it } from "vitest";

import { choicesFor, asksForTime } from "../hometalk/choices";
import { en } from "../i18n/messages/en";
import { translator } from "../i18n/translate";
import { appointmentFromReminder } from "./appointment-reading";
import type { PendingClarification } from "./clarify";
import { converse, type TurnInput } from "./engine";
import { groundIntent } from "./grounding";
import type { HouseholdIntent } from "./intent";
import { NO_REFERENCES } from "./references";
import { reminderMoment } from "./reminder-time";
import { readTimeOfDay } from "./time-of-day";

/**
 * The owner's turn, 20 Nov 2026, 10:08 pm IST: "add a reminder for tomorrow
 * doctor appointment at 1 o'clock" was answered "⏰ What time should I remind
 * you…?" with Today / Tomorrow / Sunday chips. The model read the day and the
 * time; "1 o'clock" was not a time the reminder could read, and the question
 * was filed as a "day" question, so its answers were days.
 */

const FRIDAY_NIGHT = new Date("2026-11-20T16:38:00Z"); // 10:08 pm in Kolkata
const TZ = "Asia/Kolkata";
const OWNER = "add a reminder for tomorrow doctor appointment at 1 o'clock";

const modelSaid = (action: HouseholdIntent["action"], parameters: Record<string, unknown>): TurnInput["understand"] =>
  async (utterance, context) => ({ action, actorMemberId: context.actorMemberId, target: { kind: "unspecified" }, parameters, confidence: 0.9, channel: context.channel, utterance, understanding: { source: "model", provider: "anthropic" } });

const turn = (utterance: string, understand?: TurnInput["understand"], over: Partial<TurnInput> = {}): TurnInput => ({
  utterance,
  channel: "text",
  actor: { memberId: "m-kunal", roles: ["adult"], memberType: "adult" },
  pending: null,
  autonomyFor: () => "prepare",
  entitledFor: () => true,
  sessionId: "s-1",
  now: FRIDAY_NIGHT,
  ground: (intent) => groundIntent(intent, { people: [], viewerMemberId: "m-kunal", timezone: TZ, now: FRIDAY_NIGHT, references: async () => NO_REFERENCES }),
  ...(understand ? { understand } : {}),
  ...over,
});

describe("the owner's sentence is recorded, never asked about", () => {
  it("read by the model as a reminder: becomes the doctor's appointment, tomorrow at 1pm, done at once", async () => {
    const result = await converse(turn(OWNER, modelSaid("set_reminder", { what: "doctor appointment", when: "tomorrow", time: "1 o'clock" })));
    if (result.kind !== "reply") throw new Error("expected a reply");
    expect(result.proposal.kind).not.toBe("clarify");
    expect(result.intent.action).toBe("record_health_appointment");
    expect(result.intent.parameters).toMatchObject({ appointmentType: "doctor", when: "tomorrow", time: "1 o'clock" });
  });

  it("read by the rules alone (no model): the same", async () => {
    const result = await converse(turn(OWNER));
    if (result.kind !== "reply") throw new Error("expected a reply");
    expect(result.intent.action).toBe("record_health_appointment");
    expect(result.intent.parameters).toMatchObject({ when: "tomorrow", time: "1 o'clock" });
  });

  it("someone else's appointment stays a reminder, and a reminder to do something about one stays a reminder", () => {
    const reminder = (utterance: string, what: string): HouseholdIntent => ({ action: "set_reminder", actorMemberId: "m", target: { kind: "outcome", reference: "reminders" }, parameters: { what, when: "tomorrow", time: "4" }, confidence: 0.9, channel: "text", utterance });
    expect(appointmentFromReminder(reminder("add reminder for Asmi's dentist appointment tomorrow at 4", "Asmi's dentist appointment")).action).toBe("set_reminder");
    expect(appointmentFromReminder(reminder("remind me to book the dentist tomorrow at 4", "book the dentist")).action).toBe("set_reminder");
    expect(appointmentFromReminder(reminder("remind me about mom's eye checkup tomorrow at 4", "mom's eye checkup")).action).toBe("set_reminder");
    expect(appointmentFromReminder(reminder("remind me about my dentist appointment tomorrow at 4", "my dentist appointment")).action).toBe("record_health_appointment");
  });

  it("any other reminder said with the day and time inside it is set for that day and time, with no question", async () => {
    const result = await converse(turn("add a reminder for tomorrow parents meeting at 5"));
    if (result.kind !== "reply") throw new Error("expected a reply");
    expect(result.proposal.kind).not.toBe("clarify");
    expect(result.intent.parameters).toMatchObject({ what: "parents meeting", when: "tomorrow" });
    expect(result.intent.parameters.remindAtResolved).toMatchObject({ day: "tomorrow (Sat 21 Nov)", time: "5pm", assumedFrom: "5" });
  });

  it("a model reading of a plain reminder with \"1 o'clock\" goes off at 1pm tomorrow", async () => {
    const result = await converse(turn("remind me tomorrow at 1 o'clock to call the bank", modelSaid("set_reminder", { what: "call the bank", when: "tomorrow", time: "1 o'clock" })));
    if (result.kind !== "reply") throw new Error("expected a reply");
    expect(result.proposal.kind).not.toBe("clarify");
    expect(result.intent.parameters.remindAtResolved).toMatchObject({ day: "tomorrow (Sat 21 Nov)", time: "1pm" });
  });
});

describe("a time of day, as people say it", () => {
  const cases: [string, string | null][] = [
    ["1 o'clock", "13:00"], ["one o clock", "13:00"], ["1 oclock", "13:00"], ["1’o clock", "13:00"], ["1pm", "13:00"], ["1 p.m.", "13:00"],
    ["13:00", "13:00"], ["1.30", "13:30"], ["half past 6", "18:30"], ["quarter to 7", "18:45"], ["quarter past 9", "09:15"],
    ["7 in the evening", "19:00"], ["7 in the morning", "07:00"], ["6 thirty", "18:30"], ["9", "09:00"], ["11:15", "11:15"],
    ["noon", "12:00"], ["midnight", "00:00"], ["12", "12:00"], ["10 at night", "22:00"], ["9am", "09:00"], ["12am", "00:00"],
    ["at 4", "16:00"], ["5 baje", "17:00"], ["banana", null], ["25:00", null],
  ];
  it.each(cases)("%s → %s", (said, expected) => {
    const time = readTimeOfDay(said);
    expect(time ? `${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}` : null).toBe(expected);
  });

  it("the words around it choose the half of the day", () => {
    expect(readTimeOfDay("8", { hint: "evening" })).toMatchObject({ hour: 20, assumed: false });
    expect(readTimeOfDay("8")).toMatchObject({ hour: 8, assumed: true });
  });

  it("a chosen half already gone today is the other half, still ahead", () => {
    const moment = reminderMoment("today", "9", { timezone: TZ, now: new Date("2026-11-20T05:00:00Z") }); // 10:30 am
    expect(moment).toMatchObject({ ok: true, time: "9pm" });
  });
});

describe("a question and its answers are about the same thing", () => {
  const t = translator("en", en);
  const context = { t, now: FRIDAY_NIGHT, timezone: TZ };
  const pending = (awaiting: string, question: string): PendingClarification => ({ action: "set_reminder", target: { kind: "outcome", reference: "reminders" }, parameters: { what: "x", when: "tomorrow", awaiting }, question, utterance: "x", asked: 1 }) as unknown as PendingClarification;
  const isTimeChip = (say: string | null) => say === null || /\b(?:am|pm)\b/.test(say);
  const isDayChip = (say: string | null) => say === null || /^(?:today|tomorrow|saturday|sunday)$/.test(say);

  it("every question a reminder's time can raise offers answers of its own slot", () => {
    const failures = [
      reminderMoment("tomorrow", "sometime-ish", { timezone: TZ, now: FRIDAY_NIGHT }),
      reminderMoment("last week", null, { timezone: TZ, now: FRIDAY_NIGHT }),
      reminderMoment("today", "9am", { timezone: TZ, now: FRIDAY_NIGHT }),
    ];
    for (const moment of failures) {
      if (moment.ok) throw new Error("expected a question");
      const chips = choicesFor(pending(moment.slot, moment.question), context)!;
      expect(asksForTime(moment.question)).toBe(moment.slot === "time");
      expect(chips.choices.every((choice) => (moment.slot === "time" ? isTimeChip(choice.say) : isDayChip(choice.say)))).toBe(true);
    }
  });

  it("a time question filed under the wrong slot still gets time answers", () => {
    const chips = choicesFor(pending("day", "⏰ What time should I remind you — for example \"9am\" or \"6:30pm\"?"), context)!;
    expect(chips.choices.map((choice) => choice.say)).toEqual(["9 am", "12 pm", "4 pm", "6 pm", null]);
  });

  it("the time answered completes the request without repeating it", async () => {
    const asked = pending("time", "What time should I remind you?");
    const result = await converse(turn("1 o'clock", undefined, { clarifying: asked }));
    if (result.kind !== "reply") throw new Error("expected a reply");
    expect(result.intent.parameters).toMatchObject({ when: "tomorrow", time: "1 o'clock" });
    expect(result.proposal.kind).not.toBe("clarify");
  });
});
