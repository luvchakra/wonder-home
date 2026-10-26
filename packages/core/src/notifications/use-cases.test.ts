import { describe, expect, it } from "vitest";

import { paymentNoticeFor, paymentNoticeText } from "../billing/notices";
import { reminderMoment } from "../conversation/reminder-time";
import { dueRemindersFor } from "../health/reminders";
import { routineDueNow } from "../health/routine-reminders";
import { formatterFor } from "../i18n/format";
import { en } from "../i18n/messages/en";
import { DEFAULT_PREFERENCES } from "../i18n/preferences";
import { translator } from "../i18n/translate";
import { inviteEmail } from "../identity/invite-email";
import { acknowledgementFor } from "../whatsapp/intake";
import type { LaundryNeed } from "../home/laundry";
import type { WeatherWindow } from "../home/weather";
import type { IngestOutcome } from "../homesend/ingest";
import { blocksFor } from "./channel-check";
import { chooseRecipient, decideNotification, type Candidate, type HouseholdEvent } from "./decide";
import { digestDue, digestText } from "./digest";
import {
  chatNotices,
  eventChangeNotices,
  eventReplyNotices,
  goalCheckInNotices,
  helperAbsenceNotices,
  homesendNotices,
  orderNotices,
  weatherNotices,
} from "./notices";
import {
  buildDirectory,
  chooseReminderRecipient,
  isUnanswered,
  isUnansweredForChannel,
  nextReminderCheck,
  planEscalation,
  planReminder,
  type DesiredReminder,
  type RecipientSettings,
} from "./plan";
import { EMAIL_DAILY_LIMIT, emailWorthSending, PUSH_DAILY_LIMIT, pushWorthSending } from "./push-gate";
import { planStages, presetFor, REMINDER_POLICIES, storedPriority, type TunableCategory } from "./policies";
import { batchSchoolDays } from "./reconcile";
import {
  billSubject,
  familySubject,
  grocerySubject,
  mealSubject,
  petSubject,
  sameOccasionAsEvent,
  schoolSubject,
  type BillRow,
  type FamilyEventRow,
  type ReminderSubject,
  type SchoolItemRow,
} from "./sources";

/**
 * The owner's notifications workbook (2026-10-22), one block per row: what
 * each row says about when a notification lands, who gets it, how urgent it
 * is, which channels it may reach, what happens when nobody answers and when
 * it ends — asserted against the code that decides it.
 *
 * Fixed household: Asia/Kolkata (UTC+5:30), "today" is Thursday 22 Oct 2026.
 * Kunal is the head, Priya an Admin, Rekha a helper, Asmi a child who signs
 * in, Dadi an adult with no account (never reminded).
 */

const IST = "Asia/Kolkata";
const format = formatterFor(DEFAULT_PREFERENCES);
const t = translator("en", en);
/** 10:30 in Kolkata on Thursday 22 Oct 2026. */
const NOW = new Date("2026-10-22T05:00:00Z");
const context = { timeZone: IST, format, now: NOW };
/** An instant from Kolkata wall-clock time. */
const ist = (local: string) => new Date(`${local}+05:30`);

const members = [
  { id: "kunal", profile_id: "p-kunal", member_type: "adult" as const, status: "active" },
  { id: "priya", profile_id: "p-priya", member_type: "adult" as const, status: "active" },
  { id: "rekha", profile_id: "p-rekha", member_type: "helper" as const, status: "active" },
  { id: "asmi", profile_id: "p-asmi", member_type: "child" as const, status: "active" },
  { id: "dadi", profile_id: null, member_type: "adult" as const, status: "active" },
];
const roles = [
  { member_id: "kunal", role: "head" },
  { member_id: "priya", role: "administrator" },
];
const guardians = [{ child_member_id: "asmi", guardian_member_id: "priya" }];
type Duty = { outcome_key: string; primary_member_id: string | null; backup_member_id: string | null };
const household = (responsibilities: Duty[] = [], who = members) => buildDirectory(who, roles, responsibilities, guardians);

const settings = (over: Partial<RecipientSettings> = {}): RecipientSettings => ({ preset: null, enabled: true, quiet: null, ...over });
const plan = (subject: ReminderSubject, at: Date, over: Partial<RecipientSettings> = {}, closedSeq = 0) =>
  planReminder(subject, { memberId: "kunal", role: "primary" }, settings(over), closedSeq, IST, at);
const stagesOf = (category: TunableCategory, presetKey: string | null, subject: ReminderSubject) =>
  planStages(presetFor(category, presetKey), subject.anchor, IST).map((stage) => ({ key: stage.key, at: stage.idealAt.toISOString() }));
/** Which channels beyond the app a stored priority may reach, for a reminder timed for this person, with nothing sent yet today. */
const reaches = (priority: "low" | "normal" | "high" | "critical", reason: "reminder" | "alert" = "reminder") => ({
  push: pushWorthSending({ priority, reason, sentToday: 0 }),
  email: emailWorthSending({ priority, reason, sentToday: 0 }),
});
/** A delivered, unanswered final reminder, `minutes` ago. */
const delivered = (want: DesiredReminder, minutes: number, over: Partial<{ snooze_count: number; status: string }> = {}) => ({
  reminder_seq: want.reminderSeq,
  status: "delivered",
  delivered_at: new Date(NOW.getTime() - minutes * 60_000).toISOString(),
  snooze_count: 0,
  ...over,
});

describe("the channel ceilings every row shares", () => {
  it("lets a timed Normal reminder push 4 times a day and email 6, High 8 and 12, Low never, Critical always", () => {
    expect(PUSH_DAILY_LIMIT).toEqual({ high: 8, normal: 4 });
    expect(EMAIL_DAILY_LIMIT).toEqual({ high: 12, normal: 6 });
    expect(pushWorthSending({ priority: "normal", reason: "reminder", sentToday: 3 })).toBe(true);
    expect(pushWorthSending({ priority: "normal", reason: "reminder", sentToday: 4 })).toBe(false);
    expect(emailWorthSending({ priority: "normal", reason: "reminder", sentToday: 5 })).toBe(true);
    expect(emailWorthSending({ priority: "normal", reason: "reminder", sentToday: 6 })).toBe(false);
    expect(pushWorthSending({ priority: "high", reason: "alert", sentToday: 7 })).toBe(true);
    expect(pushWorthSending({ priority: "high", reason: "alert", sentToday: 8 })).toBe(false);
    expect(emailWorthSending({ priority: "high", reason: "alert", sentToday: 11 })).toBe(true);
    expect(emailWorthSending({ priority: "high", reason: "alert", sentToday: 12 })).toBe(false);
    expect(reaches("low")).toEqual({ push: false, email: false });
    expect(pushWorthSending({ priority: "critical", reason: "alert", sentToday: 99 })).toBe(true);
  });

  it("keeps an ordinary Normal notice that is not a timed reminder in the app", () => {
    expect(reaches("normal", "alert")).toEqual({ push: false, email: false });
  });
});

// --- Reminders from household records ---------------------------------------

describe("R01 — A bill is due", () => {
  const bill: BillRow = { id: "b1", name: "Electricity", payee: null, amount_minor: 243000, currency: "INR", due_on: "2026-10-25", status: "expected", responsible_member_id: "kunal" };
  const subject = billSubject(bill, context)!;

  it("lands 3 days before at 10:00 and on the due day at 09:00", () => {
    expect(stagesOf("bills", null, subject)).toEqual([
      { key: "due_soon", at: ist("2026-10-22T10:00:00").toISOString() },
      { key: "due_today", at: ist("2026-10-25T09:00:00").toISOString() },
    ]);
  });

  it("offers the day before at 18:00 too, a week before, or the due day only", () => {
    expect(stagesOf("bills", "three_days_day_before_and_due", subject).map((stage) => stage.at)).toEqual([
      ist("2026-10-22T10:00:00").toISOString(),
      ist("2026-10-24T18:00:00").toISOString(),
      ist("2026-10-25T09:00:00").toISOString(),
    ]);
    expect(stagesOf("bills", "week_and_due", subject)[0]!.at).toBe(ist("2026-10-18T10:00:00").toISOString());
    expect(stagesOf("bills", "due_day", subject)).toEqual([{ key: "due_today", at: ist("2026-10-25T09:00:00").toISOString() }]);
  });

  it("goes to the bill's own person, then the bills duty, then its backup, then the head Admin", () => {
    expect(chooseReminderRecipient(subject, household())).toEqual({ memberId: "kunal", role: "primary" });
    const unowned = billSubject({ ...bill, responsible_member_id: null }, context)!;
    expect(chooseReminderRecipient(unowned, household([{ outcome_key: "finance.bills_paid", primary_member_id: "priya", backup_member_id: "kunal" }]))).toEqual({ memberId: "priya", role: "primary" });
    expect(chooseReminderRecipient(unowned, household([{ outcome_key: "finance.bills_paid", primary_member_id: "dadi", backup_member_id: "priya" }]))).toEqual({ memberId: "priya", role: "backup" });
    expect(chooseReminderRecipient(unowned, household())).toEqual({ memberId: "kunal", role: "administrator" });
  });

  it("is Normal before the due day and High on it, so it may push and email either way", () => {
    const before = plan(subject, NOW)!;
    expect(before.storedPriority).toBe("normal");
    expect(reaches(before.storedPriority)).toEqual({ push: true, email: true });
    const onTheDay = plan(subject, ist("2026-10-25T09:05:00"))!;
    expect(onTheDay.stageKey).toBe("due_today");
    expect(onTheDay.storedPriority).toBe("high");
  });

  it("is held while the person is in quiet hours", () => {
    // Quiet 08:00–10:00: the 09:00 due-day reminder waits until 10:00.
    const quiet = plan(subject, ist("2026-10-25T09:00:00"), { quiet: { fromMinute: 480, untilMinute: 600 } })!;
    expect(quiet.scheduledFor.toISOString()).toBe(ist("2026-10-25T10:00:00").toISOString());
  });

  it("tells the backup once after 180 minutes unanswered, and goes by email or WhatsApp after 90", () => {
    expect(REMINDER_POLICIES.bills.escalation).toEqual({ afterMinutes: 180 });
    expect(REMINDER_POLICIES.bills.channelEscalation).toEqual({ afterMinutes: 90, via: ["email", "whatsapp"] });
    const last = plan(subject, ist("2026-10-25T09:05:00"))!;
    expect(last.finalStage).toBe(true);
    expect(isUnansweredForChannel(last, delivered(last, 89), NOW)).toBe(false);
    expect(isUnansweredForChannel(last, delivered(last, 90), NOW)).toBe(true);
    expect(isUnanswered(last, delivered(last, 179), NOW)).toBe(false);
    expect(isUnanswered(last, delivered(last, 180), NOW)).toBe(true);
  });

  it("ends when the bill is paid or cancelled", () => {
    expect(billSubject({ ...bill, status: "paid" }, context)).toBeNull();
    expect(billSubject({ ...bill, status: "cancelled" }, context)).toBeNull();
  });
});

describe("R02 — School work due", () => {
  const homework: SchoolItemRow = { id: "s1", child_member_id: "asmi", kind: "homework", title: "Maths worksheet", due_at: ist("2026-10-23T08:00:00").toISOString(), due_time_known: true, status: "pending" };
  const subject = schoolSubject(homework, "Asmi", context)!;

  it("lands the evening before at 18:30 and the morning of at 07:00", () => {
    expect(stagesOf("school", null, subject)).toEqual([
      { key: "tonight", at: ist("2026-10-22T18:30:00").toISOString() },
      { key: "this_morning", at: ist("2026-10-23T07:00:00").toISOString() },
    ]);
  });

  it("offers the evening before only, or the morning of only", () => {
    expect(stagesOf("school", "evening_before", subject).map((stage) => stage.key)).toEqual(["tonight"]);
    expect(stagesOf("school", "morning_of", subject).map((stage) => stage.key)).toEqual(["this_morning"]);
  });

  it("goes to whoever holds 'homework done', then 'school bag', then the child's guardian, then the Admin", () => {
    expect(chooseReminderRecipient(subject, household([{ outcome_key: "school.homework_done", primary_member_id: "kunal", backup_member_id: null }]))?.memberId).toBe("kunal");
    expect(chooseReminderRecipient(subject, household([{ outcome_key: "kids.school_bag", primary_member_id: "kunal", backup_member_id: null }]))?.memberId).toBe("kunal");
    expect(chooseReminderRecipient(subject, household())).toEqual({ memberId: "priya", role: "primary" });
    const noGuardian = buildDirectory(members, roles, [], []);
    expect(chooseReminderRecipient(subject, noGuardian)).toEqual({ memberId: "kunal", role: "administrator" });
  });

  it("never asks the child herself", () => {
    expect(chooseReminderRecipient(subject, household([{ outcome_key: "school.homework_done", primary_member_id: "asmi", backup_member_id: null }]))?.memberId).toBe("priya");
  });

  it("is Normal at both stages, so it may push and email", () => {
    expect(plan(subject, ist("2026-10-22T18:31:00"))!.storedPriority).toBe("normal");
    expect(plan(subject, ist("2026-10-23T07:01:00"))!.storedPriority).toBe("normal");
    expect(reaches("normal")).toEqual({ push: true, email: true });
  });

  it("tells the backup after 60 minutes and goes by email or WhatsApp after 30", () => {
    expect(REMINDER_POLICIES.school.escalation).toEqual({ afterMinutes: 60 });
    expect(REMINDER_POLICIES.school.channelEscalation).toEqual({ afterMinutes: 30, via: ["email", "whatsapp"] });
  });

  it("ends when marked done, or when its moment passes", () => {
    expect(schoolSubject({ ...homework, status: "done" }, "Asmi", context)).toBeNull();
    expect(subject.expiresAt.toISOString()).toBe(homework.due_at);
    expect(plan(subject, ist("2026-10-23T08:00:00"))).toBeNull();
  });
});

describe("R03 — School event", () => {
  const trip: SchoolItemRow = { id: "s2", child_member_id: "asmi", kind: "event", title: "Field trip to Bounce", due_at: ist("2026-10-23T07:30:00").toISOString(), due_time_known: true, status: "pending" };
  const subject = schoolSubject(trip, "Asmi", context)!;

  it("is a quiet in-app heads-up the evening before, and pushes and emails only on the day", () => {
    const evening = plan(subject, ist("2026-10-22T18:31:00"))!;
    expect(evening.storedPriority).toBe("low");
    expect(reaches(evening.storedPriority)).toEqual({ push: false, email: false });
    const morning = plan(subject, ist("2026-10-23T07:01:00"))!;
    expect(morning.stageKey).toBe("this_morning");
    expect(morning.storedPriority).toBe("normal");
    expect(reaches(morning.storedPriority)).toEqual({ push: true, email: true });
  });

  it("is not sent at all when the same occasion is already a family event that day", () => {
    const event: FamilyEventRow = { id: "e1", title: "Bounce School Trip", kind: "outing", starts_at: ist("2026-10-23T08:00:00").toISOString(), status: "planned", owner_member_id: "kunal" };
    expect(sameOccasionAsEvent(trip, [event], IST)).toBe(true);
  });

  it("ends when the event passes", () => {
    expect(plan(subject, ist("2026-10-23T07:30:00"))).toBeNull();
  });
});

describe("R04 — A child's school day in one message", () => {
  const item = (id: string, kind: string, time: string): SchoolItemRow => ({ id, child_member_id: "asmi", kind, title: `Thing ${id}`, due_at: ist(`2026-10-23T${time}`).toISOString(), due_time_known: true, status: "pending" });
  const rows = [item("a", "homework", "08:00:00"), item("b", "event", "09:00:00"), item("c", "exam", "10:00:00")];
  const routed = rows.map((row) => ({ subject: schoolSubject(row, "Asmi", context)!, recipient: { memberId: "priya", role: "primary" as const } }));
  const schoolRows = new Map(routed.map((entry, index) => [entry.subject, rows[index]!]));
  const grouped = batchSchoolDays(routed, schoolRows, new Map([["asmi", "Asmi"]]), context);

  it("groups two or more things for the same child, day and person into one reminder", () => {
    expect(grouped).toHaveLength(1);
    expect(grouped[0]!.subject.threadKey).toBe("school_day:asmi:2026-10-23");
    expect(grouped[0]!.subject.items).toEqual(["a", "b", "c"]);
  });

  it("is as urgent as the most urgent thing in it", () => {
    const evening = grouped[0]!.subject.text("tonight", NOW);
    // Homework is Normal the evening before, the event alone would be Low.
    expect(evening.priority).toBe("medium");
    const onlyEvents = [item("x", "event", "09:00:00"), item("y", "event", "10:00:00")];
    const eventsRouted = onlyEvents.map((row) => ({ subject: schoolSubject(row, "Asmi", context)!, recipient: { memberId: "priya", role: "primary" as const } }));
    const eventsGrouped = batchSchoolDays(eventsRouted, new Map(eventsRouted.map((entry, index) => [entry.subject, onlyEvents[index]!])), new Map(), context);
    expect(eventsGrouped[0]!.subject.text("tonight", NOW).priority).toBe("low");
    expect(eventsGrouped[0]!.subject.text("this_morning", NOW).priority).toBe("medium");
  });

  it("leaves a single thing, or things for different people, as they are", () => {
    const one = batchSchoolDays(routed.slice(0, 1), schoolRows, new Map(), context);
    expect(one[0]!.subject.sourceType).toBe("school_item");
    const split = batchSchoolDays([routed[0]!, { ...routed[1]!, recipient: { memberId: "kunal", role: "primary" } }], schoolRows, new Map(), context);
    expect(split.map((entry) => entry.subject.sourceType)).toEqual(["school_item", "school_item"]);
  });
});

describe("R05 — Time to start cooking", () => {
  const dinner = { id: "m1", name: "Dal makhani", slot: "dinner", ready_by: ist("2026-10-22T20:00:00").toISOString(), status: "planned", cook_member_id: "rekha", recipe_total_minutes: 60 };

  it("lands when cooking has to start: ready-by minus the recipe's time, or 45 minutes when unknown", () => {
    expect(stagesOf("meals", null, mealSubject(dinner, context)!)[0]!.at).toBe(ist("2026-10-22T19:00:00").toISOString());
    expect(stagesOf("meals", null, mealSubject({ ...dinner, recipe_total_minutes: null }, context)!)[0]!.at).toBe(ist("2026-10-22T19:15:00").toISOString());
  });

  it("offers 15 or 30 minutes before cooking starts", () => {
    const subject = mealSubject(dinner, context)!;
    expect(stagesOf("meals", "prep_start_15", subject)[0]!.at).toBe(ist("2026-10-22T18:45:00").toISOString());
    expect(stagesOf("meals", "prep_start_30", subject)[0]!.at).toBe(ist("2026-10-22T18:30:00").toISOString());
  });

  it("goes to the cook, then the meal's duty, then the Admin", () => {
    expect(chooseReminderRecipient(mealSubject(dinner, context)!, household())?.memberId).toBe("rekha");
    const nobody = mealSubject({ ...dinner, cook_member_id: null }, context)!;
    expect(chooseReminderRecipient(nobody, household([{ outcome_key: "meals.dinner_ready", primary_member_id: "priya", backup_member_id: null }]))?.memberId).toBe("priya");
    expect(chooseReminderRecipient(nobody, household())).toEqual({ memberId: "kunal", role: "administrator" });
  });

  it("is High for dinner and Normal otherwise", () => {
    expect(storedPriority(mealSubject(dinner, context)!.text("start_cooking", NOW).priority)).toBe("high");
    expect(storedPriority(mealSubject({ ...dinner, slot: "lunch" }, context)!.text("start_cooking", NOW).priority)).toBe("normal");
  });

  it("has no escalation, and ends when the meal is made, changed or removed", () => {
    expect(REMINDER_POLICIES.meals.escalation).toBeNull();
    expect(REMINDER_POLICIES.meals.channelEscalation).toBeNull();
    expect(mealSubject({ ...dinner, status: "done" }, context)).toBeNull();
    expect(mealSubject(dinner, context)!.expiresAt.toISOString()).toBe(dinner.ready_by);
  });
});

describe("R06 — The list needs attention", () => {
  it("lands that day at 17:00, or at 09:00 or 19:00 if chosen", () => {
    const subject = grocerySubject([{ name: "Milk", needed_by: null, category: "dairy" }], context)!;
    expect(stagesOf("groceries", null, subject)[0]!.at).toBe(ist("2026-10-22T17:00:00").toISOString());
    expect(stagesOf("groceries", "morning", subject)[0]!.at).toBe(ist("2026-10-22T09:00:00").toISOString());
    expect(stagesOf("groceries", "evening", subject)[0]!.at).toBe(ist("2026-10-22T19:00:00").toISOString());
  });

  it("is one reminder for the whole list, to whoever keeps groceries stocked, else the Admin", () => {
    const subject = grocerySubject([{ name: "Milk", needed_by: null, category: "dairy" }, { name: "Eggs", needed_by: null, category: "dairy" }], context)!;
    expect(subject.threadKey).toBe("grocery_list:2026-10-22");
    expect(chooseReminderRecipient(subject, household([{ outcome_key: "groceries.stocked", primary_member_id: "priya", backup_member_id: null }]))?.memberId).toBe("priya");
    expect(chooseReminderRecipient(subject, household())?.role).toBe("administrator");
  });

  it("is Normal (and may push) only when something is needed soon; Low otherwise", () => {
    const soon = grocerySubject([{ name: "Milk", needed_by: "2026-10-22", category: "dairy" }], context)!;
    expect(storedPriority(soon.text("list_needs_attention", NOW).priority)).toBe("normal");
    const medical = grocerySubject([{ name: "Paracetamol", needed_by: null, category: "medical" }], context)!;
    expect(storedPriority(medical.text("list_needs_attention", NOW).priority)).toBe("normal");
    const later = grocerySubject([{ name: "Rice", needed_by: "2026-10-30", category: "staples" }], context)!;
    expect(storedPriority(later.text("list_needs_attention", NOW).priority)).toBe("low");
  });

  it("ends when nothing is left on the list", () => {
    expect(grocerySubject([], context)).toBeNull();
  });
});

describe("R07 — Pet care due", () => {
  const care = { id: "pc1", kind: "medication", due_on: "2026-10-23", last_done_on: null, interval_days: null, responsible_member_id: "priya", pet_name: "Bruno" };

  it("lands on the day at 08:00, or the day before at 18:00 too", () => {
    const subject = petSubject(care, context)!;
    expect(stagesOf("pets", null, subject)).toEqual([{ key: "due_today", at: ist("2026-10-23T08:00:00").toISOString() }]);
    expect(stagesOf("pets", "day_before_and_on_time", subject).map((stage) => stage.at)).toEqual([ist("2026-10-22T18:00:00").toISOString(), ist("2026-10-23T08:00:00").toISOString()]);
  });

  it("goes to its person, then the pets duty, then its backup, then the Admin", () => {
    expect(chooseReminderRecipient(petSubject(care, context)!, household())?.memberId).toBe("priya");
    const nobody = petSubject({ ...care, responsible_member_id: null }, context)!;
    expect(chooseReminderRecipient(nobody, household([{ outcome_key: "pets.vet", primary_member_id: "kunal", backup_member_id: null }]))?.memberId).toBe("kunal");
    expect(chooseReminderRecipient(nobody, household([{ outcome_key: "pets.vet", primary_member_id: null, backup_member_id: "priya" }]))).toEqual({ memberId: "priya", role: "backup" });
    expect(chooseReminderRecipient(nobody, household())?.role).toBe("administrator");
  });

  it("is High for medication and Normal otherwise", () => {
    expect(storedPriority(petSubject(care, context)!.text("due_today", NOW).priority)).toBe("high");
    expect(storedPriority(petSubject({ ...care, kind: "food" }, context)!.text("due_today", NOW).priority)).toBe("normal");
  });

  it("tells the backup after 120 minutes and goes by email or WhatsApp after 60", () => {
    expect(REMINDER_POLICIES.pets.escalation).toEqual({ afterMinutes: 120 });
    expect(REMINDER_POLICIES.pets.channelEscalation).toEqual({ afterMinutes: 60, via: ["email", "whatsapp"] });
  });

  it("ends when marked done", () => {
    expect(petSubject({ ...care, last_done_on: "2026-10-23" }, context)).toBeNull();
  });
});

describe("R08 — A family plan is coming up", () => {
  const event: FamilyEventRow = { id: "e1", title: "Bounce School Trip", kind: "outing", starts_at: ist("2026-10-23T08:00:00").toISOString(), status: "planned", owner_member_id: "kunal" };
  const subject = familySubject(event, context)!;

  it("lands an hour before by default", () => {
    expect(stagesOf("family", null, subject)).toEqual([{ key: "starts_soon", at: ist("2026-10-23T07:00:00").toISOString() }]);
  });

  it("offers the evening before at 19:00 plus an hour before, or the morning of at 08:00", () => {
    expect(stagesOf("family", "evening_and_hour_before", subject)).toEqual([
      { key: "tomorrow", at: ist("2026-10-22T19:00:00").toISOString() },
      { key: "starts_soon", at: ist("2026-10-23T07:00:00").toISOString() },
    ]);
    // Never after the moment itself: the 08:00 morning-of reminder for an 08:00 start is at 08:00.
    expect(stagesOf("family", "day_of", subject)).toEqual([{ key: "today", at: ist("2026-10-23T08:00:00").toISOString() }]);
  });

  it("goes to the event's owner, else the Admin", () => {
    expect(chooseReminderRecipient(subject, household())).toEqual({ memberId: "kunal", role: "primary" });
    expect(chooseReminderRecipient(familySubject({ ...event, owner_member_id: null }, context)!, household())?.role).toBe("administrator");
  });

  it("is Low the evening before (in the app) and Normal on the day (may push)", () => {
    expect(storedPriority(subject.text("tomorrow", NOW).priority)).toBe("low");
    expect(storedPriority(subject.text("starts_soon", NOW).priority)).toBe("normal");
    expect(storedPriority(subject.text("today", NOW).priority)).toBe("normal");
  });

  it("has no escalation, and ends when the event starts or is cancelled; appointments are Health's", () => {
    expect(REMINDER_POLICIES.family.escalation).toBeNull();
    expect(familySubject({ ...event, status: "cancelled" }, context)).toBeNull();
    expect(familySubject({ ...event, kind: "appointment" }, context)).toBeNull();
    expect(familySubject(event, { ...context, now: ist("2026-10-23T08:00:00") })).toBeNull();
  });
});

// --- Health -----------------------------------------------------------------

describe("H01 — Appointment reminder", () => {
  const appointment = { startsAt: ist("2026-10-25T11:00:00").toISOString(), remindAdvance: true, remindPreparation: true, remindDayOf: true, preparationNotes: "Fasting from 10 pm" };

  it("comes 3 days before from 09:00 local", () => {
    expect(dueRemindersFor(appointment, ist("2026-10-22T08:59:00"), IST)).toEqual([]);
    expect(dueRemindersFor(appointment, ist("2026-10-22T09:00:00"), IST)).toEqual(["advance"]);
  });

  it("comes the day before from 09:00 only when there is something to prepare", () => {
    expect(dueRemindersFor(appointment, ist("2026-10-24T09:00:00"), IST)).toEqual(["preparation"]);
    expect(dueRemindersFor({ ...appointment, preparationNotes: null }, ist("2026-10-24T09:00:00"), IST)).toEqual([]);
  });

  it("comes on the day from 07:00, or two hours before an early appointment, and never after it starts", () => {
    expect(dueRemindersFor(appointment, ist("2026-10-25T06:59:00"), IST)).toEqual([]);
    expect(dueRemindersFor(appointment, ist("2026-10-25T07:00:00"), IST)).toEqual(["day_of"]);
    const early = { ...appointment, startsAt: ist("2026-10-25T08:00:00").toISOString() };
    expect(dueRemindersFor(early, ist("2026-10-25T05:59:00"), IST)).toEqual([]);
    expect(dueRemindersFor(early, ist("2026-10-25T06:00:00"), IST)).toEqual(["day_of"]);
    expect(dueRemindersFor(early, ist("2026-10-25T08:00:00"), IST)).toEqual([]);
  });

  it("follows each appointment's own switches", () => {
    expect(dueRemindersFor({ ...appointment, remindAdvance: false }, ist("2026-10-22T09:00:00"), IST)).toEqual([]);
    expect(dueRemindersFor({ ...appointment, remindDayOf: false }, ist("2026-10-25T07:00:00"), IST)).toEqual([]);
  });

  it("goes to the person it is for, or their guardian when they have no account", () => {
    const own: Candidate = { memberId: "kunal", role: "primary", canAct: true, availability: null };
    const guardian: Candidate = { memberId: "priya", role: "backup", canAct: true, availability: null };
    expect(chooseRecipient([guardian, own])?.memberId).toBe("kunal");
    expect(chooseRecipient([{ ...guardian, role: "primary" }])?.memberId).toBe("priya");
  });
  // How a due reminder is delivered (and that it counts as a timed reminder for the push and email gates)
  // is health/reminders-delivery.test.ts; that each kind is sent once is health/reminders.test.ts.
});

describe("H02 — A measurement is due", () => {
  it("is due on its day from 09:00 local, read on the household's clock", () => {
    expect(routineDueNow("2026-10-22", ist("2026-10-22T08:59:00"), IST)).toBe(false);
    expect(routineDueNow("2026-10-22", ist("2026-10-22T09:00:00"), IST)).toBe(true);
    // 00:30 on the 23rd in Kolkata is still the 22nd in UTC: the household's day decides.
    expect(routineDueNow("2026-10-22", ist("2026-10-23T00:30:00"), IST)).toBe(false);
    expect(routineDueNow("2026-10-23", ist("2026-10-23T09:30:00"), IST)).toBe(true);
  });
});

describe("H03 — A health checkup is overdue", () => {
  const event: HouseholdEvent = {
    threadKey: "health_checkup:c1:overdue",
    outcomeKey: "checkup.c1",
    kind: "exception",
    aiResolvable: false,
    riskLevel: "low",
    dueAt: new Date("2026-10-01T00:00:00Z"),
    impact: "The annual checkup is overdue.",
    recommendedAction: { action: "view_checkup" },
  };

  it("is told to the member, or a guardian for a child, when an agent pass decides it", () => {
    const decision = decideNotification(event, { candidates: [{ memberId: "priya", role: "primary", canAct: true, availability: null }], openThreadKeys: [], now: NOW });
    expect(decision).toMatchObject({ kind: "notify", recipientMemberId: "priya", type: "action" });
  });

  it("is Normal and not a timed reminder, so it stays in the app by the priority rules", () => {
    // riskLevel low → stored "normal"; an alert at Normal earns no push or email.
    expect(reaches("normal", "alert")).toEqual({ push: false, email: false });
  });
});

// --- Notices ------------------------------------------------------------------

describe("N01 — Something you sent needs your OK, or could not be read", () => {
  const row = (over: Partial<{ created_by_member_id: string; status: string; classified_kind: string | null }> = {}) => ({ id: "h1", created_by_member_id: "priya", status: "classified", classified_kind: "bill", updated_at: NOW.toISOString(), ...over });

  it("goes to the sender when they may confirm it, else an Admin", () => {
    expect(homesendNotices([row()], household(), NOW)[0]).toMatchObject({ recipientMemberId: "priya", priority: "normal", threadKey: "homesend:h1:classified" });
    expect(homesendNotices([row({ created_by_member_id: "asmi" })], household(), NOW)[0]!.recipientMemberId).toBe("kunal");
    expect(homesendNotices([row({ created_by_member_id: "rekha" })], household(), NOW)[0]!.recipientMemberId).toBe("kunal");
  });

  it("says when it failed safely, and ends once it is confirmed, undone or dismissed", () => {
    expect(homesendNotices([row({ status: "failed" })], household(), NOW)[0]!.title.key).toBe("reminder.homesend.failedTitle");
    expect(homesendNotices([row({ status: "applied" })], household(), NOW)).toEqual([]);
    expect(homesendNotices([row({ status: "dismissed" })], household(), NOW)).toEqual([]);
  });
});

describe("N02 — Guests replied to your invitation", () => {
  const event = { id: "e1", title: "Asmi's birthday", owner_member_id: "kunal", starts_at: ist("2026-10-25T17:00:00").toISOString(), status: "planned" };
  const guests = [
    { event_id: "e1", response: "yes", party_size: 3 },
    { event_id: "e1", response: "no", party_size: 1 },
    { event_id: "e1", response: "maybe", party_size: 2 },
  ];

  it("is one updating thread to the event's owner, counting people", () => {
    const [notice] = eventReplyNotices([event], guests, household(), NOW);
    expect(notice).toMatchObject({ recipientMemberId: "kunal", threadKey: "event-replies:e1", priority: "normal" });
    expect(notice!.body).toEqual({ key: "reminder.eventReply.body", params: { yes: 3, maybe: 2, no: 1 } });
  });

  it("goes to the Admin when nobody owns the event, and ends once the event has passed", () => {
    expect(eventReplyNotices([{ ...event, owner_member_id: null }], guests, household(), NOW)[0]!.recipientMemberId).toBe("kunal");
    expect(eventReplyNotices([{ ...event, starts_at: ist("2026-10-20T17:00:00").toISOString() }], guests, household(), NOW)).toEqual([]);
  });
});

describe("N03 — A helper is away", () => {
  const absence = { id: "a1", member_id: "rekha", on_date: "2026-10-24" };
  const helpers = [{ member_id: "rekha", name: "Rekha" }];

  it("goes to the backups of the helper's duties, else an Admin", () => {
    const duties = [{ outcome_key: "meals.dinner_ready", primary_member_id: "rekha", backup_member_id: "priya" }];
    expect(helperAbsenceNotices([absence], helpers, household(duties), NOW, IST).map((notice) => notice.recipientMemberId)).toEqual(["priya"]);
    expect(helperAbsenceNotices([absence], helpers, household(), NOW, IST).map((notice) => notice.recipientMemberId)).toEqual(["kunal"]);
  });

  it("ends when the day passes", () => {
    expect(helperAbsenceNotices([{ ...absence, on_date: "2026-10-21" }], helpers, household(), NOW, IST)).toEqual([]);
  });
});

describe("N04 — Your grocery order moved", () => {
  const order = { id: "o1", provider: "BigBasket", status: "shipped", total_minor: 125000, currency: "INR", approved_by_member_id: "priya", updated_at: NOW.toISOString() };

  it("is one thread to whoever approved the order, else the head Admin", () => {
    expect(orderNotices([order], household(), NOW)[0]).toMatchObject({ recipientMemberId: "priya", threadKey: "order:o1", priority: "normal" });
    expect(orderNotices([{ ...order, approved_by_member_id: null }], household(), NOW)[0]!.recipientMemberId).toBe("kunal");
  });

  it("is High when it failed, and says nothing for a draft", () => {
    expect(orderNotices([{ ...order, status: "failed" }], household(), NOW)[0]!.priority).toBe("high");
    expect(orderNotices([{ ...order, status: "draft" }], household(), NOW)).toEqual([]);
  });

  it("ends three days after the order last moved", () => {
    expect(orderNotices([{ ...order, updated_at: new Date(NOW.getTime() - 3 * 86_400_000 - 1).toISOString() }], household(), NOW)).toEqual([]);
  });
});

describe("N05 — An event was moved or cancelled by someone else", () => {
  const event = { id: "e1", title: "Picnic", owner_member_id: "kunal", starts_at: ist("2026-10-24T10:00:00").toISOString(), status: "cancelled" };
  const change = { id: "c1", event_id: "e1", kind: "cancelled" as const, changed_by_member_id: "priya", new_starts_at: null, created_at: NOW.toISOString() };
  const participants = [
    { event_id: "e1", member_id: "priya", response: "yes" },
    { event_id: "e1", member_id: "asmi", response: "yes" },
    { event_id: "e1", member_id: "dadi", response: "yes" },
  ];

  it("goes to the owner and those going, never to whoever changed it, never to someone without an account", () => {
    const told = eventChangeNotices([change], [event], participants, household(), new Map([["priya", "Priya"]]), NOW, IST).map((notice) => notice.recipientMemberId);
    expect(told.sort()).toEqual(["asmi", "kunal"]);
  });

  it("ends once the event has passed, or the change was put back", () => {
    expect(eventChangeNotices([change], [{ ...event, starts_at: ist("2026-10-21T10:00:00").toISOString() }], participants, household(), new Map(), NOW, IST)).toEqual([]);
    expect(eventChangeNotices([change], [{ ...event, status: "planned" }], participants, household(), new Map(), NOW, IST)).toEqual([]);
  });
});

describe("N06 and N07 — Weather that changes a plan", () => {
  const windows: WeatherWindow[] = [{ start: ist("2026-10-22T14:00:00"), end: ist("2026-10-22T18:00:00"), precipitationChance: 0.8, humidity: 0.6, temperatureC: 27 }];
  const outing = { id: "e1", title: "Park", owner_member_id: "kunal", starts_at: ist("2026-10-22T15:00:00").toISOString(), ends_at: ist("2026-10-22T17:00:00").toISOString(), status: "planned", kind: "outing" };

  it("N06: rain likely during an outing tells its owner, rounded to ten per cent", () => {
    const [notice] = weatherNotices(windows, [outing], [], household(), NOW, IST);
    expect(notice).toMatchObject({ recipientMemberId: "kunal", category: "family" });
    expect(notice!.body).toEqual({ key: "reminder.weather.outing.body", params: { chance: 80 } });
  });

  it("N06: says nothing for a dry outing, or with no forecast (Weather off)", () => {
    expect(weatherNotices([{ ...windows[0]!, precipitationChance: 0.1 }], [outing], [], household(), NOW, IST)).toEqual([]);
    expect(weatherNotices([], [outing], [], household(), NOW, IST)).toEqual([]);
  });

  it("N07: washing that won't dry goes to whoever holds 'laundry ready'", () => {
    const need: LaundryNeed = { id: "l1", label: "School uniforms", forMemberId: "asmi", state: "in_wash", stateAsOf: null, requiresOutdoorDrying: true, neededBy: ist("2026-10-22T18:00:00"), dryingHours: 6 };
    const duty = household([{ outcome_key: "laundry.ready", primary_member_id: "priya", backup_member_id: null }]);
    const notices = weatherNotices(windows, [], [need], duty, NOW, IST);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ recipientMemberId: "priya", category: "home", threadKey: "weather:laundry:l1" });
    // Washing already dry, or that dries indoors, needs no word.
    expect(weatherNotices(windows, [], [{ ...need, state: "ready" }], duty, NOW, IST)).toEqual([]);
    expect(weatherNotices(windows, [], [{ ...need, requiresOutdoorDrying: false }], duty, NOW, IST)).toEqual([]);
  });
});

describe("N08 — A child's goal check-in waits for a grown-up", () => {
  const row = { id: "g1", goal_id: "goal1", child_member_id: "asmi", on_day: "2026-10-22", verified_at: null };

  it("goes to the child's guardian, else the Admin, and ends once verified", () => {
    const titles = new Map([["goal1", "Read 20 minutes"]]);
    expect(goalCheckInNotices([row], titles, household(), new Map([["asmi", "Asmi"]]), NOW)[0]!.recipientMemberId).toBe("priya");
    expect(goalCheckInNotices([row], titles, buildDirectory(members, roles, [], []), new Map(), NOW)[0]!.recipientMemberId).toBe("kunal");
    expect(goalCheckInNotices([{ ...row, verified_at: NOW.toISOString() }], titles, household(), new Map(), NOW)).toEqual([]);
  });
});

describe("N09 — Unread chat messages, or a mention", () => {
  const threads = [{ id: "t1", kind: "household" as const, title: null }];
  const participants = [{ thread_id: "t1", member_id: "kunal", left_at: null, last_read_at: null }];
  const names = new Map([["kunal", "Kunal"], ["priya", "Priya"], ["asmi", "Asmi"], ["rekha", "Rekha"]]);
  const message = (body: string) => ({ thread_id: "t1", author_member_id: "priya", created_at: NOW.toISOString(), body });

  it("goes to each family reader with something unread, never the writer, never a helper", () => {
    const readers = chatNotices(threads, participants, [message("Dinner at 8")], household(), names, NOW).map((notice) => notice.recipientMemberId);
    expect(readers.sort()).toEqual(["asmi", "kunal"]);
  });

  it("is Normal, and High for the person mentioned", () => {
    const notices = chatNotices(threads, participants, [message("@Kunal can you pick up milk?")], household(), names, NOW);
    expect(notices.find((notice) => notice.recipientMemberId === "kunal")!.priority).toBe("high");
    expect(notices.find((notice) => notice.recipientMemberId === "asmi")!.priority).toBe("normal");
  });

  it("ends once the messages are read", () => {
    const read = [{ ...participants[0]!, last_read_at: new Date(NOW.getTime() + 1000).toISOString() }];
    expect(chatNotices(threads, read, [message("Dinner at 8")], household(), names, NOW).map((notice) => notice.recipientMemberId)).toEqual(["asmi"]);
  });
});

// --- Requests and other direct messages ------------------------------------

describe("D01 — Your own reminder", () => {
  it("lands at the time the person said, on the household's clock", () => {
    const moment = reminderMoment("today", "5", { timezone: IST, now: NOW });
    expect(moment.ok && moment.at.toISOString()).toBe(ist("2026-10-22T17:00:00").toISOString());
    const tomorrow = reminderMoment("tomorrow", null, { timezone: IST, now: NOW });
    expect(tomorrow.ok && tomorrow.at.toISOString()).toBe(ist("2026-10-23T09:00:00").toISOString());
  });

  it("asks rather than guesses when the time has passed", () => {
    expect(reminderMoment("today", "9am", { timezone: IST, now: NOW }).ok).toBe(false);
  });

  it("is a Normal timed reminder, so it may push and email", () => {
    // Stored Normal with source "reminder"; deliverDueNotifications sends it as a timed reminder.
    expect(reaches("normal", "reminder")).toEqual({ push: true, email: true });
  });
});

describe("D02 — A child or helper is asking for your OK", () => {
  it("is a decision for the adult who may approve", () => {
    const decision = decideNotification(
      { threadKey: "approval:a1", outcomeKey: "hometalk.request", kind: "approval_needed", aiResolvable: false, riskLevel: "medium", dueAt: null, impact: "Asmi asks: add chocolate", recommendedAction: { action: "approve" } },
      { candidates: [{ memberId: "priya", role: "administrator", canAct: true, availability: null }], openThreadKeys: [], now: NOW },
    );
    expect(decision).toMatchObject({ kind: "notify", type: "decision", recipientMemberId: "priya" });
  });
  // It is stored Normal and sent as an alert (referral.ts passes no reason), so by the gates it stays
  // in the app: the workbook's "push as a timed reminder" is not what the code does today.
});

describe("D03 — An agent step is waiting for your OK", () => {
  it("is a decision; spending money is High (may push), a household change Normal (in the app)", () => {
    const ask = (riskLevel: HouseholdEvent["riskLevel"]) =>
      decideNotification(
        { threadKey: "step", outcomeKey: "bills.pay", kind: "approval_needed", aiResolvable: false, riskLevel, dueAt: null, impact: "Pay the electricity bill", recommendedAction: { action: "bills.pay" } },
        { candidates: [{ memberId: "kunal", role: "administrator", canAct: true, availability: null }], openThreadKeys: [], now: NOW },
      );
    expect(ask("high")).toMatchObject({ kind: "notify", type: "decision", factors: { riskLevel: "high" } });
    expect(reaches("high", "alert")).toEqual({ push: true, email: true });
    expect(ask("medium")).toMatchObject({ kind: "notify", type: "decision" });
    expect(reaches("normal", "alert")).toEqual({ push: false, email: false });
  });
});

describe("D04 — A payment succeeded, failed or was refunded", () => {
  const payment = { id: "pay1", amount: 299, currency: "INR", planKey: "pro" };

  it("is told once, when the provider moves the payment into an outcome", () => {
    expect(paymentNoticeFor("pending", "succeeded", payment)?.kind).toBe("payment_succeeded");
    expect(paymentNoticeFor("pending", "failed", payment)?.kind).toBe("payment_failed");
    expect(paymentNoticeFor("succeeded", "succeeded", payment)).toBeNull();
    expect(paymentNoticeFor("pending", "processing", payment)).toBeNull();
  });

  it("says a failure needs action and nothing was taken, in plain words", () => {
    const failed = paymentNoticeText({ kind: "payment_failed", paymentId: "pay1", amount: 299, currency: "INR", planKey: "pro" });
    expect(failed.title).toBe("Payment didn't go through");
    expect(failed.body).toContain("Nothing was taken");
    expect(paymentNoticeText({ kind: "refund_succeeded", refundId: "r1", paymentId: "pay1", amount: 299, currency: "INR" }).title).toBe("Refund completed");
  });
  // Recipient (the Admin who paid, else the head) and the High priority on a failure: billing/notices.test.ts.
});

describe("D05 — Test notification", () => {
  it("says plainly why a channel would not reach the person", () => {
    expect(blocksFor({ channel: "email", live: false, enabled: true, hasTarget: true, inQuiet: false, sentToday: 0 })).toEqual(["not_set_up"]);
    expect(blocksFor({ channel: "push", live: true, enabled: false, hasTarget: false, inQuiet: true, sentToday: 4 })).toEqual(["off", "no_device", "quiet_hours", "daily_limit"]);
    expect(blocksFor({ channel: "email", live: true, enabled: true, hasTarget: true, inQuiet: false, sentToday: 0 })).toEqual([]);
  });
  // The send itself, to that person only and rate limited: channel-check.test.ts.
});

// --- Extra delivery steps -----------------------------------------------------

describe("E01 — The backup is told", () => {
  const bill: BillRow = { id: "b1", name: "Electricity", payee: null, amount_minor: null, currency: null, due_on: "2026-10-22", status: "expected", responsible_member_id: "kunal" };
  const last = plan(billSubject(bill, context)!, NOW)!;

  it("goes once to the backup with the same words and who has not answered", () => {
    const backup = planEscalation(last, "priya", "Kunal", settings(), 0, IST, NOW)!;
    expect(backup).toMatchObject({ recipientMemberId: "priya", recipientRole: "backup", escalatedFrom: "kunal", storedPriority: last.storedPriority });
    expect(backup.copy.body).toMatchObject({ key: "reminder.escalated" });
    // A backup who already dismissed it is not asked again.
    expect(planEscalation(last, "priya", "Kunal", settings(), last.reminderSeq, IST, NOW)).toBeNull();
  });

  it("happens only after the policy's wait, and stops when the original is answered", () => {
    expect(isUnanswered(last, delivered(last, 179), NOW)).toBe(false);
    expect(isUnanswered(last, delivered(last, 180), NOW)).toBe(true);
    expect(isUnanswered(last, delivered(last, 600, { status: "acted" }), NOW)).toBe(false);
  });
});

describe("E02 — The same reminder by another channel", () => {
  const bill: BillRow = { id: "b1", name: "Electricity", payee: null, amount_minor: null, currency: null, due_on: "2026-10-22", status: "expected", responsible_member_id: "kunal" };
  const last = plan(billSubject(bill, context)!, NOW)!;

  it("comes after the channel wait, before the backup's, and never once snoozed or answered", () => {
    expect(isUnansweredForChannel(last, delivered(last, 90), NOW)).toBe(true);
    expect(isUnansweredForChannel(last, delivered(last, 90, { snooze_count: 1 }), NOW)).toBe(false);
    expect(isUnansweredForChannel(last, delivered(last, 90, { status: "dismissed" }), NOW)).toBe(false);
    for (const category of ["bills", "school", "pets"] as const) {
      expect(REMINDER_POLICIES[category].channelEscalation!.afterMinutes).toBeLessThan(REMINDER_POLICIES[category].escalation!.afterMinutes);
    }
  });

  it("is when the delivery clock next looks at the household", () => {
    const open = new Map([[`kunal|${last.threadKey}`, { ...delivered(last, 0), expires_at: null }]]);
    expect(nextReminderCheck([last], open, NOW).toISOString()).toBe(new Date(NOW.getTime() + 90 * 60_000).toISOString());
  });
});

describe("E03 — Morning digest", () => {
  it("comes once a local day at the chosen time, and never hours late", () => {
    const due = (now: Date, lastOn: string | null = null) => digestDue({ now, timeZone: IST, minute: 7 * 60 + 30, lastOn }).due;
    expect(due(ist("2026-10-22T07:29:00"))).toBe(false);
    expect(due(ist("2026-10-22T07:30:00"))).toBe(true);
    expect(due(ist("2026-10-22T07:30:00"), "2026-10-22")).toBe(false);
    expect(due(ist("2026-10-22T10:31:00"))).toBe(false);
  });

  it("sends nothing on an empty day", () => {
    expect(digestText([], t, format)).toBeNull();
    expect(digestText([{ title: "Electricity", body: "", scheduled_for: NOW.toISOString() }], t, format)?.body).toBe("1 thing today: Electricity.");
  });
});

// --- Other messages the app sends --------------------------------------------

describe("X01 — Invitation email", () => {
  it("goes to the invited address with the link as a button and written out", () => {
    const mail = inviteEmail({ to: "asha@example.com", link: "https://home.wonderapps.biz/invite/abc", subject: "Join", greeting: "Hi", message: "Come in", action: "Join", expiry: "7 days", footer: "Ignore if unexpected" });
    expect(mail.to).toBe("asha@example.com");
    expect(mail.text).toContain("https://home.wonderapps.biz/invite/abc");
  });
});

describe("X02 — 'Got it' reply on WhatsApp", () => {
  it("is short and never echoes an amount", () => {
    const outcome = { itemId: "i1", duplicate: false, state: "needs_review", notice: "", item: { id: "i1", classifiedKind: "bill", extracted: { title: "Electricity", amount: 2430 }, understanding: null } } as unknown as IngestOutcome;
    expect(acknowledgementFor(outcome).text).toBe("Got it 👍 I found a bill. 🧾 It's waiting in HomeSend for you to check.");
  });
  // Sent once, inside the 24-hour window: whatsapp/whatsapp-intake.test.ts.
});
