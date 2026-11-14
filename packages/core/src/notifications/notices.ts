import { dryingConditions, RAIN_THRESHOLD, type WeatherWindow } from "../home/weather";
import { hoursRemaining, type LaundryNeed } from "../home/laundry";
import { msg, type NotificationMessage } from "./message";
import type { Directory } from "./plan";
import type { NotificationCategory } from "./policies";
import { localMoment } from "./timing";
import { countWaiting, isStale, type WaitingGroup } from "../homesend/waiting";
import { questionsLeft, readCheckingState } from "../homesend/checking";
import { countByGroup, type TidiedEntry } from "../homesend/tidy";

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

export const NOTICE_SOURCE_TYPES = ["homesend_item", "event_replies", "helper_absence", "grocery_order", "event_change", "weather_plan", "goal_checkin", "chat_thread", "ai_key"] as const;
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

// --- HomeSend: what is waiting for a yes, grouped (27-004; the owner, 2026-11-03) ---

export type HomeSendRow = {
  id: string;
  created_by_member_id: string | null;
  status: string;
  classified_kind: string | null;
  content_type?: string | null;
  updated_at: string;
};

const GROUPED_EXPIRY_DAYS = 30;

/** "2 school notices, 1 bill, 1 photo or file", as nested messages so each reader has it in their own language. */
function groupList(groups: readonly { group: WaitingGroup; count: number }[]): NotificationMessage {
  const phrases = groups.map(({ group, count }) => msg(`reminder.homesend.group.${group}` as "reminder.homesend.group.bill", { count }));
  return phrases.slice(1).reduce((joined, next) => msg("reminder.homesend.join", { a: { msg: joined }, b: { msg: next } }), phrases[0]!);
}

/**
 * One notice per person for everything waiting in HomeSend — never one per
 * item: "4 things sent to HomeSend are waiting · 2 school notices, 1 bill, 1
 * photo or file". Each item counts for the person who may confirm it: its
 * sender when an adult with an account, otherwise an Admin (an email, a
 * child's or helper's send). It is rewritten as items arrive or are handled,
 * and resolves by itself when nothing waits (the sweep's own reconcile). Only
 * kinds and counts are named: what an item says is nobody's to read off a lock
 * screen. After 14 days waiting it also asks "still want these?" and says
 * what happens at 30 (archived, restorable).
 */
export function homesendNotices(rows: readonly HomeSendRow[], directory: Directory, now: Date, timeZone = "UTC", tidied: readonly TidiedEntry[] = []): Notice[] {
  const recipientOf = (memberId: string | null) => {
    const sender = memberId ? directory.members.get(memberId) : undefined;
    const senderMayConfirm = reachable(directory, memberId) && sender?.memberType === "adult";
    return senderMayConfirm ? memberId! : adminOf(directory);
  };
  const byRecipient = new Map<string, HomeSendRow[]>();
  for (const row of rows) {
    if (row.status !== "classified" && row.status !== "failed") continue;
    const recipient = recipientOf(row.created_by_member_id);
    if (!recipient) continue;
    const list = byRecipient.get(recipient) ?? [];
    list.push(row);
    byRecipient.set(recipient, list);
  }
  // Today's tidy (the owner, 2026-11-03), counted for whoever hears about the items it set aside.
  const tidiedFor = new Map<string, TidiedEntry[]>();
  for (const entry of tidied) {
    const recipient = recipientOf(entry.memberId);
    if (!recipient) continue;
    tidiedFor.set(recipient, [...(tidiedFor.get(recipient) ?? []), entry]);
  }
  const tidyGroups = (entries: readonly TidiedEntry[]) => {
    const phrases = countByGroup(entries).map(({ group, count }) => msg(`reminder.homesend.tidy.group.${group}` as "reminder.homesend.tidy.group.past", { count }));
    return phrases.slice(1).reduce((joined, next) => msg("reminder.homesend.join", { a: { msg: joined }, b: { msg: next } }), phrases[0]!);
  };
  const notices: Notice[] = [];
  for (const [recipient, waiting] of byRecipient) {
    const { total, groups } = countWaiting(waiting);
    const stale = waiting.filter((row) => isStale(row.updated_at, now, timeZone)).length;
    const newest = [...waiting].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]!;
    const tail = { msg: stale > 0 ? msg("reminder.homesend.grouped.stale", { count: stale }) : msg("reminder.homesend.grouped.tail") };
    const mine = tidiedFor.get(recipient) ?? [];
    notices.push({
      sourceType: "homesend_item",
      sourceId: newest.id,
      // One open thread per person: rewritten in place, never a second row.
      threadKey: "homesend:waiting",
      recipientMemberId: recipient,
      category: "system",
      priority: "normal",
      title: msg("reminder.homesend.grouped.title", { count: total }),
      body:
        mine.length > 0
          ? msg("reminder.homesend.grouped.bodyTidied", { groups: { msg: groupList(groups) }, tail, tidied: { msg: msg("reminder.homesend.tidy.line", { count: mine.length, groups: { msg: tidyGroups(mine) } }) } })
          : msg("reminder.homesend.grouped.body", { groups: { msg: groupList(groups) }, tail }),
      action: { action: "open", target: "/home-send" },
      expiresAt: new Date(now.getTime() + GROUPED_EXPIRY_DAYS * DAY_MS),
    });
  }
  // Nothing left waiting, but something was tidied today: the same thread says so, once, until tomorrow.
  for (const [recipient, mine] of tidiedFor) {
    if (byRecipient.has(recipient)) continue;
    notices.push({
      sourceType: "homesend_item",
      sourceId: mine[0]!.id,
      threadKey: "homesend:waiting",
      recipientMemberId: recipient,
      category: "system",
      priority: "normal",
      title: msg("reminder.homesend.tidy.title", { count: mine.length }),
      body: msg("reminder.homesend.tidy.body", { groups: { msg: tidyGroups(mine) } }),
      action: { action: "open", target: "/home-send?view=archived" },
      expiresAt: new Date(now.getTime() + DAY_MS),
    });
  }
  return notices;
}

// --- HomeSend: one daily summary (the owner, 2026-11-14, "Nothing waits") ---

/** An entry HomeSend added (`homesend_changes`, created, not undone). */
export type AddedRow = { created_by_member_id: string | null; created_at: string };
/** An open "Needs you" question (`needs_you_items`); null recipient: the Admins. */
export type NeedsYouRow = { recipient_member_id: string | null };

/**
 * One notice per person per day, replacing a notice per item and the grouped
 * "N waiting" one: "WonderHome added 6 things today · 1 needs a word — it's at
 * the top of HomeTalk." What was added is counted for whoever sent it (a
 * child's or helper's send for the Admin); what needs a word is counted for
 * whoever it asks. On a day nothing was added but something needs a word, the
 * same thread says only that. Counts only: nothing an entry says reaches a
 * lock screen. It opens the "Needs you" list at the top of HomeTalk, is
 * rewritten as the day goes on, and resolves by itself the next day (a new
 * day is a new thread) or when nothing is left to say.
 */
export function homesendSummaryNotices(added: readonly AddedRow[], needs: readonly NeedsYouRow[], directory: Directory, now: Date, timeZone = "UTC"): Notice[] {
  const today = localMoment(now, timeZone).dateKey;
  const admin = adminOf(directory);
  const adultOrAdmin = (memberId: string | null) => {
    const member = memberId ? directory.members.get(memberId) : undefined;
    return reachable(directory, memberId) && member?.memberType === "adult" ? memberId! : admin;
  };
  const addedFor = new Map<string, number>();
  for (const row of added) {
    if (localMoment(new Date(row.created_at), timeZone).dateKey !== today) continue;
    const recipient = adultOrAdmin(row.created_by_member_id);
    if (recipient) addedFor.set(recipient, (addedFor.get(recipient) ?? 0) + 1);
  }
  const needsFor = new Map<string, number>();
  for (const row of needs) {
    const recipient = row.recipient_member_id && reachable(directory, row.recipient_member_id, true) ? row.recipient_member_id : admin;
    if (recipient) needsFor.set(recipient, (needsFor.get(recipient) ?? 0) + 1);
  }
  const recipients = new Set([...addedFor.keys(), ...needsFor.keys()]);
  const endOfDay = new Date(now.getTime() + DAY_MS);
  return [...recipients].map((recipient) => {
    const count = addedFor.get(recipient) ?? 0;
    const waiting = needsFor.get(recipient) ?? 0;
    return {
      sourceType: "homesend_item" as const,
      // The thread is the household's day, not a record: one per person per day.
      sourceId: recipient,
      threadKey: `homesend:summary:${today}`,
      recipientMemberId: recipient,
      category: "system" as const,
      priority: "normal" as const,
      title: count > 0 ? msg("reminder.homesend.summary.title", { count }) : msg("reminder.needsYou.title", { count: waiting }),
      body: count > 0 ? (waiting > 0 ? msg("reminder.homesend.summary.needs", { count: waiting }) : msg("reminder.homesend.summary.none")) : msg("reminder.needsYou.body"),
      action: { action: "open", target: waiting > 0 ? "/ai#needs-you" : "/home-send" },
      expiresAt: endOfDay,
    };
  });
}

// --- HomeSend: questions waiting about entries added as Checking (14-062; the owner, 2026-11-03) ---

/** An item HomeSend added; `checking` is its `understanding.checking` (`homesend/checking.ts`). */
export type CheckingRow = { id: string; status: string; updated_at: string; checking: unknown };

/**
 * One notice per person for every question HomeTalk is still waiting on —
 * never one per item: "3 HomeSend questions waiting · answer in HomeTalk or on
 * WhatsApp". It goes only to the person each question is for (the item's
 * sender, decision C), reachable and with an account, is rewritten as
 * questions are answered, and resolves by itself when none is left (the
 * sweep's own reconcile). Only a count is named: what an entry says is never
 * on a lock screen. Undone items don't count.
 */
export function homesendQuestionNotices(rows: readonly CheckingRow[], directory: Directory, now: Date): Notice[] {
  const byRecipient = new Map<string, { count: number; newest: CheckingRow }>();
  for (const row of rows) {
    if (row.status !== "routed") continue;
    const state = readCheckingState(row.checking);
    const left = questionsLeft(row.checking);
    if (!state || left === 0 || !reachable(directory, state.recipientMemberId)) continue;
    const entry = byRecipient.get(state.recipientMemberId);
    if (!entry) byRecipient.set(state.recipientMemberId, { count: left, newest: row });
    else {
      entry.count += left;
      if (row.updated_at > entry.newest.updated_at) entry.newest = row;
    }
  }
  return [...byRecipient].map(([recipient, { count, newest }]) => ({
    sourceType: "homesend_item" as const,
    sourceId: newest.id,
    threadKey: "homesend:questions",
    recipientMemberId: recipient,
    category: "system" as const,
    priority: "normal" as const,
    title: msg("reminder.homesend.questions.title", { count }),
    body: msg("reminder.homesend.questions.body"),
    action: { action: "open", target: "/ai" },
    expiresAt: new Date(now.getTime() + GROUPED_EXPIRY_DAYS * DAY_MS),
  }));
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
      // An Instamart order opens where it is followed (story 25-032).
      action: { action: "open", target: row.provider === "Swiggy Instamart" ? "/groceries/order" : "/groceries" },
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

// --- A child's "Done" on a goal, waiting for a grown-up (the owner, 2026-10-20) ---

export type CheckInRow = { id: string; goal_id: string; child_member_id: string; on_day: string; verified_at: string | null };

/**
 * One notice per check-in a child made that nobody has verified yet, to the
 * child's guardian (an Admin when the child has none reachable). It names the
 * child and the goal, and resolves by itself once a grown-up says yes or "not
 * yet" — the row is then verified or gone.
 */
export function goalCheckInNotices(
  rows: readonly CheckInRow[],
  goalTitles: ReadonlyMap<string, string>,
  directory: Directory,
  names: ReadonlyMap<string, string>,
  now: Date,
): Notice[] {
  const notices: Notice[] = [];
  for (const row of rows) {
    if (row.verified_at !== null) continue;
    const goal = goalTitles.get(row.goal_id);
    if (!goal) continue;
    const guardian = (directory.guardians.get(row.child_member_id) ?? []).find((id) => reachable(directory, id));
    const recipient = guardian ?? adminOf(directory);
    if (!recipient) continue;
    notices.push({
      sourceType: "goal_checkin",
      sourceId: row.id,
      threadKey: `goal-checkin:${row.id}`,
      recipientMemberId: recipient,
      category: "school",
      priority: "normal",
      title: msg("reminder.goalCheck.title", { name: names.get(row.child_member_id) ?? "", goal }),
      body: msg("reminder.goalCheck.body"),
      action: { action: "open", target: `/school?tab=goals&child=${row.child_member_id}#waiting` },
      expiresAt: new Date(new Date(`${row.on_day}T00:00:00Z`).getTime() + 8 * DAY_MS),
    });
  }
  return notices;
}

// --- Chat: something new to read (the owner, 2026-10-21) --------------------

export type ChatThreadRow = { id: string; kind: "household" | "direct" | "group"; title: string | null };
export type ChatParticipantRow = { thread_id: string; member_id: string; left_at: string | null; last_read_at: string | null };
export type ChatMessageRow = { thread_id: string; author_member_id: string; created_at: string; body: string; removed_at?: string | null };

/** Whether a message names this person with "@" and their called name, as the composer writes it. */
export function mentions(body: string, calledName: string): boolean {
  const name = calledName.trim();
  if (!name) return false;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])@${escaped}(?![\\p{L}\\p{N}])`, "iu").test(body);
}

/**
 * One notice per person per chat with messages from someone else they have
 * not read yet (the last seven days). Family chat is everyone in the family
 * who signs in, never a househelper; a direct or group chat is the people
 * still in it. It names the chat, who wrote and how many — never what was
 * said — and turns urgent only when a message mentions the reader by name.
 * It resolves by itself once they open the chat (nothing unread is left).
 */
export function chatNotices(
  threads: readonly ChatThreadRow[],
  participants: readonly ChatParticipantRow[],
  messages: readonly ChatMessageRow[],
  directory: Directory,
  names: ReadonlyMap<string, string>,
  now: Date,
): Notice[] {
  const notices: Notice[] = [];
  const since = now.getTime() - 7 * DAY_MS;
  const byThread = new Map<string, ChatMessageRow[]>();
  for (const row of messages) {
    if (row.removed_at || new Date(row.created_at).getTime() < since) continue;
    byThread.set(row.thread_id, [...(byThread.get(row.thread_id) ?? []), row]);
  }
  const lastRead = new Map(participants.map((row) => [`${row.thread_id}|${row.member_id}`, row.last_read_at]));
  for (const thread of threads) {
    const rows = byThread.get(thread.id);
    if (!rows || rows.length === 0) continue;
    const inThread = participants.filter((row) => row.thread_id === thread.id && row.left_at === null).map((row) => row.member_id);
    const readers = thread.kind === "household"
      ? [...directory.members.values()].filter((member) => member.memberType !== "helper").map((member) => member.id)
      : inThread;
    for (const reader of readers) {
      if (!reachable(directory, reader, true)) continue;
      if (thread.kind === "household" && directory.members.get(reader)?.memberType === "helper") continue;
      const read = lastRead.get(`${thread.id}|${reader}`);
      const readAt = read ? new Date(read).getTime() : -Infinity;
      const unread = rows.filter((row) => row.author_member_id !== reader && new Date(row.created_at).getTime() > readAt);
      if (unread.length === 0) continue;
      const writers = [...new Set(unread.map((row) => row.author_member_id))].map((id) => names.get(id) ?? "").filter(Boolean);
      const latest = unread.reduce((a, b) => (a.created_at > b.created_at ? a : b));
      const others = inThread.filter((id) => id !== reader).map((id) => names.get(id) ?? "").filter(Boolean);
      const chat: string | { msg: NotificationMessage } | { list: string[] } = thread.kind === "household"
        ? { msg: msg("reminder.chat.family") }
        : thread.title?.trim() || (thread.kind === "direct" ? others[0] ?? "" : { list: others });
      const myName = names.get(reader) ?? "";
      const mentioner = unread.find((row) => mentions(row.body, myName));
      const title = mentioner
        ? msg("reminder.chat.mention", { name: names.get(mentioner.author_member_id) ?? "", chat })
        : thread.kind === "direct"
          ? msg("reminder.chat.direct", { name: writers[0] ?? "" })
          : msg("reminder.chat.inChat", { chat });
      notices.push({
        sourceType: "chat_thread",
        sourceId: thread.id,
        threadKey: `chat:${thread.id}`,
        recipientMemberId: reader,
        category: "family",
        priority: mentioner ? "high" : "normal",
        title,
        body: msg("reminder.chat.body", { count: unread.length, names: { list: writers } }),
        action: { action: "open", target: `/chat/${thread.id}` },
        expiresAt: new Date(new Date(latest.created_at).getTime() + 7 * DAY_MS),
      });
    }
  }
  return notices;
}

// --- An AI key a provider stopped taking (the owner, 2026-10-26) -------------

export type AiKeyAlertRow = {
  id: string;
  purpose: "assistant" | "gemini_voice";
  provider: "anthropic" | "google" | "openai";
  kind: "out_of_credits" | "quota_exhausted" | "key_rejected";
  first_seen_at: string;
  last_seen_at: string;
};

const PROVIDER_NAME: Record<AiKeyAlertRow["provider"], string> = { anthropic: "Anthropic", google: "Google", openai: "OpenAI" };

/** A quota refusal is told only once it has lasted this long: a per-minute limit passes well within it. */
export const QUOTA_ALERT_AFTER_MS = 10 * 60_000;

/**
 * One notice per household key a provider has stopped taking (`ai/key-alerts.ts`),
 * to the household's Admin, high enough to be emailed: on 2026-10-26 Gemini ran
 * out of credits and voice simply stopped. Out of credits and a rejected key are
 * told at once; a quota refusal only once it has lasted, so a passing rate limit
 * tells nobody. It resolves by itself when a call with the key works again.
 */
export function aiKeyNotices(rows: readonly AiKeyAlertRow[], directory: Directory, now: Date): Notice[] {
  const admin = adminOf(directory);
  if (!admin) return [];
  const notices: Notice[] = [];
  for (const row of rows) {
    const lasted = new Date(row.last_seen_at).getTime() - new Date(row.first_seen_at).getTime();
    if (row.kind === "quota_exhausted" && lasted < QUOTA_ALERT_AFTER_MS) continue;
    notices.push({
      sourceType: "ai_key",
      sourceId: row.id,
      threadKey: `ai_key:${row.purpose}`,
      recipientMemberId: admin,
      category: "system",
      priority: "high",
      title: msg(row.purpose === "gemini_voice" ? "reminder.aiKey.title.gemini_voice" : "reminder.aiKey.title.assistant"),
      body: msg(`reminder.aiKey.body.${row.kind}` as "reminder.aiKey.body.out_of_credits", { provider: PROVIDER_NAME[row.provider] }),
      action: { action: "open", target: "/settings/ai" },
      expiresAt: new Date(now.getTime() + 30 * DAY_MS),
    });
  }
  return notices;
}
