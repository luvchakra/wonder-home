import { describe, expect, it } from "vitest";

import { formatterFor } from "../i18n/format";
import { en } from "../i18n/messages/en";
import { DEFAULT_PREFERENCES, type LocalePreferences } from "../i18n/preferences";
import { translator, translatorFor } from "../i18n/translate";
import { localizeReminder, msg, parseCopy, plain, renderCopy, sameCopy, type NotificationCopy } from "./message";
import { planEscalation, planReminder, type ChosenRecipient, type RecipientSettings } from "./plan";
import { billSubject, grocerySubject, schoolDaySubject, schoolSubject, type SourceContext } from "./sources";

/** Story 22-006: a reminder is an event and its parameters, read by each recipient in their own language. */

const TZ = "Asia/Kolkata";
const prefs = (over: Partial<LocalePreferences>): LocalePreferences => ({ ...DEFAULT_PREFERENCES, region: "IN", timezone: TZ, currency: "INR", ...over });
const english = formatterFor(prefs({ language: "en" }));
const ctx = (now: string): SourceContext => ({ timeZone: TZ, format: english, now: new Date(now) });

async function readAs(language: LocalePreferences["language"], copy: NotificationCopy) {
  return renderCopy(copy, await translatorFor(language), formatterFor(prefs({ language })));
}

const bill = () =>
  billSubject(
    { id: "b1", name: "BESCOM Electricity", payee: null, amount_minor: 243050, currency: "INR", due_on: "2026-09-26", status: "expected", responsible_member_id: "kunal" },
    ctx("2026-09-23T05:30:00Z"),
  )!;

describe("the stored English is the message read in English", () => {
  it("renders the same words the record keeps", () => {
    const text = bill().text("three_days", new Date("2026-09-23T05:30:00Z"));
    expect(text.body).toBe("Due in 3 days · ₹2,430.50. Pay by 26 Sept.");
    expect(renderCopy(text.copy, translator("en", en), english)).toEqual({ title: text.title, body: text.body });
  });
});

describe("each recipient reads it in their own language", () => {
  it("Hindi: WonderHome's words translate; the bill's own name and amount do not", async () => {
    const { title, body } = await readAs("hi", bill().text("three_days", new Date("2026-09-23T05:30:00Z")).copy);
    expect(title).toBe("BESCOM Electricity");
    expect(body).toContain("3 दिन में देय");
    expect(body).toContain("₹2,430.50");
    expect(body).toContain("भुगतान करें");
    expect(body).not.toMatch(/Due|Pay by/);
  });

  it("Arabic picks its own plural form for the count", async () => {
    const { body } = await readAs("ar", bill().text("three_days", new Date("2026-09-23T05:30:00Z")).copy);
    expect(body).toContain("مستحقة خلال 3 أيام");
  });

  it("a school reminder names the child and the item as written, and the time in the reader's clock", async () => {
    const subject = schoolSubject(
      { id: "s1", child_member_id: "aarav", kind: "homework", title: "Maths worksheet 4", due_at: "2026-09-25T03:30:00Z", due_time_known: true, status: "pending" },
      "Aarav",
      ctx("2026-09-24T12:00:00Z"),
    )!;
    const copy = subject.text("tonight", new Date("2026-09-24T12:00:00Z")).copy;
    const spanish = await readAs("es", copy);
    expect(spanish.title).toBe("Aarav — Deberes");
    expect(spanish.body).toBe(`Maths worksheet 4 se entrega mañana antes de las ${formatterFor(prefs({ language: "es" })).time("2026-09-25T03:30:00Z")}.`);
  });

  it("a child with no name on record is 'your child' in the reader's language, never a stored English phrase", async () => {
    const subject = schoolSubject(
      { id: "s1", child_member_id: "c", kind: "exam", title: "Science", due_at: "2026-09-25T00:00:00Z", due_time_known: false, status: "pending" },
      null,
      ctx("2026-09-24T12:00:00Z"),
    )!;
    const text = subject.text("tonight", new Date("2026-09-24T12:00:00Z"));
    expect(text.title).toBe("Your child — Exam");
    expect((await readAs("fr", text.copy)).title).toBe("Votre enfant — Contrôle");
  });

  it("lists are joined the way the reader's language joins them", async () => {
    const copy = grocerySubject(
      [
        { name: "Milk", needed_by: null, category: "dairy" },
        { name: "Bread", needed_by: null, category: "bakery" },
        { name: "Eggs", needed_by: null, category: "dairy" },
      ],
      ctx("2026-09-24T03:00:00Z"),
    )!.text("morning", new Date("2026-09-24T03:00:00Z"));
    expect(copy.body).toBe("Milk, Bread and Eggs are running low.");
    expect((await readAs("de", copy.copy)).body).toBe("Gehen zur Neige: Milk, Bread und Eggs.");
  });

  it("a grouped school day and its escalation both travel as messages", async () => {
    const context = ctx("2026-09-24T12:00:00Z");
    const rows = ["Maths", "Hindi"].map((title, index) => ({
      id: `s${index}`,
      child_member_id: "aarav",
      kind: "homework",
      title,
      due_at: "2026-09-25T00:00:00Z",
      due_time_known: false,
      status: "pending",
    }));
    const day = schoolDaySubject(rows.map((row) => ({ row, subject: schoolSubject(row, "Aarav", context)! })), "Aarav", context)!;
    const recipient: ChosenRecipient = { memberId: "kunal", role: "primary" };
    const settings: RecipientSettings = { preset: null, enabled: true, quiet: null, learnedMinute: null };
    const primary = planReminder(day, recipient, settings, 0, TZ, new Date("2026-09-24T14:00:00Z"))!;
    expect(primary.title).toBe("Aarav — 2 things for tomorrow");
    const backup = planEscalation(primary, "asha", "Kunal", settings, 0, TZ, new Date("2026-09-24T15:00:00Z"))!;
    expect(backup.body).toBe("Maths and Hindi. Kunal has not marked it done yet.");
    const hindi = await readAs("hi", backup.copy);
    expect(hindi.title).toBe("Aarav — कल के लिए 2 चीज़ें");
    expect(hindi.body).toBe("Maths और Hindi। Kunal ने इसे अभी तक पूरा नहीं किया है।");
  });
});

describe("a stored message is data, never trusted blindly", () => {
  const copy: NotificationCopy = { v: 1, title: plain("Rent"), body: msg("reminder.bill.body", { when: { msg: msg("reminder.bill.dueToday") }, date: { date: "2026-09-24" } }) };

  it("reads a well-formed message back", () => {
    expect(parseCopy(JSON.parse(JSON.stringify(copy)))).toEqual(copy);
  });

  it("refuses a key that is not WonderHome's reminder wording, or a value of the wrong shape", () => {
    expect(parseCopy({ ...copy, title: { key: "settings.saved" } })).toBeNull();
    expect(parseCopy({ ...copy, title: { key: "reminder.nope" } })).toBeNull();
    expect(parseCopy({ ...copy, body: msg("reminder.bill.body", { date: { date: "tomorrow" } }) })).toBeNull();
    expect(parseCopy({ ...copy, v: 2 })).toBeNull();
    expect(parseCopy(null)).toBeNull();
  });

  it("an unreadable message shows the stored English, exactly", () => {
    const row = { title: "Rent", body: "Due today. Pay by 24 Sept.", message: { v: 1, title: { key: "reminder.unknown" }, body: {} } };
    expect(localizeReminder(row, translator("en", en), english)).toBe(row);
  });

  it("a name that looks like a placeholder is shown as written, never filled in", async () => {
    const tricky: NotificationCopy = { v: 1, title: plain("{when}"), body: msg("reminder.isToday", { title: "{time} party" }) };
    const words = await readAs("hi", tricky);
    expect(words.title).toBe("{when}");
    expect(words.body).toBe("{time} party आज है।");
  });

  it("two messages that differ only in key order are the same message", () => {
    const reversed = JSON.parse(JSON.stringify({ body: copy.body, title: copy.title, v: 1 }));
    expect(sameCopy(copy, reversed)).toBe(true);
    expect(sameCopy(copy, { ...copy, title: plain("Water") })).toBe(false);
    expect(sameCopy(null, undefined)).toBe(true);
  });
});
