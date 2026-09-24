import { describe, expect, it } from "vitest";

import { formatterFor } from "../i18n/format";
import { DEFAULT_PREFERENCES } from "../i18n/preferences";
import { SNOOZE_PRESETS, snoozeUntil, validSnoozeTime } from "./actions";
import { learnedMinuteFrom } from "./learning";
import { backupFor, chooseReminderRecipient, isUnanswered, planEscalation, planReminder, type Directory, type DirectoryMember, type RecipientSettings } from "./plan";
import { REMINDER_POLICIES, TUNABLE_CATEGORIES, maxRemindersFor, placeOutsideQuiet, planStages, presetFor, withLearnedTime } from "./policies";
import { batchSchoolDays, buildDirectory, decisionFactors, patchFor, quietFromPolicy, type OpenRow } from "./reconcile";
import {
  billSubject,
  familySubject,
  grocerySubject,
  mealSubject,
  petCareDueOn,
  petSubject,
  schoolSubject,
  type SchoolItemRow,
  type SourceContext,
} from "./sources";
import { atLocal, endOfQuiet, inQuietHours, localMoment } from "./timing";

/**
 * The smart notification engine (module 23), against the spec's own test
 * scenarios (§39): timing by type, state changes, fatigue, personalisation
 * and safety. Everything here is deterministic — no model is involved in
 * whether, when or to whom a reminder goes.
 */

const TZ = "Asia/Kolkata";
const format = formatterFor({ ...DEFAULT_PREFERENCES, language: "en", region: "IN", timezone: TZ, currency: "INR" });
const at = (local: string) => atLocal(local.slice(0, 10), Number(local.slice(11, 13)) * 60 + Number(local.slice(14, 16)), TZ);
const ctx = (now: string): SourceContext => ({ timeZone: TZ, format, now: at(now) });
const open: RecipientSettings = { preset: null, enabled: true, quiet: null };
const owner = { memberId: "kunal", role: "primary" as const };

function member(id: string, over: Partial<DirectoryMember> = {}): DirectoryMember {
  return { id, hasAccount: true, active: true, memberType: "adult", isAdmin: false, isHead: false, ...over };
}
function directory(members: DirectoryMember[], extra: Partial<Directory> = {}): Directory {
  return {
    members: new Map(members.map((entry) => [entry.id, entry])),
    responsibilities: new Map(),
    guardians: new Map(),
    ...extra,
  };
}

describe("the household's own clock", () => {
  it("reads a moment on the household's calendar, not UTC's", () => {
    // 20:00 UTC is already the next morning (01:30) in Kolkata.
    expect(localMoment(new Date("2026-09-23T20:00:00Z"), TZ)).toMatchObject({ dateKey: "2026-09-24", hour: 1, minute: 30 });
  });

  it("turns a local wall-clock time into the right instant", () => {
    expect(atLocal("2026-09-24", 18 * 60 + 15, TZ).toISOString()).toBe("2026-09-24T12:45:00.000Z");
  });

  it("holds across a daylight-saving change", () => {
    // London moves to BST on 29 March 2026: 09:00 that day is 08:00 UTC.
    expect(atLocal("2026-03-29", 9 * 60, "Europe/London").toISOString()).toBe("2026-03-29T08:00:00.000Z");
    expect(atLocal("2026-03-28", 9 * 60, "Europe/London").toISOString()).toBe("2026-03-28T09:00:00.000Z");
  });

  it("knows quiet hours that wrap midnight, and when they end", () => {
    const quiet = { fromMinute: 22 * 60 + 30, untilMinute: 7 * 60 };
    expect(inQuietHours(at("2026-09-24T23:00"), quiet, TZ)).toBe(true);
    expect(inQuietHours(at("2026-09-24T22:00"), quiet, TZ)).toBe(false);
    expect(endOfQuiet(at("2026-09-24T23:00"), quiet, TZ)).toEqual(at("2026-09-25T07:00"));
    expect(endOfQuiet(at("2026-09-25T02:00"), quiet, TZ)).toEqual(at("2026-09-25T07:00"));
  });
});

describe("reminder policies", () => {
  it("every tunable category has a default preset that exists", () => {
    for (const category of TUNABLE_CATEGORIES) {
      const policy = REMINDER_POLICIES[category];
      expect(policy.presets.map((preset) => preset.key)).toContain(policy.defaultPreset);
    }
  });

  it("never lets a policy escalate past the database's bound", () => {
    for (const category of TUNABLE_CATEGORIES) {
      for (const preset of REMINDER_POLICIES[category].presets) expect(preset.stages.length).toBeLessThanOrEqual(10);
    }
  });

  it("falls back to the default for an unknown or retired preset", () => {
    expect(presetFor("bills", "every_five_minutes").key).toBe("three_days_and_due");
  });

  it("bills: 3 days before at 10:00 and the due day at 09:00", () => {
    const stages = planStages(presetFor("bills", null), { kind: "day", date: "2026-09-26" }, TZ);
    expect(stages.map((stage) => stage.idealAt)).toEqual([at("2026-09-23T10:00"), at("2026-09-26T09:00")]);
  });

  it("school: the evening before and the morning of", () => {
    const stages = planStages(presetFor("school", null), { kind: "moment", at: at("2026-09-25T08:30") }, TZ);
    expect(stages.map((stage) => [stage.key, stage.idealAt])).toEqual([
      ["tonight", at("2026-09-24T18:30")],
      ["this_morning", at("2026-09-25T07:00")],
    ]);
  });

  it("a day-of reminder never lands after the thing itself", () => {
    const stages = planStages(presetFor("school", "morning_of"), { kind: "moment", at: at("2026-09-25T06:00") }, TZ);
    expect(stages[0]!.idealAt).toEqual(at("2026-09-25T06:00"));
  });
});

describe("quiet hours", () => {
  const quiet = { fromMinute: 22 * 60, untilMinute: 7 * 60 };

  it("defers a normal reminder to the end of the quiet", () => {
    const placed = placeOutsideQuiet(at("2026-09-24T23:00"), { earliestAt: null, latestAt: null }, quiet, TZ, false);
    expect(placed).toEqual({ at: at("2026-09-25T07:00"), moved: "after_quiet_hours" });
  });

  it("brings it forward when morning would be too late", () => {
    const placed = placeOutsideQuiet(
      at("2026-09-24T23:00"),
      { earliestAt: at("2026-09-24T21:00"), latestAt: at("2026-09-25T06:00") },
      quiet,
      TZ,
      false,
    );
    expect(placed).toEqual({ at: at("2026-09-24T21:59"), moved: "before_quiet_hours" });
  });

  it("only an urgent reminder that could do neither breaks the quiet; anything else comes early, never not at all", () => {
    const window = { earliestAt: at("2026-09-24T22:30"), latestAt: at("2026-09-25T06:00") };
    expect(placeOutsideQuiet(at("2026-09-24T23:00"), window, quiet, TZ, true).moved).toBe("breaks_quiet_hours");
    expect(placeOutsideQuiet(at("2026-09-24T23:00"), window, quiet, TZ, false)).toEqual({ at: at("2026-09-24T21:59"), moved: "before_quiet_hours" });
  });

  it("a plan that starts inside quiet hours still gets its reminder", () => {
    const subject = familySubject(
      { id: "e9", title: "Late film", kind: "family_time", starts_at: at("2026-09-25T01:00").toISOString(), status: "planned", owner_member_id: "kunal" },
      ctx("2026-09-24T12:00"),
    )!;
    const planned = planReminder(subject, owner, { ...open, quiet: { fromMinute: 22 * 60 + 30, untilMinute: 7 * 60 } }, 0, TZ, at("2026-09-24T12:00"));
    expect(planned?.scheduledFor).toEqual(at("2026-09-24T22:29"));
  });
});

describe("smart timing by type (§39)", () => {
  it("a meal reminder uses the recipe's preparation time", () => {
    const subject = mealSubject(
      { id: "m1", name: "Paneer Butter Masala", slot: "dinner", ready_by: at("2026-09-24T19:00").toISOString(), status: "planned", cook_member_id: "kunal", recipe_total_minutes: 45 },
      ctx("2026-09-24T12:00"),
    )!;
    const planned = planReminder(subject, owner, open, 0, TZ, at("2026-09-24T12:00"))!;
    expect(planned.scheduledFor).toEqual(at("2026-09-24T18:15"));
    expect(planned.title).toBe("Dinner preparation");
    expect(planned.body).toContain("7:00");
    expect(planned.priority).toBe("high");
  });

  it("without a recipe it assumes a stated default, never a guess dressed up as knowledge", () => {
    const subject = mealSubject(
      { id: "m1", name: "Dal", slot: "lunch", ready_by: at("2026-09-24T13:00").toISOString(), status: "planned", cook_member_id: null, recipe_total_minutes: null },
      ctx("2026-09-24T08:00"),
    )!;
    expect(planReminder(subject, owner, open, 0, TZ, at("2026-09-24T08:00"))!.scheduledFor).toEqual(at("2026-09-24T12:15"));
    expect(subject.text("start_cooking", at("2026-09-24T12:15")).body).not.toContain("takes about");
  });

  it("a school reminder uses the deadline", () => {
    const subject = schoolSubject(
      { id: "s1", child_member_id: "aarav", kind: "project", title: "Science project", due_at: at("2026-09-25T08:30").toISOString(), due_time_known: true, status: "pending" },
      "Aarav",
      ctx("2026-09-24T12:00"),
    )!;
    const planned = planReminder(subject, owner, open, 0, TZ, at("2026-09-24T12:00"))!;
    expect(planned.scheduledFor).toEqual(at("2026-09-24T18:30"));
    expect(planned.title).toBe("Aarav — Project");
    expect(planned.body).toBe("Science project is due tomorrow by 8:30 am.");
  });

  it("a bill reminder uses the due date and grows more pressing", () => {
    const bill = { id: "b1", name: "Electricity bill", payee: null, amount_minor: 243000, currency: "INR", due_on: "2026-09-26", status: "expected", responsible_member_id: "kunal" };
    const early = planReminder(billSubject(bill, ctx("2026-09-23T11:00"))!, owner, open, 0, TZ, at("2026-09-23T11:00"))!;
    expect(early.body).toBe("Due in 3 days · ₹2,430. Pay by 26 Sept.");
    expect(early.priority).toBe("medium");
    const dueDay = planReminder(billSubject(bill, ctx("2026-09-26T09:30"))!, owner, open, 0, TZ, at("2026-09-26T09:30"))!;
    expect(dueDay.reminderSeq).toBe(2);
    expect(dueDay.body.startsWith("Due today")).toBe(true);
    expect(dueDay.priority).toBe("high");
  });

  it("a pet reminder lands on the day care is due", () => {
    const subject = petSubject(
      { id: "p1", kind: "medication", due_on: "2026-09-24", last_done_on: null, interval_days: null, responsible_member_id: null, pet_name: "Mochi" },
      ctx("2026-09-24T06:00"),
    )!;
    expect(planReminder(subject, owner, open, 0, TZ, at("2026-09-24T06:00"))!.scheduledFor).toEqual(at("2026-09-24T08:00"));
    expect(petCareDueOn({ due_on: null, last_done_on: "2026-09-20", interval_days: 7 })).toBe("2026-09-27");
    expect(petCareDueOn({ due_on: null, last_done_on: null, interval_days: 7 })).toBeNull();
    // A one-off vet visit, done on its day, is finished.
    expect(petCareDueOn({ due_on: "2026-09-24", last_done_on: "2026-09-24", interval_days: null })).toBeNull();
  });

  it("a family plan is an hour before it starts", () => {
    const subject = familySubject(
      { id: "e1", title: "Movie night", kind: "family_time", starts_at: at("2026-09-24T20:00").toISOString(), status: "planned", owner_member_id: "kunal" },
      ctx("2026-09-24T10:00"),
    )!;
    expect(planReminder(subject, owner, open, 0, TZ, at("2026-09-24T10:00"))!.scheduledFor).toEqual(at("2026-09-24T19:00"));
  });

  it("appointments are left to Health's own reminders — never reminded twice", () => {
    expect(
      familySubject({ id: "e2", title: "Dentist", kind: "appointment", starts_at: at("2026-09-24T20:00").toISOString(), status: "planned", owner_member_id: "kunal" }, ctx("2026-09-24T10:00")),
    ).toBeNull();
  });
});

describe("state changes (§39)", () => {
  it("a paid, cancelled or waived bill has nothing left to remind about", () => {
    for (const status of ["paid", "cancelled", "waived"]) {
      expect(billSubject({ id: "b1", name: "Rent", payee: null, amount_minor: null, currency: null, due_on: "2026-09-26", status, responsible_member_id: null }, ctx("2026-09-24T10:00"))).toBeNull();
    }
  });

  it("done school work has nothing left to remind about", () => {
    expect(
      schoolSubject({ id: "s1", child_member_id: "c", kind: "homework", title: "Maths", due_at: at("2026-09-25T08:00").toISOString(), due_time_known: true, status: "done" }, "Aarav", ctx("2026-09-24T10:00")),
    ).toBeNull();
  });

  it("a ready or eaten meal has nothing left to remind about", () => {
    for (const status of ["ready", "eaten", "skipped", "replanned"]) {
      expect(mealSubject({ id: "m", name: "Dal", slot: "dinner", ready_by: at("2026-09-24T19:00").toISOString(), status, cook_member_id: null, recipe_total_minutes: 30 }, ctx("2026-09-24T10:00"))).toBeNull();
    }
  });

  it("dismissing the first reminder never silences a later one", () => {
    const subject = schoolSubject(
      { id: "s1", child_member_id: "aarav", kind: "project", title: "Science project", due_at: at("2026-09-25T08:30").toISOString(), due_time_known: true, status: "pending" },
      "Aarav",
      ctx("2026-09-24T19:00"),
    )!;
    // The evening reminder was dismissed (closed stage 1): the morning one still comes.
    const planned = planReminder(subject, owner, open, 1, TZ, at("2026-09-24T19:00"))!;
    expect(planned.reminderSeq).toBe(2);
    expect(planned.scheduledFor).toEqual(at("2026-09-25T07:00"));
    // Both handled: nothing more.
    expect(planReminder(subject, owner, open, 2, TZ, at("2026-09-24T19:00"))).toBeNull();
  });

  it("a postponed due date reschedules the same reminder", () => {
    const row = openRow({ thread_key: "school:s1", source_type: "school_item", reminder_seq: 1, scheduled_for: at("2026-09-24T18:30").toISOString() });
    const moved = planReminder(
      schoolSubject(
        { id: "s1", child_member_id: "aarav", kind: "project", title: "Science project", due_at: at("2026-09-28T08:30").toISOString(), due_time_known: true, status: "pending" },
        "Aarav",
        ctx("2026-09-24T10:00"),
      )!,
      owner,
      open,
      0,
      TZ,
      at("2026-09-24T10:00"),
    )!;
    const patch = patchFor(row, moved, at("2026-09-24T10:00"))!;
    expect(patch.scheduled_for).toBe(at("2026-09-27T18:30").toISOString());
    expect(patch.status).toBe("generated");
  });

  it("paying a recurring bill starts next month's reminders on a new thread", () => {
    const thisMonth = billSubject({ id: "b1", name: "Rent", payee: null, amount_minor: null, currency: null, due_on: "2026-09-26", status: "expected", responsible_member_id: "kunal" }, ctx("2026-09-24T10:00"))!;
    const nextMonth = billSubject({ id: "b1", name: "Rent", payee: null, amount_minor: null, currency: null, due_on: "2026-10-26", status: "expected", responsible_member_id: "kunal" }, ctx("2026-09-24T10:00"))!;
    expect(thisMonth.threadKey).not.toBe(nextMonth.threadKey);
  });

  it("stops once the thing has passed", () => {
    const subject = mealSubject(
      { id: "m", name: "Dal", slot: "dinner", ready_by: at("2026-09-24T19:00").toISOString(), status: "planned", cook_member_id: null, recipe_total_minutes: 30 },
      ctx("2026-09-24T19:30"),
    )!;
    expect(planReminder(subject, owner, open, 0, TZ, at("2026-09-24T19:30"))).toBeNull();
  });
});

describe("notification fatigue (§39)", () => {
  it("related grocery items become one reminder", () => {
    const subject = grocerySubject(
      [
        { name: "Milk", category: "grocery", needed_by: null },
        { name: "bread", category: "grocery", needed_by: null },
        { name: "eggs", category: "grocery", needed_by: null },
        { name: "tomatoes", category: "grocery", needed_by: null },
      ],
      ctx("2026-09-24T10:00"),
    )!;
    const planned = planReminder(subject, owner, open, 0, TZ, at("2026-09-24T10:00"))!;
    expect(planned.title).toBe("Grocery list needs attention");
    expect(planned.body).toBe("Milk, bread, eggs and tomatoes are running low.");
    expect(planned.scheduledFor).toEqual(at("2026-09-24T17:00"));
    expect(planned.priority).toBe("low");
  });

  it("no list, no reminder", () => {
    expect(grocerySubject([], ctx("2026-09-24T10:00"))).toBeNull();
  });

  it("a person who turned a category off hears nothing from it", () => {
    const subject = familySubject(
      { id: "e1", title: "Movie night", kind: "family_time", starts_at: at("2026-09-24T20:00").toISOString(), status: "planned", owner_member_id: "kunal" },
      ctx("2026-09-24T10:00"),
    )!;
    expect(planReminder(subject, owner, { ...open, enabled: false }, 0, TZ, at("2026-09-24T10:00"))).toBeNull();
  });

  it("quiet hours hold a normal reminder until morning", () => {
    const subject = familySubject(
      { id: "e1", title: "Early walk", kind: "outing", starts_at: at("2026-09-25T07:30").toISOString(), status: "planned", owner_member_id: "kunal" },
      ctx("2026-09-24T10:00"),
    )!;
    const planned = planReminder(
      subject,
      owner,
      { ...open, preset: "evening_and_hour_before", quiet: { fromMinute: 18 * 60 + 30, untilMinute: 6 * 60 } },
      0,
      TZ,
      at("2026-09-24T10:00"),
    )!;
    // 19:00 the evening before is quiet for this person; it lands just before the quiet began instead.
    expect(planned.scheduledFor).toEqual(at("2026-09-24T18:29"));
    expect(planned.placement).toBe("before_quiet_hours");
  });

  it("the household's HomeTalk quiet-hours rule is read, and nonsense is ignored", () => {
    expect(quietFromPolicy({ quietFromHour: 21, quietUntilHour: 7 })).toEqual({ fromMinute: 1260, untilMinute: 420 });
    expect(quietFromPolicy({ quietFromHour: "late" })).toBeNull();
    expect(quietFromPolicy(null)).toBeNull();
  });
});

describe("personalisation (§39)", () => {
  const bill = billSubject(
    { id: "b1", name: "Rent", payee: null, amount_minor: null, currency: null, due_on: "2026-09-26", status: "expected", responsible_member_id: null },
    ctx("2026-09-24T10:00"),
  )!;

  it("the responsibility's owner hears about it — one person, never the household", () => {
    const chosen = chooseReminderRecipient(
      bill,
      directory([member("kunal", { isAdmin: true, isHead: true }), member("priya")], {
        responsibilities: new Map([["finance.bills_paid", { primary: "priya", backup: "kunal" }]]),
      }),
    );
    expect(chosen).toEqual({ memberId: "priya", role: "primary" });
  });

  it("the record's own named person comes first", () => {
    const named = billSubject(
      { id: "b1", name: "Rent", payee: null, amount_minor: null, currency: null, due_on: "2026-09-26", status: "expected", responsible_member_id: "kunal" },
      ctx("2026-09-24T10:00"),
    )!;
    const chosen = chooseReminderRecipient(
      named,
      directory([member("kunal"), member("priya")], { responsibilities: new Map([["finance.bills_paid", { primary: "priya", backup: null }]]) }),
    );
    expect(chosen?.memberId).toBe("kunal");
  });

  it("with nobody named, the household's Admin — the head first", () => {
    const chosen = chooseReminderRecipient(bill, directory([member("admin2", { isAdmin: true }), member("head", { isAdmin: true, isHead: true }), member("adult")]));
    expect(chosen).toEqual({ memberId: "head", role: "administrator" });
  });

  it("a child's school work goes to their guardian, not to the child", () => {
    const school = schoolSubject(
      { id: "s1", child_member_id: "aarav", kind: "homework", title: "Maths", due_at: at("2026-09-25T08:00").toISOString(), due_time_known: true, status: "pending" },
      "Aarav",
      ctx("2026-09-24T10:00"),
    )!;
    const chosen = chooseReminderRecipient(
      school,
      directory([member("aarav", { memberType: "child" }), member("priya"), member("kunal", { isAdmin: true, isHead: true })], {
        guardians: new Map([["aarav", ["priya"]]]),
      }),
    );
    expect(chosen?.memberId).toBe("priya");
  });

  it("someone without an account, or no longer active, is never the recipient", () => {
    const chosen = chooseReminderRecipient(
      bill,
      directory([member("priya", { hasAccount: false }), member("gone", { active: false }), member("kunal", { isAdmin: true })], {
        responsibilities: new Map([["finance.bills_paid", { primary: "priya", backup: "gone" }]]),
      }),
    );
    expect(chosen?.memberId).toBe("kunal");
  });

  it("builds the directory from the household's rows", () => {
    const built = buildDirectory(
      [
        { id: "k", profile_id: "p", member_type: "adult", status: "active" },
        { id: "c", profile_id: null, member_type: "child", status: "active" },
      ],
      [{ member_id: "k", role: "head" }],
      [{ outcome_key: "pets.fed", primary_member_id: "k", backup_member_id: null }],
      [{ child_member_id: "c", guardian_member_id: "k" }],
    );
    expect(built.members.get("k")).toMatchObject({ isAdmin: true, isHead: true, hasAccount: true });
    expect(built.members.get("c")).toMatchObject({ hasAccount: false, memberType: "child" });
    expect(built.guardians.get("c")).toEqual(["k"]);
  });
});

describe("idempotency (§29)", () => {
  const subject = () =>
    billSubject(
      { id: "b1", name: "Electricity bill", payee: null, amount_minor: 243000, currency: "INR", due_on: "2026-09-26", status: "expected", responsible_member_id: "kunal" },
      ctx("2026-09-23T11:00"),
    )!;

  it("planning twice gives the same reminder", () => {
    const first = planReminder(subject(), owner, open, 0, TZ, at("2026-09-23T11:00"));
    const second = planReminder(subject(), owner, open, 0, TZ, at("2026-09-23T11:00"));
    expect(second).toEqual(first);
  });

  it("an up-to-date reminder is never rewritten", () => {
    const want = planReminder(subject(), owner, open, 0, TZ, at("2026-09-23T11:00"))!;
    const row = openRow({
      reminder_seq: want.reminderSeq,
      scheduled_for: want.scheduledFor.toISOString(),
      title: want.title,
      body: want.body,
      priority: want.storedPriority,
      earliest_at: want.earliestAt.toISOString(),
      latest_at: want.latestAt.toISOString(),
      expires_at: want.expiresAt.toISOString(),
      reminder_policy: want.reminderPolicy,
    });
    expect(patchFor(row, want, at("2026-09-23T11:00"))).toBeNull();
  });

  it("a snooze the person chose is kept until a new stage arrives", () => {
    const want = planReminder(subject(), owner, open, 0, TZ, at("2026-09-23T11:00"))!;
    const snoozed = openRow({ reminder_seq: 1, snooze_count: 1, scheduled_for: at("2026-09-23T15:00").toISOString(), title: want.title, body: want.body, priority: want.storedPriority, earliest_at: want.earliestAt.toISOString(), latest_at: want.latestAt.toISOString(), expires_at: want.expiresAt.toISOString(), reminder_policy: want.reminderPolicy });
    expect(patchFor(snoozed, want, at("2026-09-23T11:00"))).toBeNull();

    const dueDay = planReminder(subject(), owner, open, 0, TZ, at("2026-09-26T09:30"))!;
    expect(patchFor(snoozed, dueDay, at("2026-09-26T09:30"))).toMatchObject({ reminder_seq: 2, status: "generated" });
  });
});

describe("snooze and custom reminders (§15, §16)", () => {
  it("each preset lands where it says, on the household's clock", () => {
    const now = at("2026-09-24T14:10");
    expect(snoozeUntil("in_15_minutes", now, TZ)).toEqual(at("2026-09-24T14:25"));
    expect(snoozeUntil("in_1_hour", now, TZ)).toEqual(at("2026-09-24T15:10"));
    expect(snoozeUntil("later_today", now, TZ)).toEqual(at("2026-09-24T18:00"));
    expect(snoozeUntil("tomorrow_morning", now, TZ)).toEqual(at("2026-09-25T08:00"));
  });

  it("'later today' in the evening is a couple of hours on, never this morning", () => {
    expect(snoozeUntil("later_today", at("2026-09-24T19:30"), TZ)).toEqual(at("2026-09-24T21:30"));
  });

  it("every preset is in the future and within the month the database allows", () => {
    const now = at("2026-09-24T23:50");
    for (const preset of SNOOZE_PRESETS) expect(validSnoozeTime(snoozeUntil(preset, now, TZ), now)).toBe(true);
  });

  it("a picked time must be ahead, and not beyond a month", () => {
    const now = at("2026-09-24T10:00");
    expect(validSnoozeTime(at("2026-09-24T09:00"), now)).toBe(false);
    expect(validSnoozeTime(at("2026-11-30T09:00"), now)).toBe(false);
    expect(validSnoozeTime(at("2026-09-25T09:00"), now)).toBe(true);
  });
});

describe("smart batching (§21, story 23-008)", () => {
  const now = "2026-09-24T10:00";
  const item = (id: string, title: string, kind: string, child = "aarav", dueAt = at("2026-09-25T09:00").toISOString()): SchoolItemRow => ({
    id, child_member_id: child, kind, title, due_at: dueAt, due_time_known: true, status: "pending",
  });
  const route = (rows: SchoolItemRow[], to = "kunal") => {
    const schoolRows = new Map();
    const routed = rows.map((row) => {
      const subject = schoolSubject(row, row.child_member_id === "aarav" ? "Aarav" : "Diya", ctx(now))!;
      schoolRows.set(subject, row);
      return { subject, recipient: { memberId: to, role: "primary" as const } };
    });
    return batchSchoolDays(routed, schoolRows, new Map([["aarav", "Aarav"], ["diya", "Diya"]]), ctx(now));
  };

  it("a child's things due the same day become one reminder that names each of them", () => {
    const [one, ...rest] = route([item("s1", "Science project", "project"), item("s2", "Maths worksheet", "worksheet"), item("s3", "Sports day", "event")]);
    expect(rest).toHaveLength(0);
    expect(one!.subject.sourceType).toBe("school_day");
    expect(one!.subject.items).toEqual(["s1", "s2", "s3"]);
    const planned = planReminder(one!.subject, owner, open, 0, TZ, at(now))!;
    expect(planned.title).toBe("Aarav — 3 things for tomorrow");
    expect(planned.body).toBe("Science project, Maths worksheet and Sports day.");
    expect(decisionFactors(planned).items).toEqual(["s1", "s2", "s3"]);
  });

  it("is as urgent as the most urgent thing in it — nothing is hidden in a quieter group", () => {
    const [one] = route([item("s1", "Sports day", "event"), item("s2", "Maths worksheet", "worksheet")]);
    expect(planReminder(one!.subject, owner, open, 0, TZ, at(now))!.priority).toBe("medium");
  });

  it("never groups different children, different days, or a single item", () => {
    expect(route([item("s1", "Project", "project"), item("s2", "Worksheet", "worksheet", "diya")]).map((entry) => entry.subject.sourceType)).toEqual(["school_item", "school_item"]);
    expect(route([item("s1", "Project", "project"), item("s2", "Worksheet", "worksheet", "aarav", at("2026-09-26T09:00").toISOString())]).map((entry) => entry.subject.sourceType)).toEqual(["school_item", "school_item"]);
    expect(route([item("s1", "Project", "project")])[0]!.subject.sourceType).toBe("school_item");
  });
});

describe("escalation (§20, §22, story 23-010)", () => {
  const primary = planReminder(
    billSubject({ id: "b1", name: "Electricity bill", payee: null, amount_minor: null, currency: null, due_on: "2026-09-26", status: "expected", responsible_member_id: null }, ctx("2026-09-26T10:00"))!,
    owner,
    open,
    0,
    TZ,
    at("2026-09-26T10:00"),
  )!;
  const delivered = (hoursAgo: number, over: Partial<{ reminder_seq: number; status: string; snooze_count: number }> = {}) => ({
    reminder_seq: primary.reminderSeq,
    status: "delivered",
    snooze_count: 0,
    delivered_at: new Date(at("2026-09-26T10:00").getTime() - hoursAgo * 3_600_000).toISOString(),
    ...over,
  });

  it("every policy has a maximum: its stages, and one backup at most", () => {
    expect(maxRemindersFor("bills", null)).toBe(3);
    expect(maxRemindersFor("meals", null)).toBe(1);
    for (const category of TUNABLE_CATEGORIES) {
      for (const preset of REMINDER_POLICIES[category].presets) expect(maxRemindersFor(category, preset.key)).toBeLessThanOrEqual(10);
    }
  });

  it("the backup hears only once the last reminder has gone unanswered for the policy's wait", () => {
    expect(primary.finalStage).toBe(true);
    expect(isUnanswered(primary, delivered(1), at("2026-09-26T10:00"))).toBe(false);
    expect(isUnanswered(primary, delivered(4), at("2026-09-26T10:00"))).toBe(true);
    // Snoozed back to waiting, or not the last stage: not yet.
    expect(isUnanswered(primary, delivered(4, { status: "generated" }), at("2026-09-26T10:00"))).toBe(false);
    expect(isUnanswered({ ...primary, finalStage: false }, delivered(4), at("2026-09-26T10:00"))).toBe(false);
    // A kind that never escalates never does.
    expect(isUnanswered({ ...primary, category: "meals" }, delivered(4), at("2026-09-26T10:00"))).toBe(false);
  });

  it("goes to the responsibility's backup, says who has not answered, and never again once dismissed", () => {
    const dir = directory([member("kunal"), member("priya"), member("aarav", { memberType: "child" })], {
      responsibilities: new Map([["finance.bills_paid", { primary: "kunal", backup: "priya" }]]),
    });
    const subject = billSubject({ id: "b1", name: "Electricity bill", payee: null, amount_minor: null, currency: null, due_on: "2026-09-26", status: "expected", responsible_member_id: null }, ctx("2026-09-26T10:00"))!;
    expect(backupFor(subject, dir, "kunal")).toBe("priya");
    expect(backupFor(subject, dir, "priya")).toBeNull();

    const escalation = planEscalation(primary, "priya", "Kunal", open, 0, TZ, at("2026-09-26T13:30"))!;
    expect(escalation).toMatchObject({ recipientMemberId: "priya", recipientRole: "backup", escalatedFrom: "kunal" });
    expect(escalation.body).toContain("Kunal has not marked it done yet.");
    expect(decisionFactors(escalation).escalatedFrom).toBe("kunal");
    expect(planEscalation(primary, "priya", "Kunal", open, primary.reminderSeq, TZ, at("2026-09-26T13:30"))).toBeNull();
    expect(planEscalation(primary, "priya", "Kunal", { ...open, enabled: false }, 0, TZ, at("2026-09-26T13:30"))).toBeNull();
  });

  it("respects the backup's own quiet hours", () => {
    const late = planEscalation(primary, "priya", "Kunal", { ...open, quiet: { fromMinute: 22 * 60, untilMinute: 7 * 60 } }, 0, TZ, at("2026-09-26T22:30"))!;
    expect(late.scheduledFor).not.toEqual(at("2026-09-26T22:30"));
    expect(inQuietHours(late.scheduledFor, { fromMinute: 22 * 60, untilMinute: 7 * 60 }, TZ) && late.placement !== "breaks_quiet_hours").toBe(false);
  });
});

describe("timing learned from behaviour (§24, story 23-012)", () => {
  const days = (minute: number, count: number, jitter = 0) =>
    Array.from({ length: count }, (_, index) => atLocal(`2026-09-${String(10 + index).padStart(2, "0")}`, minute + (index % 2 === 0 ? jitter : -jitter), TZ));

  it("needs five consistent times; fewer, or scattered ones, teach nothing", () => {
    expect(learnedMinuteFrom(days(19 * 60 + 15, 4), TZ)).toBeNull();
    expect(learnedMinuteFrom(days(19 * 60 + 13, 6, 10), TZ)).toEqual({ minute: 19 * 60 + 15, evidence: 6 });
    const scattered = [...days(9 * 60, 3), ...days(21 * 60, 3)];
    expect(learnedMinuteFrom(scattered, TZ)).toBeNull();
  });

  it("moves only the advance notice, and only when it still comes before the next reminder", () => {
    const bills = withLearnedTime(presetFor("bills", null), 19 * 60)!;
    expect(bills.stages[0]!.at).toEqual({ kind: "daysBefore", days: 3, atMinute: 19 * 60 });
    expect(bills.stages[1]!.at).toEqual(presetFor("bills", null).stages[1]!.at);
    // "Before" stages (an hour before an outing) are never moved.
    expect(withLearnedTime(presetFor("family", null), 19 * 60)).toBeNull();
    // A shift that would land it after the next stage on the same day is refused.
    const sameDay = { key: "x", label: "x", stages: [{ key: "a", at: { kind: "dayOf" as const, atMinute: 8 * 60 } }, { key: "b", at: { kind: "dayOf" as const, atMinute: 12 * 60 } }] };
    expect(withLearnedTime(sameDay, 13 * 60)).toBeNull();
  });

  it("a learned time is claimed only when it actually moved the reminder", () => {
    const subject = billSubject({ id: "b1", name: "Electricity bill", payee: null, amount_minor: null, currency: null, due_on: "2026-09-29", status: "expected", responsible_member_id: null }, ctx("2026-09-24T10:00"))!;
    const learned = planReminder(subject, owner, { ...open, learnedMinute: 19 * 60 + 15 }, 0, TZ, at("2026-09-24T10:00"))!;
    expect(learned.scheduledFor).toEqual(at("2026-09-26T19:15"));
    expect(learned.timing).toBe("learned");
    expect(decisionFactors(learned).timing).toBe("learned");
    // Meals never learn (their time is the recipe's), so nothing is claimed.
    const meal = mealSubject({ id: "m1", name: "Dal", slot: "dinner", ready_by: at("2026-09-24T20:00").toISOString(), status: "planned", cook_member_id: "kunal", recipe_total_minutes: 30 }, ctx("2026-09-24T10:00"))!;
    expect(planReminder(meal, owner, { ...open, learnedMinute: 19 * 60 }, 0, TZ, at("2026-09-24T10:00"))!.timing).toBe("policy");
  });
});

function openRow(over: Partial<OpenRow>): OpenRow {
  return {
    id: "n1",
    recipient_member_id: "kunal",
    thread_key: "bill:b1:2026-09-26",
    source_type: "obligation",
    reminder_seq: 1,
    scheduled_for: new Date(0).toISOString(),
    snooze_count: 0,
    status: "delivered",
    title: "x",
    body: "x",
    priority: "normal",
    earliest_at: null,
    latest_at: null,
    expires_at: null,
    reminder_policy: null,
    delivered_at: null,
    ...over,
  };
}
