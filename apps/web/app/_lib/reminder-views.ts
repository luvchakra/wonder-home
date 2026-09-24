import type { SupabaseClient } from "@supabase/supabase-js";

import type { Formatter } from "@wonderhome/core/i18n/format";
import type { Translate, TranslationKey } from "@wonderhome/core/i18n/translate";
import { priorityFromStored, type NotificationCategory } from "@wonderhome/core/notifications/policies";
import { localMoment } from "@wonderhome/core/notifications/timing";

import type { ReminderView } from "../_components/reminder-row";

/**
 * Turning a person's reminders into what the notification center shows
 * (story 23-005). The details come from the record each reminder names,
 * read now through the person's own session — a reminder never carries a
 * copy of a bill's amount, and a record they cannot see stays unseen.
 */

export type ReminderRowData = {
  id: string;
  type: string;
  status: string;
  category: NotificationCategory;
  priority: string;
  title: string;
  body: string;
  /** The same words as a key and typed values, read in the viewer's language (story 22-006). */
  message?: unknown;
  source_type: string | null;
  source_id: string | null;
  scheduled_for: string;
  latest_at: string | null;
  expires_at: string | null;
  decision_factors: Record<string, unknown> | null;
  updated_at: string;
};

export const REMINDER_COLUMNS =
  "id, type, status, category, priority, title, body, message, source_type, source_id, scheduled_for, latest_at, expires_at, decision_factors, updated_at";

const OPEN = new Set(["generated", "delivered", "seen"]);
const CLOSED_AS = new Set(["acted", "resolved", "dismissed", "expired"]);
const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

export function isOpen(row: Pick<ReminderRowData, "status">): boolean {
  return OPEN.has(row.status);
}

/** Most pressing first: priority, then the nearest deadline, then the newest. */
export function byUrgency(a: ReminderRowData, b: ReminderRowData): number {
  const rank = PRIORITY_RANK[priorityFromStored(a.priority)]! - PRIORITY_RANK[priorityFromStored(b.priority)]!;
  if (rank !== 0) return rank;
  const deadline = (row: ReminderRowData) => Date.parse(row.latest_at ?? row.expires_at ?? "9999-12-31");
  const byDeadline = deadline(a) - deadline(b);
  if (byDeadline !== 0) return byDeadline;
  return Date.parse(b.scheduled_for) - Date.parse(a.scheduled_for);
}

type Details = Map<string, { details: { label: string; value: string }[]; link: ReminderView["link"]; complete: ReminderView["complete"]; reason?: string }>;

/** Reads the records behind a set of reminders in one query per kind. */
export async function loadReminderDetails(
  supabase: SupabaseClient,
  rows: readonly ReminderRowData[],
  format: Formatter,
  options: { isAdmin: boolean },
  t: Translate,
): Promise<Details> {
  const ids = (type: string) => [...new Set(rows.filter((row) => row.source_type === type && row.source_id).map((row) => row.source_id!))];
  // A grouped school day names each thing it stands for; they are read like any school item.
  const groupedItems = [...new Set(rows.filter((row) => row.source_type === "school_day").flatMap((row) => itemsOf(row)))];
  const schoolIds = [...new Set([...ids("school_item"), ...groupedItems])];
  const [bills, school, meals, pets, events] = await Promise.all([
    ids("obligation").length
      ? supabase.from("obligations").select("id, name, payee, amount_minor, currency, due_on, recurrence").in("id", ids("obligation"))
      : Promise.resolve({ data: [] }),
    schoolIds.length
      ? supabase.from("school_items").select("id, kind, title, due_at, due_time_known, child_member_id, status").in("id", schoolIds)
      : Promise.resolve({ data: [] }),
    ids("meal").length
      ? supabase.from("meals").select("id, name, slot, ready_by, recipes(name, total_minutes)").in("id", ids("meal"))
      : Promise.resolve({ data: [] }),
    ids("pet_care_need").length
      ? supabase.from("pet_care_needs").select("id, kind, pets(name)").in("id", ids("pet_care_need"))
      : Promise.resolve({ data: [] }),
    ids("family_event").length
      ? supabase.from("family_events").select("id, title, starts_at, location").in("id", ids("family_event"))
      : Promise.resolve({ data: [] }),
  ]);

  const map: Details = new Map();
  const RECURS = new Set(["monthly", "quarterly", "yearly", "one_off"]);
  const dateTime = (value: string) => t("notifications.detail.dateTime", { date: format.date(value, "long"), time: format.time(value) });

  for (const bill of (bills.data ?? []) as { id: string; name: string; payee: string | null; amount_minor: number | null; currency: string | null; due_on: string | null; recurrence: string | null }[]) {
    const details: { label: string; value: string }[] = [];
    if (bill.amount_minor !== null && bill.currency) details.push({ label: t("notifications.detail.amount"), value: format.money(bill.amount_minor / 100, bill.currency) });
    if (bill.due_on) details.push({ label: t("notifications.detail.due"), value: format.date(bill.due_on, "long") });
    if (bill.payee) details.push({ label: t("notifications.detail.paidTo"), value: bill.payee });
    if (bill.recurrence) {
      details.push({
        label: t("notifications.detail.repeats"),
        value: RECURS.has(bill.recurrence) ? t(`notifications.detail.recurs.${bill.recurrence}` as TranslationKey) : bill.recurrence,
      });
    }
    map.set(`obligation:${bill.id}`, {
      details,
      link: { href: "/bills", label: t("notifications.link.bill") },
      // Only an Admin can settle a bill; anyone else gets the bill, not a button that would refuse them.
      complete: options.isAdmin ? { label: t("notifications.complete.paid") } : null,
    });
  }

  const SCHOOL_KINDS = new Set(["homework", "worksheet", "exam", "project", "event"]);
  const schoolNoun = (kind: string) => (SCHOOL_KINDS.has(kind) ? t(`reminder.school.kind.${kind}` as TranslationKey) : t("notifications.detail.item"));
  const schoolRows = (school.data ?? []) as { id: string; kind: string; title: string; due_at: string | null; due_time_known: boolean; status: string }[];
  const dueWords = (item: { due_at: string | null; due_time_known: boolean }) =>
    item.due_at ? (item.due_time_known ? dateTime(item.due_at) : format.date(item.due_at.slice(0, 10), "long")) : null;
  for (const row of rows.filter((entry) => entry.source_type === "school_day")) {
    const items = itemsOf(row)
      .map((id) => schoolRows.find((item) => item.id === id))
      .filter((item): item is (typeof schoolRows)[number] => Boolean(item));
    const open = items.filter((item) => item.status === "pending" || item.status === "in_progress");
    map.set(`school_day:${row.source_id}:${row.id}`, {
      details: items.map((item) => {
        const due = dueWords(item);
        const text = due ? t("notifications.detail.itemDue", { title: item.title, due }) : item.title;
        return { label: schoolNoun(item.kind), value: open.includes(item) ? text : t("notifications.detail.itemDone", { text }) };
      }),
      link: { href: "/school", label: t("notifications.link.school") },
      complete: open.length > 0 ? { label: open.length === 1 ? t("notifications.complete.done") : t("notifications.complete.all", { count: open.length }) } : null,
    });
  }
  for (const item of schoolRows) {
    const details = [{ label: schoolNoun(item.kind), value: item.title }];
    if (item.due_at) details.push({ label: t("notifications.detail.due"), value: dueWords(item)! });
    map.set(`school_item:${item.id}`, {
      details,
      link: { href: "/school", label: t("notifications.link.school") },
      complete: { label: item.kind === "event" || item.kind === "exam" ? t("notifications.complete.ready") : t("notifications.complete.done") },
    });
  }

  for (const meal of (meals.data ?? []) as { id: string; name: string; ready_by: string; recipes: { name: string; total_minutes: number } | { name: string; total_minutes: number }[] | null }[]) {
    const recipe = Array.isArray(meal.recipes) ? meal.recipes[0] : meal.recipes;
    const details = [
      { label: t("notifications.detail.meal"), value: meal.name },
      { label: t("notifications.detail.readyBy"), value: format.time(meal.ready_by) },
    ];
    if (recipe) details.push({ label: t("notifications.detail.cookingTime"), value: t("notifications.detail.aboutMinutes", { count: recipe.total_minutes }) });
    map.set(`meal:${meal.id}`, {
      details,
      link: { href: "/meals", label: recipe ? t("notifications.link.recipe") : t("notifications.link.mealPlan") },
      complete: null,
      reason: recipe ? t("notifications.reason.recipe", { count: recipe.total_minutes }) : t("notifications.reason.noRecipe"),
    });
  }

  const PET_KINDS = new Set(["food", "litter", "medication", "vet_visit", "grooming", "exercise"]);
  for (const need of (pets.data ?? []) as { id: string; kind: string; pets: { name: string } | { name: string }[] | null }[]) {
    const pet = Array.isArray(need.pets) ? need.pets[0] : need.pets;
    map.set(`pet_care_need:${need.id}`, {
      details: [
        ...(pet ? [{ label: t("notifications.detail.pet"), value: pet.name }] : []),
        { label: t("notifications.detail.care"), value: PET_KINDS.has(need.kind) ? t(`reminder.pet.kind.${need.kind}` as TranslationKey) : need.kind },
      ],
      link: { href: "/household/home", label: t("notifications.link.home") },
      complete: { label: t("notifications.complete.doneShort") },
    });
  }

  for (const event of (events.data ?? []) as { id: string; title: string; starts_at: string; location: string | null }[]) {
    map.set(`family_event:${event.id}`, {
      details: [
        { label: t("notifications.detail.starts"), value: dateTime(event.starts_at) },
        ...(event.location ? [{ label: t("notifications.detail.where"), value: event.location }] : []),
      ],
      link: { href: "/today", label: t("notifications.link.today") },
      complete: null,
    });
  }

  return map;
}

/** The records a grouped reminder stands for, as its decision factors name them. */
function itemsOf(row: ReminderRowData): string[] {
  const items = row.decision_factors?.items;
  return Array.isArray(items) ? items.filter((id): id is string => typeof id === "string") : [];
}

const FALLBACK_LINKS: Record<string, { href: string; label: TranslationKey }> = {
  school_day: { href: "/school", label: "notifications.link.school" },
  grocery_list: { href: "/groceries", label: "notifications.link.groceries" },
  health_appointment: { href: "/health", label: "notifications.link.health" },
  health_routine: { href: "/health", label: "notifications.link.health" },
  health_checkup: { href: "/health", label: "notifications.link.health" },
  approval: { href: "/household", label: "notifications.link.approval" },
};

/** Why a reminder came to this person, or when it did — only when something actually shaped it. */
function placementReason(row: ReminderRowData, format: Formatter, t: Translate): string | null {
  if (typeof row.decision_factors?.escalatedFrom === "string") return t("notifications.reason.backup");
  if (row.decision_factors?.timing === "learned") return t("notifications.reason.learned", { time: format.time(row.scheduled_for) });
  switch (row.decision_factors?.placement) {
    case "after_quiet_hours":
      return t("notifications.reason.afterQuiet", { time: format.time(row.scheduled_for) });
    case "before_quiet_hours":
      return t("notifications.reason.beforeQuiet");
    case "breaks_quiet_hours":
      return t("notifications.reason.breaksQuiet");
    default:
      return null;
  }
}

export function toReminderView(
  row: ReminderRowData,
  details: Details,
  format: Formatter,
  now: Date,
  timeZone: string,
  t: Translate,
): ReminderView {
  const found =
    row.source_type === "school_day"
      ? details.get(`school_day:${row.source_id}:${row.id}`)
      : row.source_type && row.source_id
        ? details.get(`${row.source_type}:${row.source_id}`)
        : undefined;
  const at = new Date(row.scheduled_for);
  const today = localMoment(now, timeZone).dateKey;
  const day = localMoment(at, timeZone).dateKey;
  const open = isOpen(row);
  return {
    id: row.id,
    category: row.category,
    categoryLabel: t(`notifications.category.${row.category}` as TranslationKey),
    title: row.title,
    body: row.body,
    priority: priorityFromStored(row.priority),
    when: day === today ? format.time(at) : format.date(at),
    unread: row.status === "generated" || row.status === "delivered",
    details: found?.details ?? [],
    reason: placementReason(row, format, t) ?? found?.reason ?? null,
    complete: open ? (found?.complete ?? null) : null,
    link: found?.link ?? fallbackLink(row.source_type, t),
    open,
    closedAs: open || !CLOSED_AS.has(row.status) ? null : t(`notifications.closed.${row.status}` as TranslationKey),
  };
}

function fallbackLink(sourceType: string | null, t: Translate): ReminderView["link"] {
  const link = sourceType ? FALLBACK_LINKS[sourceType] : undefined;
  return link ? { href: link.href, label: t(link.label) } : null;
}

/** The next week's days for a picked snooze time, on the household's clock. */
export function snoozeDays(now: Date, timeZone: string, format: Formatter, t: Translate): { value: string; label: string }[] {
  const today = localMoment(now, timeZone).dateKey;
  return Array.from({ length: 8 }, (_, index) => {
    const date = new Date(Date.parse(`${today}T12:00:00Z`) + index * 86_400_000).toISOString().slice(0, 10);
    return { value: date, label: index === 0 ? t("notifications.day.today") : index === 1 ? t("notifications.day.tomorrow") : format.date(date, "long") };
  });
}
