import { describe, expect, it } from "vitest";

import {
  appointmentEntries,
  billEntries,
  helperEntries,
  mealEntries,
  orderEntries,
  outcomeEntries,
  schoolItemEntries,
  seesAppointment,
  upkeepEntries,
  type AppointmentRecord,
  type ModuleViewer,
} from "./modules";

const TZ = "Asia/Kolkata";
const range = { from: "2026-10-01", to: "2026-10-31" };
const adult: ModuleViewer = { memberId: "kunal", isAdmin: true, timeZone: TZ, financeView: true, adult: true, guardianOf: ["asmi"] };
const child: ModuleViewer = { memberId: "asmi", isAdmin: false, timeZone: TZ, financeView: false, adult: false, guardianOf: [] };
const words = { appointment: (type: string) => (type === "dentist" ? "Dentist" : type), busy: "Busy", helperAway: (name: string) => `${name} away`, delivery: (provider: string) => `Delivery · ${provider}` };

describe("school items", () => {
  const item = { id: "s1", childMemberId: "asmi", title: "Maths worksheet", subject: "Maths", status: "pending", dueTimeKnown: true, endsAt: null };

  it("puts homework due as a Due marker and an exam as a block", () => {
    const [due, exam] = schoolItemEntries(
      [
        { ...item, kind: "homework", dueAt: new Date("2026-10-10T03:30:00Z") },
        { ...item, id: "s2", kind: "exam", title: "Science test", dueAt: new Date("2026-10-12T04:00:00Z") },
      ],
      adult,
      range,
    );
    expect(due).toMatchObject({ id: "school:s1", kind: "due", end: null, memberIds: ["asmi"], category: "school", href: "/school?child=asmi" });
    expect(exam).toMatchObject({ kind: "block", title: "Science test" });
    expect(exam!.end!.getTime() - exam!.start.getTime()).toBe(60 * 60_000);
  });

  it("leaves out handled work, notices, and anything outside the range", () => {
    const entries = schoolItemEntries(
      [
        { ...item, kind: "homework", status: "done", dueAt: new Date("2026-10-10T03:30:00Z") },
        { ...item, id: "s3", kind: "notice", dueAt: new Date("2026-10-10T03:30:00Z") },
        { ...item, id: "s4", kind: "homework", dueAt: new Date("2026-11-02T03:30:00Z") },
        { ...item, id: "s5", kind: "exam", status: "cancelled", dueAt: new Date("2026-10-10T03:30:00Z") },
      ],
      adult,
      range,
    );
    expect(entries).toEqual([]);
  });

  it("an item with no known time is all day on its local date", () => {
    const [entry] = schoolItemEntries([{ ...item, kind: "project", dueTimeKnown: false, dueAt: new Date("2026-10-20T20:00:00Z") }], adult, range);
    expect(entry).toMatchObject({ allDay: true, start: new Date("2026-10-20T18:30:00Z") });
  });
});

describe("meals", () => {
  it("a planned meal is a marker at its ready time; a skipped one is not shown", () => {
    const entries = mealEntries(
      [
        { id: "m1", name: "Rajma chawal", readyBy: new Date("2026-10-05T14:30:00Z"), cookMemberId: "upasna", status: "planned" },
        { id: "m2", name: "Pasta", readyBy: new Date("2026-10-06T14:30:00Z"), cookMemberId: null, status: "skipped" },
      ],
      adult,
      range,
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: "marker", category: "meals", ownerMemberId: "upasna", href: "/meals", end: null });
  });
});

describe("bills", () => {
  const bills = [
    { id: "b1", name: "Electricity", dueOn: "2026-10-15", status: "expected", responsibleMemberId: "kunal" },
    { id: "b2", name: "Water", dueOn: "2026-10-16", status: "paid", responsibleMemberId: null },
  ];

  it("shows a bill still to pay as a Due marker, by name only", () => {
    const entries = billEntries(bills, adult, range);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ title: "Electricity", kind: "due", allDay: true, detail: null, href: "/bills" });
  });

  it("shows nothing without finance.view", () => {
    expect(billEntries(bills, { ...adult, financeView: false }, range)).toEqual([]);
  });
});

describe("health appointments", () => {
  const appointment: AppointmentRecord = {
    id: "h1",
    memberId: "upasna",
    appointmentType: "dentist",
    status: "confirmed",
    privacyScope: "selected_family",
    startsAt: new Date("2026-10-08T05:00:00Z"),
    endsAt: null,
    provider: "Dr Rao",
    facility: null,
    familyEventId: null,
  };

  it("someone else's appointment reads Busy, with no kind, place or link (D4)", () => {
    const [entry] = appointmentEntries([appointment], adult, range, words);
    expect(entry).toMatchObject({ title: "Busy", detail: null, href: null, memberIds: ["upasna"], kind: "block" });
  });

  it("the person themselves, a guardian and a household-wide appointment see what it is", () => {
    expect(appointmentEntries([{ ...appointment, memberId: "kunal" }], adult, range, words)[0]).toMatchObject({ title: "Dentist", detail: "Dr Rao", href: "/health" });
    expect(seesAppointment({ memberId: "asmi", privacyScope: "private" }, adult)).toBe(true);
    expect(seesAppointment({ memberId: "upasna", privacyScope: "household_operational" }, child)).toBe(true);
    expect(seesAppointment({ memberId: "upasna", privacyScope: "private" }, child)).toBe(false);
  });

  it("an appointment already on the calendar as a family event shows once", () => {
    expect(appointmentEntries([{ ...appointment, familyEventId: "e1" }], adult, range, words, new Set(["e1"]))).toEqual([]);
    expect(appointmentEntries([{ ...appointment, familyEventId: "e1" }], adult, range, words, new Set())).toHaveLength(1);
  });

  it("a proposed appointment is marked proposed; a cancelled one is not shown", () => {
    expect(appointmentEntries([{ ...appointment, status: "proposed" }], adult, range, words)[0]!.status).toBe("proposed");
    expect(appointmentEntries([{ ...appointment, status: "cancelled" }], adult, range, words)).toEqual([]);
  });
});

describe("helpers", () => {
  it("says a helper is away on each day they won't come; a child gets no link", () => {
    const absences = [
      { memberId: "rekha", onDate: "2026-10-09", available: false },
      { memberId: "rekha", onDate: "2026-10-10", available: true },
      { memberId: "kunal", onDate: "2026-10-09", available: false },
    ];
    const helpers = [{ id: "rekha", displayName: "Rekha" }];
    const entries = helperEntries(absences, helpers, adult, range, words);
    expect(entries.map((entry) => entry.title)).toEqual(["Rekha away"]);
    expect(entries[0]).toMatchObject({ allDay: true, href: "/househelper" });
    expect(helperEntries(absences, helpers, child, range, words)[0]!.href).toBeNull();
  });
});

describe("upkeep, responsibilities and deliveries", () => {
  it("a booked visit shows at its time; an unbooked or finished one does not", () => {
    const entries = upkeepEntries(
      [
        { id: "u1", subject: "AC service", providerName: "CoolCare", status: "scheduled", scheduledFor: new Date("2026-10-11T06:00:00Z") },
        { id: "u2", subject: "Leak", providerName: null, status: "requested", scheduledFor: null },
        { id: "u3", subject: "Geyser", providerName: null, status: "completed", scheduledFor: new Date("2026-10-11T06:00:00Z") },
      ],
      adult,
      range,
    );
    expect(entries.map((entry) => entry.title)).toEqual(["AC service"]);
    expect(entries[0]).toMatchObject({ detail: "CoolCare", href: "/household/home" });
  });

  it("an open outcome is Due under its playbook name, or its key read as words", () => {
    const entries = outcomeEntries(
      [
        { id: "o1", outcomeKey: "school_fees_paid", name: null, status: "on_track", ownerMemberId: "kunal", dueAt: new Date("2026-10-20T12:00:00Z") },
        { id: "o2", outcomeKey: "groceries", name: "Groceries stocked", status: "met", ownerMemberId: null, dueAt: new Date("2026-10-20T12:00:00Z") },
      ],
      adult,
      range,
    );
    expect(entries.map((entry) => entry.title)).toEqual(["School fees paid"]);
    expect(entries[0]).toMatchObject({ kind: "due", memberIds: ["kunal"] });
  });

  it("an order on its way shows as a delivery, and never a delivered one", () => {
    const entries = orderEntries(
      [
        { id: "r1", provider: "Blinkit", status: "shipped", expectedAt: new Date("2026-10-03T08:00:00Z") },
        { id: "r2", provider: "Zepto", status: "delivered", expectedAt: new Date("2026-10-03T08:00:00Z") },
      ],
      child,
      range,
      words,
    );
    expect(entries.map((entry) => entry.title)).toEqual(["Delivery · Blinkit"]);
    expect(entries[0]!.href).toBeNull();
  });
});
