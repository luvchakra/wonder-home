import { describe, expect, it } from "vitest";
type Row = Record<string, unknown>;

import { CHANNEL_ADAPTERS } from "./channels";
import { adminOf, eventChangeNotices, goalCheckInNotices, eventReplyNotices, helperAbsenceNotices, homesendNotices, orderNotices, weatherNotices, type EventRow } from "./notices";
import type { LaundryNeed } from "../home/laundry";
import type { WeatherWindow } from "../home/weather";
import { sweepNotices } from "./notices-sweep";
import { memoryDatabase } from "./test-support";
import { buildDirectory } from "./plan";

const NOW = new Date("2026-10-20T06:00:00Z");

const members = [
  { id: "kunal", profile_id: "u1", member_type: "adult" as const, status: "active" },
  { id: "upasana", profile_id: "u2", member_type: "adult" as const, status: "active" },
  { id: "asmi", profile_id: null, member_type: "child" as const, status: "active" },
  { id: "sunita", profile_id: "u3", member_type: "helper" as const, status: "active" },
];
const roles = [
  { member_id: "kunal", role: "head" },
  { member_id: "upasana", role: "administrator" },
];
const directory = buildDirectory(members, roles, [{ outcome_key: "home.cleaning", primary_member_id: "sunita", backup_member_id: "upasana" }, { outcome_key: "laundry.ready", primary_member_id: "sunita", backup_member_id: "upasana" }], []);

describe("who hears what nobody is named for", () => {
  it("is the head of the household first", () => {
    expect(adminOf(directory)).toBe("kunal");
  });
});

describe("a HomeSend item waiting for your OK (27-004)", () => {
  const item = (over: Record<string, unknown> = {}) => ({ id: "i1", created_by_member_id: "upasana", status: "classified", classified_kind: "bill", updated_at: NOW.toISOString(), ...over });

  it("tells the adult who sent it, by the kind of thing and nothing about what it says", () => {
    const [notice] = homesendNotices([item()], directory, NOW);
    expect(notice).toMatchObject({ recipientMemberId: "upasana", threadKey: "homesend:i1:classified", sourceType: "homesend_item", title: { key: "reminder.homesend.waiting.bill" }, body: { key: "reminder.homesend.waitingBody" } });
    expect(JSON.stringify(notice)).not.toContain("subject");
  });

  it("tells an Admin when the sender may not confirm it, and says who sent it", () => {
    const names = new Map([["sunita", "Sunita"]]);
    const [notice] = homesendNotices([item({ created_by_member_id: "sunita", classified_kind: "grocery_item" })], directory, NOW, names);
    expect(notice).toMatchObject({ recipientMemberId: "kunal", title: { key: "reminder.homesend.waiting.grocery_item" }, body: { key: "reminder.homesend.waitingBodyFrom", params: { name: "Sunita" } } });
  });

  it("says something failed safely, and says nothing about an item that is not waiting", () => {
    expect(homesendNotices([item({ status: "failed" })], directory, NOW)[0]).toMatchObject({ title: { key: "reminder.homesend.failedTitle" }, threadKey: "homesend:i1:failed" });
    for (const status of ["received", "routed", "dismissed", "undone"]) expect(homesendNotices([item({ status })], directory, NOW)).toEqual([]);
  });

  it("names an unrecognised kind plainly", () => {
    expect(homesendNotices([item({ classified_kind: null })], directory, NOW)[0]!.title).toEqual({ key: "reminder.homesend.waiting.unknown" });
  });
});

describe("a guest's reply (27-005)", () => {
  const event = { id: "e1", title: "Diwali party", owner_member_id: "kunal", starts_at: "2026-10-31T13:30:00Z", status: "confirmed" };

  it("is one notice to the event's owner, counting people not replies", () => {
    const notices = eventReplyNotices([event], [{ event_id: "e1", response: "yes", party_size: 3 }, { event_id: "e1", response: "yes", party_size: 2 }, { event_id: "e1", response: "no", party_size: 1 }, { event_id: "e1", response: "maybe", party_size: 1 }], directory, NOW);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ recipientMemberId: "kunal", threadKey: "event-replies:e1", title: { key: "reminder.eventReply.title", params: { event: "Diwali party" } }, body: { params: { yes: 5, maybe: 1, no: 1 } } });
  });

  it("has nothing to say with no replies, for a cancelled event, or for one long over", () => {
    expect(eventReplyNotices([event], [], directory, NOW)).toEqual([]);
    expect(eventReplyNotices([{ ...event, status: "cancelled" }], [{ event_id: "e1", response: "yes", party_size: 1 }], directory, NOW)).toEqual([]);
    expect(eventReplyNotices([{ ...event, starts_at: "2026-10-10T10:00:00Z" }], [{ event_id: "e1", response: "yes", party_size: 1 }], directory, NOW)).toEqual([]);
  });

  it("goes to an Admin for an event nobody owns, and never to a child", () => {
    const guest = [{ event_id: "e1", response: "yes", party_size: 1 }];
    expect(eventReplyNotices([{ ...event, owner_member_id: null }], guest, directory, NOW)[0]!.recipientMemberId).toBe("kunal");
    expect(eventReplyNotices([{ ...event, owner_member_id: "asmi" }], guest, directory, NOW)[0]!.recipientMemberId).toBe("kunal");
  });
});

describe("a helper who won't be in (27-006)", () => {
  const helpers = [{ member_id: "sunita", name: "Sunita" }];

  it("tells whoever backs up what the helper looks after, once for that day", () => {
    const notices = helperAbsenceNotices([{ id: "a1", member_id: "sunita", on_date: "2026-10-21" }], helpers, directory, NOW, "Asia/Kolkata");
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ recipientMemberId: "upasana", threadKey: "helper-away:sunita:2026-10-21", title: { key: "reminder.helperAway.title", params: { name: "Sunita", date: { date: "2026-10-21" } } } });
  });

  it("falls back to an Admin when the helper holds nothing with a backup", () => {
    const alone = buildDirectory(members, roles, [], []);
    expect(helperAbsenceNotices([{ id: "a1", member_id: "sunita", on_date: "2026-10-21" }], helpers, alone, NOW, "Asia/Kolkata")[0]!.recipientMemberId).toBe("kunal");
  });

  it("ignores a day already past, and an absence of someone who is not a helper", () => {
    expect(helperAbsenceNotices([{ id: "a1", member_id: "sunita", on_date: "2026-10-19" }], helpers, directory, NOW, "Asia/Kolkata")).toEqual([]);
    expect(helperAbsenceNotices([{ id: "a2", member_id: "upasana", on_date: "2026-10-21" }], helpers, directory, NOW, "Asia/Kolkata")).toEqual([]);
  });
});

describe("a grocery order's progress (27-012)", () => {
  const order = (over: Record<string, unknown> = {}) => ({ id: "o1", provider: "Blinkit", status: "placed", total_minor: 84250, currency: "INR", approved_by_member_id: "upasana", updated_at: NOW.toISOString(), ...over });

  it("is one thread that changes words as the order moves, to the person who placed it", () => {
    const placed = orderNotices([order()], directory, NOW)[0]!;
    const shipped = orderNotices([order({ status: "shipped" })], directory, NOW)[0]!;
    expect(placed).toMatchObject({ recipientMemberId: "upasana", threadKey: "order:o1", title: { key: "reminder.order.title.placed" }, body: { key: "reminder.order.bodyAmount", params: { provider: "Blinkit", amount: { money: 842.5, currency: "INR" } } } });
    expect(shipped.threadKey).toBe(placed.threadKey);
    expect(shipped.title).toEqual({ key: "reminder.order.title.shipped" });
  });

  it("says nothing for a draft or one waiting for approval, nor for an old one", () => {
    for (const status of ["draft", "pending_approval"]) expect(orderNotices([order({ status })], directory, NOW)).toEqual([]);
    expect(orderNotices([order({ status: "delivered", updated_at: "2026-10-10T00:00:00Z" })], directory, NOW)).toEqual([]);
  });

  it("goes to an Admin when nobody approved it, and a failed order is marked as important", () => {
    expect(orderNotices([order({ approved_by_member_id: null })], directory, NOW)[0]!.recipientMemberId).toBe("kunal");
    expect(orderNotices([order({ status: "failed" })], directory, NOW)[0]!.priority).toBe("high");
  });
});

describe("a moved or cancelled event (27-013)", () => {
  const event: EventRow = { id: "e1", title: "Diwali party", owner_member_id: "kunal", starts_at: "2026-10-31T13:30:00Z", status: "confirmed" };
  const change = (over: Record<string, unknown> = {}) => ({ id: "c1", event_id: "e1", kind: "moved" as const, changed_by_member_id: "upasana", new_starts_at: "2026-10-31T13:30:00Z", created_at: NOW.toISOString(), ...over });
  const going = [{ event_id: "e1", member_id: "upasana", response: "yes" }, { event_id: "e1", member_id: "asmi", response: "unknown" }, { event_id: "e1", member_id: "sunita", response: "no" }];
  const names = new Map([["upasana", "Upasana"]]);
  const run = (changes: ReturnType<typeof change>[], events = [event], over: { participants?: typeof going } = {}) => eventChangeNotices(changes, events, over.participants ?? going, directory, names, NOW, "Asia/Kolkata");

  it("tells the owner and those going, never the person who made the change, and never someone who said no", () => {
    const notices = run([change()]);
    expect(notices.map((notice) => notice.recipientMemberId).sort()).toEqual(["kunal"]); // asmi is a child with no account here
    expect(notices[0]).toMatchObject({ sourceType: "event_change", threadKey: "event-change:c1", title: { key: "reminder.eventChange.moved.title", params: { event: "Diwali party" } } });
    expect(notices[0]!.body).toMatchObject({ key: "reminder.eventChange.changedBy", params: { name: "Upasana", what: { msg: { key: "reminder.eventChange.moved.body", params: { date: { date: "2026-10-31" }, time: { time: "2026-10-31T13:30:00Z" } } } } } });
  });

  it("says a cancellation plainly, and names no one when nobody signed in made it", () => {
    const [notice] = run([change({ kind: "cancelled", changed_by_member_id: null })], [{ ...event, status: "cancelled" }]);
    expect(notice).toMatchObject({ title: { key: "reminder.eventChange.cancelled.title" }, body: { key: "reminder.eventChange.cancelled.body" } });
  });

  it("is only for people on the event: a restricted event is never mentioned to anyone else", () => {
    const recipients = run([change({ changed_by_member_id: null })], [event], { participants: [] }).map((notice) => notice.recipientMemberId);
    expect(recipients).toEqual(["kunal"]);
  });

  it("is not told for a change that is old, for an event already over, or for one since put back", () => {
    expect(run([change({ created_at: "2026-10-10T00:00:00Z" })])).toEqual([]);
    expect(run([change()], [{ ...event, starts_at: "2026-10-01T10:00:00Z" }])).toEqual([]);
    expect(run([change({ kind: "cancelled" })], [event])).toEqual([]); // the event is no longer cancelled
    expect(run([change({ new_starts_at: "2026-10-30T13:30:00Z" })])).toEqual([]); // moved again since
  });

  it("gives an all-day event a day and no time", () => {
    const [notice] = run([change({ changed_by_member_id: null })], [{ ...event, all_day: true }]);
    expect(notice!.body).toMatchObject({ key: "reminder.eventChange.moved.bodyDay" });
  });
});

describe("weather that changes a plan (27-014)", () => {
  const window = (startHour: number, chance: number): WeatherWindow => ({ start: new Date(NOW.getTime() + startHour * 3_600_000), end: new Date(NOW.getTime() + (startHour + 6) * 3_600_000), precipitationChance: chance, humidity: 0.8, temperatureC: 26 });
  const outing: EventRow = { id: "e9", title: "Picnic at the lake", owner_member_id: "upasana", starts_at: new Date(NOW.getTime() + 8 * 3_600_000).toISOString(), ends_at: new Date(NOW.getTime() + 11 * 3_600_000).toISOString(), status: "planned", kind: "outing" };
  const laundryNeed = (over: Partial<LaundryNeed> = {}): LaundryNeed => ({ id: "l1", label: "Asmi's school uniform", forMemberId: "asmi", neededBy: new Date(NOW.getTime() + 10 * 3_600_000), state: "drying", stateAsOf: NOW, dryingHours: 6, requiresOutdoorDrying: true, ...over });
  const run = (windows: WeatherWindow[], events: EventRow[], laundry: LaundryNeed[]) => weatherNotices(windows, events, laundry, directory, NOW, "Asia/Kolkata");

  it("tells the outing's owner once when rain is likely while they are out, rounded so a nudge is no news", () => {
    const [notice] = run([window(6, 0.64)], [outing], []);
    expect(notice).toMatchObject({ recipientMemberId: "upasana", sourceType: "weather_plan", title: { key: "reminder.weather.outing.title", params: { event: "Picnic at the lake" } }, body: { params: { chance: 60 } } });
    expect(run([window(6, 0.62)], [outing], [])[0]!.threadKey).toBe(notice!.threadKey);
  });

  it("says nothing for a dry forecast, an event that is not an outing, one cancelled, or one days away", () => {
    expect(run([window(6, 0.1)], [outing], [])).toEqual([]);
    expect(run([window(6, 0.9)], [{ ...outing, kind: "appointment" }], [])).toEqual([]);
    expect(run([window(6, 0.9)], [{ ...outing, status: "cancelled" }], [])).toEqual([]);
    expect(run([window(6, 0.9)], [{ ...outing, starts_at: new Date(NOW.getTime() + 90 * 3_600_000).toISOString(), ends_at: new Date(NOW.getTime() + 93 * 3_600_000).toISOString() }], [])).toEqual([]);
  });

  it("tells whoever holds the laundry when the rain is what will make it late, and only then", () => {
    const [notice] = run([window(0, 0.8), window(6, 0.8), window(12, 0.7)], [], [laundryNeed()]);
    expect(notice).toMatchObject({ recipientMemberId: "sunita", threadKey: "weather:laundry:l1", title: { key: "reminder.weather.laundry.title", params: { item: "Asmi's school uniform" } } });
    expect(run([window(0, 0.8)], [], [laundryNeed({ neededBy: new Date(NOW.getTime() + 34 * 3_600_000), dryingHours: 2 })])).toEqual([]); // plenty of time indoors
    expect(run([window(0, 0.1)], [], [laundryNeed()])).toEqual([]);
    expect(run([window(0, 0.8)], [], [laundryNeed({ state: "ready" })])).toEqual([]);
    expect(run([window(0, 0.8)], [], [laundryNeed({ requiresOutdoorDrying: false })])).toEqual([]);
  });

  it("has nothing to say without a forecast", () => {
    expect(run([], [outing], [laundryNeed()])).toEqual([]);
  });
});

const HOUSEHOLD = { id: "h1", timezone: "Asia/Kolkata", region: "IN", currency: "INR", measurement_system: "metric", default_language: "en" };
const base = (over: Record<string, Row[]> = {}) => ({
  households: [HOUSEHOLD],
  household_members: members.map((member, index) => ({ ...member, household_id: "h1", display_name: ["Kunal", "Upasana", "Asmi", "Sunita"][index], nickname: null })),
  household_roles: roles.map((row) => ({ ...row, household_id: "h1" })),
  responsibilities: [{ household_id: "h1", outcome_key: "home.cleaning", primary_member_id: "sunita", backup_member_id: "upasana" }],
  member_guardians: [],
  home_send_items: [{ id: "i1", household_id: "h1", created_by_member_id: "upasana", status: "classified", classified_kind: "bill", updated_at: NOW.toISOString() }],
  family_events: [],
  event_guests: [],
  availability_exceptions: [],
  helper_profiles: [],
  orders: [],
  notifications: [],
  notification_events: [],
  ...over,
});
const adapters = CHANNEL_ADAPTERS;

describe("the notice sweep", () => {
  it("creates the notice with its words in English and as a message, then changes nothing on a second pass", async () => {
    const { client, tables } = memoryDatabase(base());
    expect(await sweepNotices(client, "h1", NOW, { adapters })).toEqual({ created: 1, updated: 0, resolved: 0 });
    expect(tables.notifications).toHaveLength(1);
    expect(tables.notifications![0]).toMatchObject({ recipient_member_id: "upasana", title: "A bill is waiting for your OK", source_type: "homesend_item", category: "system", thread_key: "homesend:i1:classified" });
    expect(tables.notifications![0]!.message).toMatchObject({ title: { key: "reminder.homesend.waiting.bill" } });
    expect(await sweepNotices(client, "h1", NOW, { adapters })).toEqual({ created: 0, updated: 0, resolved: 0 });
    expect(tables.notifications).toHaveLength(1);
  });

  it("resolves the notice when the item is confirmed", async () => {
    const { client, tables } = memoryDatabase(base());
    await sweepNotices(client, "h1", NOW, { adapters });
    tables.home_send_items![0]!.status = "routed";
    expect(await sweepNotices(client, "h1", NOW, { adapters })).toEqual({ created: 0, updated: 0, resolved: 1 });
    expect(tables.notifications![0]!.status).toBe("resolved");
  });

  it("rewrites one thread as replies come in, and brings it back unread", async () => {
    const event = { id: "e1", household_id: "h1", title: "Diwali party", owner_member_id: "kunal", starts_at: "2026-10-31T13:30:00Z", status: "confirmed" };
    const { client, tables } = memoryDatabase(base({ home_send_items: [], family_events: [event], event_guests: [{ household_id: "h1", event_id: "e1", response: "yes", party_size: 2 }] }));
    await sweepNotices(client, "h1", NOW, { adapters });
    expect(tables.notifications![0]).toMatchObject({ body: "2 coming · 0 maybe · 0 can’t come" });
    tables.notifications![0]!.status = "seen";
    tables.event_guests!.push({ household_id: "h1", event_id: "e1", response: "no", party_size: 1 });
    expect(await sweepNotices(client, "h1", NOW, { adapters })).toEqual({ created: 0, updated: 1, resolved: 0 });
    expect(tables.notifications).toHaveLength(1);
    expect(tables.notifications![0]).toMatchObject({ body: "2 coming · 0 maybe · 1 can’t come", status: "delivered" });
  });

  it("does not tell someone again what they already dismissed, but does tell them what has since changed", async () => {
    const order = { id: "o1", household_id: "h1", provider: "Blinkit", status: "placed", total_minor: 50000, currency: "INR", approved_by_member_id: "upasana", updated_at: NOW.toISOString() };
    const { client, tables } = memoryDatabase(base({ home_send_items: [], orders: [order] }));
    await sweepNotices(client, "h1", NOW, { adapters });
    tables.notifications![0]!.status = "dismissed";
    expect(await sweepNotices(client, "h1", NOW, { adapters })).toEqual({ created: 0, updated: 0, resolved: 0 });
    tables.orders![0]!.status = "shipped";
    expect(await sweepNotices(client, "h1", NOW, { adapters })).toEqual({ created: 1, updated: 0, resolved: 0 });
    expect(tables.notifications).toHaveLength(2);
  });

  it("leaves a reminder's own thread alone", async () => {
    const reminder = { id: "r1", household_id: "h1", recipient_member_id: "kunal", thread_key: "bill:b1:2026-10-21", source_type: "obligation", status: "delivered", title: "Electricity", body: "Due" };
    const { client, tables } = memoryDatabase(base({ home_send_items: [], notifications: [reminder] }));
    expect(await sweepNotices(client, "h1", NOW, { adapters })).toEqual({ created: 0, updated: 0, resolved: 0 });
    expect(tables.notifications![0]!.status).toBe("delivered");
  });
});

describe("a child's Done waits for a grown-up (goal check-ins)", () => {
  const withGuardian = buildDirectory(members, roles, [], [{ child_member_id: "asmi", guardian_member_id: "upasana" }]);
  const titles = new Map([["read", "Read for 20 mins"]]);
  const names = new Map([["asmi", "Asmi"]]);
  const row = { id: "c1", goal_id: "read", child_member_id: "asmi", on_day: "2026-10-20", verified_at: null };

  it("tells the child's guardian, naming the child and the goal, and opens their Goals", () => {
    const [notice, ...rest] = goalCheckInNotices([row], titles, withGuardian, names, NOW);
    expect(rest).toHaveLength(0);
    expect(notice).toMatchObject({ sourceType: "goal_checkin", sourceId: "c1", recipientMemberId: "upasana", category: "school" });
    expect(notice!.title).toEqual({ key: "reminder.goalCheck.title", params: { name: "Asmi", goal: "Read for 20 mins" } });
    expect(notice!.action.target).toBe("/school?tab=goals&child=asmi#waiting");
  });

  it("tells the Admin when the child has no guardian on record", () => {
    expect(goalCheckInNotices([row], titles, directory, names, NOW)[0]?.recipientMemberId).toBe("kunal");
  });

  it("says nothing once a grown-up has verified it", () => {
    expect(goalCheckInNotices([{ ...row, verified_at: "2026-10-20T07:00:00Z" }], titles, withGuardian, names, NOW)).toEqual([]);
  });
});
