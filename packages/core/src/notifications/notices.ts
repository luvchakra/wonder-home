import { dryingConditions, RAIN_THRESHOLD, type WeatherWindow } from "../home/weather";
import { hoursRemaining, type LaundryNeed } from "../home/laundry";
import { msg, type NotificationMessage } from "./message";
import type { Directory } from "./plan";
import type { NotificationCategory } from "./policies";
import { localMoment } from "./timing";

/**
 * Notices (stories 27-004 to 27-014): notifications about something that
 * happened and is still true, as opposed to a timed reminder.
 *
 * Like a reminder, a notice is derived from a record, never fired and
 * forgotten. Each builder here is pure: it reads rows a domain already keeps
 * and says which notices deserve to exist right now, for one person each,
 * with one thread per record. The sweep (`notices-sweep.ts`) brings the
 * notifications table in line with that list, so a notice is created when its
 * record says so, rewritten when the record changes, and resolved when the
 * record settles. Running it twice changes nothing the second time.
 *
 * Whom, never a broadcast: the person the thing is for, or the household's
 * Admin when nobody is. What it says, in `reminder.*` words plus typed
 * values, so each reader has it in their own language, and nothing beyond a
 * name, a title and a count crosses to another channel.
 */

export const NOTICE_SOURCE_TYPES = ["homesend_item", "event_replies", "helper_absence", "grocery_order", "event_change", "weather_plan"] as const;
export type NoticeSourceType = (typeof NOTICE_SOURCE_TYPES)[number];

export type Notice = {
  sourceType: NoticeSourceType;
  sourceId: string;
  /** One open thread per recipient per record. */
  threadKey: string;
  recipientMemberId: string;
  category: NotificationCategory;
  priority: "normal" | "high";
  title: NotificationMessage;
  body: NotificationMessage;
  action: { action: string; target?: string };
  /** Past this the notice stops being worth showing. */
  expiresAt: Date;
};

const DAY_MS = 86_400_000;

function reachable(directory: Directory, id: string | null | undefined, allowChild = false): id is string {
  if (!id) return false;
  const member = directory.members.get(id);
  return Boolean(member && member.active && member.hasAccount && (allowChild || member.memberType !== "child"));
}

/** The household's Admin who hears what nobody else is named for: the head first. */
export function adminOf(directory: Directory): string | null {
  const admins = [...directory.members.values()].filter((member) => member.isAdmin && reachable(directory, member.id)).sort((a, b) => Number(b.isHead) - Number(a.isHead));
  return admins[0]?.id ?? null;
}

// --- HomeSend: an item waiting for a yes (27-004) ---------------------------

export type HomeSendRow = {
  id: string;
  created_by_member_id: string;
  status: string;
  classified_kind: string | null;
  updated_at: string;
};

const WAITING_KIND = new Set(["bill", "school_item", "grocery_item"]);

/**
 * One notice per item that is waiting for a person (`classified`), or that
 * failed safely, to the sender when they may confirm it (an adult), otherwise
 * to an Admin. Only the kind of thing is named: what an item says is nobody's
 * to read off a lock screen. It resolves by itself when the item is confirmed,
 * undone, dismissed or read again.
 */
export function homesendNotices(rows: readonly HomeSendRow[], directory: Directory, now: Date, names: ReadonlyMap<string, string> = new Map()): Notice[] {
  const notices: Notice[] = [];
  for (const row of rows) {
    if (row.status !== "classified" && row.status !== "failed") continue;
    const sender = directory.members.get(row.created_by_member_id);
    const senderMayConfirm = reachable(directory, row.created_by_member_id) && sender?.memberType === "adult";
    const recipient = senderMayConfirm ? row.created_by_member_id : adminOf(directory);
    if (!recipient) continue;
    const failed = row.status === "failed";
    const kind = row.classified_kind && WAITING_KIND.has(row.classified_kind) ? row.classified_kind : "unknown";
    notices.push({
      sourceType: "homesend_item",
      sourceId: row.id,
      threadKey: `homesend:${row.id}:${row.status}`,
      recipientMemberId: recipient,
      category: "system",
      priority: "normal",
      title: failed ? msg("reminder.homesend.failedTitle") : msg(`reminder.homesend.waiting.${kind}` as "reminder.homesend.waiting.bill"),
      body: failed
        ? msg("reminder.homesend.failedBody")
        : senderMayConfirm || !names.get(row.created_by_member_id)
          ? msg("reminder.homesend.waitingBody")
          : msg("reminder.homesend.waitingBodyFrom", { name: names.get(row.created_by_member_id)! }),
      action: { action: "open", target: "/home-send" },
      expiresAt: new Date(now.getTime() + 14 * DAY_MS),
    });
  }
  return notices;
}

// --- A guest's reply to an invitation (27-005) ------------------------------

export type EventRow = { id: string; title: string; owner_member_id: string | null; starts_at: string; status: string; all_day?: boolean; kind?: string; ends_at?: string };
export type GuestRow = { event_id: string; response: string; party_size: number };

/**
 * One notice per event with replies, to its owner only, rewritten as more
 * come in: "5 coming · 1 maybe · 1 can't come". Replies never create anything
 * for the guest, who has no account here. An event nobody owns tells the Admin.
 */
export function eventReplyNotices(events: readonly EventRow[], guests: readonly GuestRow[], directory: Directory, now: Date): Notice[] {
  const notices: Notice[] = [];
  for (const event of events) {
    if (event.status === "cancelled" || new Date(event.starts_at).getTime() < now.getTime() - DAY_MS) continue;
    const replies = guests.filter((guest) => guest.event_id === event.id);
    if (replies.length === 0) continue;
    const recipient = reachable(directory, event.owner_member_id, true) ? event.owner_member_id : adminOf(directory);
    if (!recipient) continue;
    const people = (response: string) => replies.filter((guest) => guest.response === response).reduce((total, guest) => total + guest.party_size, 0);
    notices.push({
      sourceType: "event_replies",
      sourceId: event.id,
      threadKey: `event-replies:${event.id}`,
      recipientMemberId: recipient,
      category: "family",
      priority: "normal",
      title: msg("reminder.eventReply.title", { event: event.title }),
      body: msg("reminder.eventReply.body", { yes: people("yes"), maybe: people("maybe"), no: people("no") }),
      action: { action: "open", target: `/calendar?event=${event.id}` },
      expiresAt: new Date(new Date(event.starts_at).getTime() + DAY_MS),
    });
  }
  return notices;
}

// --- A helper who will not be in (27-006) -----------------------------------

export type AbsenceRow = { id: string; member_id: string; on_date: string };
export type HelperRow = { member_id: string; name: string };

/**
 * One notice per helper per day away, to whoever backs up what that helper
 * looks after, otherwise to an Admin. Undoing the absence removes the row, so
 * the notice resolves with it. A helper marking a day away is news the same
 * day, never a daily readout: only today and what is coming are told.
 */
export function helperAbsenceNotices(
  absences: readonly AbsenceRow[],
  helpers: readonly HelperRow[],
  directory: Directory,
  now: Date,
  timeZone: string,
): Notice[] {
  const today = localMoment(now, timeZone).dateKey;
  const notices: Notice[] = [];
  for (const absence of absences) {
    if (absence.on_date < today) continue;
    const helper = helpers.find((candidate) => candidate.member_id === absence.member_id);
    if (!helper) continue;
    const backups = new Set<string>();
    for (const duty of directory.responsibilities.values()) {
      if (duty.primary === absence.member_id && reachable(directory, duty.backup) && duty.backup !== absence.member_id) backups.add(duty.backup);
    }
    const admin = adminOf(directory);
    const recipients = backups.size > 0 ? [...backups] : admin ? [admin] : [];
    for (const recipient of recipients) {
      notices.push({
        sourceType: "helper_absence",
        sourceId: absence.id,
        threadKey: `helper-away:${absence.member_id}:${absence.on_date}`,
        recipientMemberId: recipient,
        category: "home",
        priority: "normal",
        title: msg("reminder.helperAway.title", { name: helper.name, date: { date: absence.on_date } }),
        body: msg("reminder.helperAway.body"),
        action: { action: "open", target: "/househelper" },
        expiresAt: new Date(new Date(`${absence.on_date}T00:00:00Z`).getTime() + 2 * DAY_MS),
      });
    }
  }
  return notices;
}

// --- A grocery order's progress (27-012) ------------------------------------

export type OrderRow = {
  id: string;
  provider: string;
  status: string;
  total_minor: number;
  currency: string;
  approved_by_member_id: string | null;
  updated_at: string;
};

const ORDER_NEWS = new Set(["placed", "confirmed", "shipped", "delivered", "cancelled", "failed"]);

/**
 * One notice per order, rewritten as it moves: placed, confirmed, shipped,
 * delivered. To the person who placed it (whoever approved it), otherwise an
 * Admin. A draft or one still waiting for approval says nothing: that is the
 * approval's own notice. A finished order's notice is kept for three days.
 */
export function orderNotices(rows: readonly OrderRow[], directory: Directory, now: Date): Notice[] {
  const notices: Notice[] = [];
  for (const row of rows) {
    if (!ORDER_NEWS.has(row.status)) continue;
    if (now.getTime() - new Date(row.updated_at).getTime() > 3 * DAY_MS) continue;
    const recipient = reachable(directory, row.approved_by_member_id) ? row.approved_by_member_id : adminOf(directory);
    if (!recipient) continue;
    const amount = row.total_minor > 0 ? { money: row.total_minor / 100, currency: row.currency } : null;
    notices.push({
      sourceType: "grocery_order",
      sourceId: row.id,
      threadKey: `order:${row.id}`,
      recipientMemberId: recipient,
      category: "groceries",
      priority: row.status === "failed" ? "high" : "normal",
      title: msg(`reminder.order.title.${row.status}` as "reminder.order.title.placed"),
      body: amount ? msg("reminder.order.bodyAmount", { provider: row.provider, amount }) : msg("reminder.order.body", { provider: row.provider }),
      action: { action: "open", target: "/grocery" },
      expiresAt: new Date(new Date(row.updated_at).getTime() + 3 * DAY_MS),
    });
  }
  return notices;
}

// --- A moved or cancelled event (27-013) ------------------------------------

export type EventChangeRow = {
  id: string;
  event_id: string;
  kind: "moved" | "cancelled";
  changed_by_member_id: string | null;
  new_starts_at: string | null;
  created_at: string;
};
export type ParticipantRow = { event_id: string; member_id: string; response: string };

/**
 * One notice per change per person who is going, never to whoever made the
 * change (an echo of your own edit is no news). Going means invited and not
 * declined, plus the event's owner. Only people already on the event hear of
 * it, so an event that is private or for those invited is never mentioned to
 * anyone outside it. A change is news for three days, and not at all once the
 * event itself is over.
 */
export function eventChangeNotices(
  changes: readonly EventChangeRow[],
  events: readonly EventRow[],
  participants: readonly ParticipantRow[],
  directory: Directory,
  names: ReadonlyMap<string, string>,
  now: Date,
  timeZone: string,
): Notice[] {
  const notices: Notice[] = [];
  for (const change of changes) {
    if (now.getTime() - new Date(change.created_at).getTime() > 3 * DAY_MS) continue;
    const event = events.find((candidate) => candidate.id === change.event_id);
    if (!event) continue;
    const startsAt = change.kind === "moved" ? (change.new_starts_at ?? event.starts_at) : event.starts_at;
    if (new Date(startsAt).getTime() < now.getTime()) continue;
    // A change that has since been put back (a cancelled event brought back, a move undone) is no longer true.
    if (change.kind === "cancelled" && event.status !== "cancelled") continue;
    if (change.kind === "moved" && (event.status === "cancelled" || new Date(event.starts_at).getTime() !== new Date(startsAt).getTime())) continue;

    const going = new Set<string>();
    if (event.owner_member_id) going.add(event.owner_member_id);
    for (const participant of participants) if (participant.event_id === event.id && participant.response !== "no") going.add(participant.member_id);
    going.delete(change.changed_by_member_id ?? "");

    const editor = change.changed_by_member_id ? names.get(change.changed_by_member_id) : undefined;
    const day = localMoment(new Date(startsAt), timeZone).dateKey;
    const base =
      change.kind === "cancelled"
        ? msg("reminder.eventChange.cancelled.body")
        : event.all_day
          ? msg("reminder.eventChange.moved.bodyDay", { date: { date: day } })
          : msg("reminder.eventChange.moved.body", { date: { date: day }, time: { time: startsAt } });
    for (const recipient of going) {
      if (!reachable(directory, recipient, true)) continue;
      notices.push({
        sourceType: "event_change",
        sourceId: change.id,
        threadKey: `event-change:${change.id}`,
        recipientMemberId: recipient,
        category: "family",
        priority: "normal",
        title: change.kind === "cancelled" ? msg("reminder.eventChange.cancelled.title", { event: event.title }) : msg("reminder.eventChange.moved.title", { event: event.title }),
        body: editor ? msg("reminder.eventChange.changedBy", { what: { msg: base }, name: editor }) : base,
        action: { action: "open", target: `/calendar?event=${event.id}` },
        expiresAt: new Date(new Date(startsAt).getTime()),
      });
    }
  }
  return notices;
}

// --- Weather that changes a plan (27-014) -----------------------------------

const WEATHER_AHEAD_HOURS = 36;

/**
 * Rain, said only where it changes what a household would do: an outing it is
 * about to go on, or washing that has to dry outside by a deadline it will
 * miss. Never a forecast readout, never a general "it will rain tomorrow".
 * Each is said once to the one person it matters to (the outing's owner;
 * whoever holds laundry), and rounded to the nearest ten per cent so a
 * forecast nudging a point never makes a new notice.
 */
export function weatherNotices(
  windows: readonly WeatherWindow[],
  events: readonly EventRow[],
  laundry: readonly LaundryNeed[],
  directory: Directory,
  now: Date,
  timeZone: string,
): Notice[] {
  if (windows.length === 0) return [];
  const notices: Notice[] = [];
  const horizon = now.getTime() + WEATHER_AHEAD_HOURS * 3_600_000;

  for (const event of events) {
    if (event.kind !== "outing" || event.status === "cancelled" || !event.ends_at) continue;
    const start = new Date(event.starts_at).getTime();
    const end = new Date(event.ends_at).getTime();
    if (start < now.getTime() || start > horizon) continue;
    const wettest = Math.max(0, ...windows.filter((window) => window.end.getTime() > start && window.start.getTime() < end).map((window) => window.precipitationChance));
    if (wettest < RAIN_THRESHOLD) continue;
    const recipient = reachable(directory, event.owner_member_id, true) ? event.owner_member_id : adminOf(directory);
    if (!recipient) continue;
    notices.push({
      sourceType: "weather_plan",
      sourceId: event.id,
      threadKey: `weather:outing:${event.id}:${localMoment(new Date(event.starts_at), timeZone).dateKey}`,
      recipientMemberId: recipient,
      category: "family",
      priority: "normal",
      title: msg("reminder.weather.outing.title", { event: event.title }),
      body: msg("reminder.weather.outing.body", { chance: Math.round(wettest * 10) * 10 }),
      action: { action: "open", target: `/calendar?event=${event.id}` },
      expiresAt: new Date(end),
    });
  }

  const holder = directory.responsibilities.get("laundry.ready");
  const laundryRecipient = reachable(directory, holder?.primary) ? holder!.primary! : reachable(directory, holder?.backup) ? holder!.backup! : adminOf(directory);
  for (const need of laundry) {
    if (need.state === "ready" || !need.requiresOutdoorDrying || !laundryRecipient) continue;
    const due = need.neededBy.getTime();
    if (due < now.getTime() || due > horizon) continue;
    const conditions = dryingConditions(windows.filter((window) => window.start.getTime() < due));
    if (conditions.outdoorViable) continue;
    const hoursLeft = (due - now.getTime()) / 3_600_000;
    // Only when the rain is what makes it late: washing with time to spare indoors needs no word.
    if (hoursRemaining(need, conditions) <= hoursLeft) continue;
    notices.push({
      sourceType: "weather_plan",
      sourceId: need.id,
      threadKey: `weather:laundry:${need.id}`,
      recipientMemberId: laundryRecipient,
      category: "home",
      priority: "normal",
      title: msg("reminder.weather.laundry.title", { item: need.label }),
      body: msg("reminder.weather.laundry.body"),
      action: { action: "open", target: "/home" },
      expiresAt: need.neededBy,
    });
  }
  return notices;
}
