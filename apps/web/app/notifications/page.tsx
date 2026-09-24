import { BellOff, CalendarClock, Settings2 } from "lucide-react";
import Link from "next/link";

import { isHouseholdAdmin } from "@wonderhome/core/identity/households";
import { markNotificationsSeen } from "@wonderhome/core/notifications/actions";
import { localizeReminder } from "@wonderhome/core/notifications/message";
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from "@wonderhome/core/notifications/policies";
import type { Translate, TranslationKey } from "@wonderhome/core/i18n/translate";
import { atLocal, localMoment, shiftDate } from "@wonderhome/core/notifications/timing";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Alert } from "@wonderhome/core/ui/alert";
import { Card } from "@wonderhome/core/ui/card";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SegmentedControl } from "@wonderhome/core/ui/segmented-control";
import { EmptyState } from "@wonderhome/core/ui/states";
import { cn } from "@wonderhome/core/lib/cn";

import { ReminderDigest, ReminderRow, type ReminderRowLabels } from "../_components/reminder-row";
import { PRESET_KEYS, type SnoozePreset } from "../_lib/snooze-presets";
import { reconcileRemindersNow } from "../_lib/reminders";
import {
  REMINDER_COLUMNS,
  byUrgency,
  loadReminderDetails,
  snoozeDays,
  toReminderView,
  type ReminderRowData,
} from "../_lib/reminder-views";
import { requireSession } from "../_lib/session";

export const metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

const TABS = ["all", "action", "upcoming", "updates"] as const;
type Tab = (typeof TABS)[number];

/**
 * The notification center (stories 23-005, 23-009): what needs this person,
 * most pressing first — not a chronological inbox.
 *
 * - All: everything due that is still open.
 * - Action needed: what is waiting on them to do something.
 * - Upcoming: today and tomorrow at a glance, on the household's clock,
 *   including what the engine has already scheduled.
 * - Updates: what was dealt with or resolved itself this week.
 *
 * Each row opens in place to the live record behind it and the one thing to
 * do about it. Everything here is the person's own; nobody else's reminders
 * are ever read.
 */
export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ tab?: string; category?: string; done?: string; next?: string; until?: string }> }) {
  const [query, session] = await Promise.all([searchParams, requireSession("/notifications")]);
  const { supabase, membership, viewer, secondary, locale } = session;
  const timeZone = membership.household.timezone;
  const format = locale.format;
  const t = locale.t;
  const now = new Date();

  // Reminders follow the household's records: a bill paid since the last
  // look is resolved, and one newly due appears, before this reads.
  await reconcileRemindersNow(membership.household.id);

  const endOfTomorrow = atLocal(shiftDate(localMoment(now, timeZone).dateKey, 2), 0, timeZone);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const [{ data: openData }, { data: closedData }, { data: digestPref }] = await Promise.all([
    supabase
      .from("notifications")
      .select(REMINDER_COLUMNS)
      .eq("recipient_member_id", membership.memberId)
      .in("status", ["generated", "delivered", "seen"])
      .lte("scheduled_for", endOfTomorrow.toISOString())
      .order("scheduled_for", { ascending: false })
      .limit(100),
    supabase
      .from("notifications")
      .select(REMINDER_COLUMNS)
      .eq("recipient_member_id", membership.memberId)
      .in("status", ["acted", "resolved", "dismissed"])
      .gte("updated_at", weekAgo)
      .order("updated_at", { ascending: false })
      .limit(40),
    supabase.from("notification_preferences").select("daily_digest").eq("member_id", membership.memberId).eq("channel", "in_app").maybeSingle(),
  ]);

  // Each reminder in the viewer's own language; the stored English when it has no message this build can read.
  const inTheirLanguage = (row: ReminderRowData) => localizeReminder(row, locale.t, format);
  const openRows = ((openData ?? []) as ReminderRowData[]).map(inTheirLanguage);
  const closedRows = ((closedData ?? []) as ReminderRowData[]).map(inTheirLanguage);
  const due = openRows.filter((row) => Date.parse(row.scheduled_for) <= now.getTime());
  const upcoming = openRows.filter((row) => Date.parse(row.scheduled_for) > now.getTime());

  const tab: Tab = (TABS as readonly string[]).includes(query.tab ?? "") ? (query.tab as Tab) : "all";
  const category = (NOTIFICATION_CATEGORIES as readonly string[]).includes(query.category ?? "") ? (query.category as NotificationCategory) : null;

  const needsAction = (row: ReminderRowData) => row.type !== "completion";
  const pool = tab === "upcoming" ? [...due, ...upcoming] : tab === "updates" ? closedRows : tab === "action" ? due.filter(needsAction) : due;
  const shown = (category ? pool.filter((row) => row.category === category) : pool).sort(
    tab === "upcoming" ? (a, b) => Date.parse(a.scheduled_for) - Date.parse(b.scheduled_for) : tab === "updates" ? () => 0 : byUrgency,
  );

  const details = await loadReminderDetails(supabase, shown, format, { isAdmin: isHouseholdAdmin(membership) }, t);
  const views = shown.map((row) => ({ row, view: toReminderView(row, details, format, now, timeZone, t) }));
  const days = snoozeDays(now, timeZone, format, t);
  const labels = rowLabels(t);

  // What they have now looked at is seen — the badge counts only what is new.
  const unseen = due.filter((row) => row.status === "generated" || row.status === "delivered").map((row) => row.id);
  if (tab !== "updates" && unseen.length > 0) await markNotificationsSeen(supabase, unseen, now);

  const present = new Set([...due, ...upcoming, ...closedRows].map((row) => row.category));
  const hrefFor = (next: { tab?: Tab; category?: NotificationCategory | null }) => {
    const params = new URLSearchParams();
    const nextTab = next.tab ?? tab;
    const nextCategory = next.category === undefined ? category : next.category;
    if (nextTab !== "all") params.set("tab", nextTab);
    if (nextCategory) params.set("category", nextCategory);
    const search = params.toString();
    return search ? `/notifications?${search}` : "/notifications";
  };

  const firstName = membership.displayName.split(/\s+/)[0];

  // The day in one card (23-011): the same reminders, today's, in the order they come.
  const today = localMoment(now, timeZone).dateKey;
  const digest =
    tab === "all" && !category && (digestPref as { daily_digest?: boolean } | null)?.daily_digest !== false
      ? openRows
          .filter((row) => localMoment(new Date(row.scheduled_for), timeZone).dateKey === today)
          .sort((a, b) => Date.parse(a.scheduled_for) - Date.parse(b.scheduled_for))
          .map((row) => ({ id: row.id, category: row.category, title: row.title, when: format.time(row.scheduled_for) }))
      : [];
  // What an action on the thing itself just did — a closed code, never text from the address.
  const nextDue = query.next && /^\d{4}-\d{2}-\d{2}$/.test(query.next) ? format.date(query.next, "long") : null;
  const untilDate = query.until && !Number.isNaN(Date.parse(query.until)) ? new Date(query.until) : null;
  const snoozedUntil = untilDate
    ? localMoment(untilDate, timeZone).dateKey === localMoment(now, timeZone).dateKey
      ? t("notifications.done.snoozedToday", { time: format.time(untilDate) })
      : t("notifications.done.snoozedOn", { date: format.date(untilDate, "long"), time: format.time(untilDate) })
    : null;
  const confirmation =
    query.done === "paid"
      ? nextDue
        ? t("notifications.done.paidNext", { date: nextDue })
        : t("notifications.done.paid")
      : query.done === "done"
        ? t("notifications.done.done")
        : query.done === "done_all"
          ? t("notifications.done.doneAll")
          : query.done === "dismissed"
            ? t("notifications.done.dismissed")
            : query.done === "snoozed" && snoozedUntil
              ? snoozedUntil
              : null;

  return (
    <AppShell active="more" viewer={viewer} secondary={secondary} pathname="/notifications" back={{ href: "/", label: t("notifications.backHome") }} title={t("notifications.title")}>
      <div className="space-y-5">
        <header className="wh-rise flex items-start justify-between gap-3">
          <div className="min-w-0">
            {/* The phone header already names the screen; the heading is for wider screens. */}
            <h1 className="hidden text-[1.625rem] font-bold tracking-tight sm:text-3xl lg:block">{t("notifications.title")}</h1>
            <p className="text-sm text-[var(--wh-foreground-muted)]">
              {due.length > 0 ? t("notifications.lede.some", { name: firstName }) : t("notifications.lede.none", { name: firstName })}
            </p>
          </div>
          <Link
            href="/settings/notifications"
            aria-label={t("notifications.settings")}
            className="grid size-11 shrink-0 place-items-center rounded-full text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)]"
          >
            <Settings2 aria-hidden className="size-5" />
          </Link>
        </header>

        {confirmation ? <Alert tone="info">{confirmation}</Alert> : null}

        {digest.length > 1 ? (
          <ReminderDigest title={t("notifications.digest.title")} lede={t("notifications.digest.body", { count: digest.length, name: firstName })} items={digest} />
        ) : null}

        <SegmentedControl
          label={t("notifications.tabs.label")}
          active={tab}
          segments={[
            { key: "all", label: t("notifications.tab.all"), href: hrefFor({ tab: "all" }), count: due.length },
            { key: "action", label: t("notifications.tab.action"), href: hrefFor({ tab: "action" }), count: due.filter(needsAction).length },
            { key: "upcoming", label: t("notifications.tab.upcoming"), href: hrefFor({ tab: "upcoming" }), count: upcoming.length },
            { key: "updates", label: t("notifications.tab.updates"), href: hrefFor({ tab: "updates" }) },
          ]}
        />

        {present.size > 1 ? (
          <nav aria-label={t("notifications.filter.label")} className="flex flex-wrap gap-2">
            <CategoryChip href={hrefFor({ category: null })} active={category === null} label={t("notifications.filter.all")} />
            {NOTIFICATION_CATEGORIES.filter((key) => present.has(key)).map((key) => (
              <CategoryChip key={key} href={hrefFor({ category: key })} active={category === key} label={t(`notifications.category.${key}` as TranslationKey)} />
            ))}
          </nav>
        ) : null}

        {views.length === 0 ? (
          <EmptyState
            icon={tab === "upcoming" ? CalendarClock : BellOff}
            title={
              tab === "upcoming"
                ? t("notifications.empty.upcoming.title")
                : tab === "updates"
                  ? t("notifications.empty.updates.title")
                  : t("notifications.empty.none.title")
            }
            description={tab === "upcoming" ? t("notifications.empty.upcoming.body") : t("notifications.empty.body")}
          />
        ) : tab === "upcoming" ? (
          groupByDay(views, now, timeZone).map((group) => (
            <section key={group.label} className="space-y-2">
              <h2 className="px-1 text-sm font-semibold">{t(`notifications.day.${group.label}` as TranslationKey)}</h2>
              <Card className="p-1">
                <ul className="divide-y divide-[var(--wh-border)]">
                  {group.items.map(({ row, view }) => (
                    <ReminderRow key={row.id} view={{ ...view, when: format.time(row.scheduled_for) }} householdId={membership.household.id} snoozeDays={days} labels={labels} />
                  ))}
                </ul>
              </Card>
            </section>
          ))
        ) : (
          <Card className="p-1">
            <ul className="divide-y divide-[var(--wh-border)]">
              {views.map(({ row, view }) => (
                <ReminderRow key={row.id} view={view} householdId={membership.household.id} snoozeDays={days} labels={labels} />
              ))}
            </ul>
          </Card>
        )}

        <QuoteCard>{t("notifications.quote")}</QuoteCard>
      </div>
    </AppShell>
  );
}

function CategoryChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex min-h-10 items-center rounded-[var(--wh-radius-pill)] border px-3.5 text-sm font-medium transition-colors",
        active
          ? "border-[var(--wh-primary)] bg-[var(--wh-primary-soft)] text-[var(--wh-primary)]"
          : "border-[var(--wh-border)] bg-[var(--wh-surface)] text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)]",
      )}
    >
      {label}
    </Link>
  );
}

function groupByDay<T extends { row: ReminderRowData }>(items: T[], now: Date, timeZone: string): { label: string; items: T[] }[] {
  const today = localMoment(now, timeZone).dateKey;
  const tomorrow = shiftDate(today, 1);
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const day = localMoment(new Date(item.row.scheduled_for), timeZone).dateKey;
    const label = day <= today ? "today" : day === tomorrow ? "tomorrow" : "later";
    groups.set(label, [...(groups.get(label) ?? []), item]);
  }
  return ["today", "tomorrow", "later"].filter((label) => groups.has(label)).map((label) => ({ label, items: groups.get(label)! }));
}

/** The row's own words in the viewer's language (story 22-004). */
function rowLabels(t: Translate): ReminderRowLabels {
  const presetKeys: Record<SnoozePreset, TranslationKey> = {
    in_15_minutes: "notifications.snooze.in15",
    in_1_hour: "notifications.snooze.in60",
    later_today: "notifications.snooze.laterToday",
    tomorrow_morning: "notifications.snooze.tomorrowMorning",
    custom: "notifications.snooze.custom",
  };
  return {
    priority: { high: t("notifications.priority.high"), medium: t("notifications.priority.medium"), low: t("notifications.priority.low") },
    unread: t("notifications.new"),
    saving: t("common.saving"),
    snooze: {
      open: t("notifications.snooze.open"),
      when: t("notifications.snooze.when"),
      presets: Object.fromEntries(PRESET_KEYS.map((key) => [key, t(presetKeys[key])])) as ReminderRowLabels["snooze"]["presets"],
      day: t("notifications.snooze.day"),
      time: t("notifications.snooze.time"),
      set: t("notifications.snooze.set"),
      setting: t("notifications.snooze.setting"),
    },
    dismiss: t("notifications.dismiss"),
  };
}
