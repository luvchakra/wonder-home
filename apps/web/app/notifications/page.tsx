import { BellOff, ChevronDown, HandHeart, Settings2 } from "lucide-react";
import Link from "next/link";

import { createAdminClient } from "@wonderhome/core/db/admin";
import { isHouseholdAdmin } from "@wonderhome/core/identity/households";
import { markNotificationsSeen } from "@wonderhome/core/notifications/actions";
import { localizeReminder } from "@wonderhome/core/notifications/message";
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from "@wonderhome/core/notifications/policies";
import type { Translate, TranslationKey } from "@wonderhome/core/i18n/translate";
import { atLocal, localMoment, shiftDate } from "@wonderhome/core/notifications/timing";
import { webPushPublicKey } from "@wonderhome/core/notifications/web-push";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Alert } from "@wonderhome/core/ui/alert";
import { Card } from "@wonderhome/core/ui/card";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { EmptyState } from "@wonderhome/core/ui/states";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { cn } from "@wonderhome/core/lib/cn";

import { PushNudge } from "../_components/push-nudge";
import { ReminderRow, type ReminderRowLabels } from "../_components/reminder-row";
import { RequestAnswer } from "../_components/request-answer";
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

/**
 * The notification center (stories 23-005, 23-009), redesigned to be read at
 * a glance and acted on in place (the owner, 2026-10-23):
 *
 * - Requests: what a child or helper is waiting on this adult to approve.
 * - Needs you now: what is due and still open, most pressing first, each
 *   card carrying its facts and its actions without opening anything.
 * - Coming up: later today and tomorrow, by day — the day summary, which the
 *   person can turn off in Settings ("Today's summary").
 * - Done this week: folded away, for the record.
 *
 * Everything here is the person's own; nobody else's reminders are ever read.
 */
export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ category?: string; done?: string; next?: string; until?: string }> }) {
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
  const [{ data: openData }, { data: closedData }, { data: digestPref }, requests, { data: deviceRows }] = await Promise.all([
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
    // A child's or helper's requests waiting on this adult's OK (conversation/referral.ts).
    membership.memberType === "adult"
      ? import("@wonderhome/core/conversation/referral").then(({ pendingApprovalsFor }) =>
          pendingApprovalsFor(createAdminClient(), { householdId: membership.household.id, memberId: membership.memberId, now }).catch(() => []),
        )
      : Promise.resolve([]),
    // This member's push devices, so the nudge below knows whether this one is already on.
    supabase.from("push_subscriptions").select("endpoint").eq("member_id", membership.memberId),
  ]);
  const myEndpoints = ((deviceRows ?? []) as { endpoint: string }[]).map((row) => row.endpoint);
  const asked = new Set(requests.map((request) => request.id));

  // Each reminder in the viewer's own language; the stored English when it has no message this build can read.
  const inTheirLanguage = (row: ReminderRowData) => localizeReminder(row, locale.t, format);
  // A request shown with its own Approve and Decline is not listed twice.
  const openRows = ((openData ?? []) as ReminderRowData[]).filter((row) => !(row.source_type === "approval" && row.source_id && asked.has(row.source_id))).map(inTheirLanguage);
  const closedRows = ((closedData ?? []) as ReminderRowData[]).map(inTheirLanguage);
  const showComing = (digestPref as { daily_digest?: boolean } | null)?.daily_digest !== false;

  const category = (NOTIFICATION_CATEGORIES as readonly string[]).includes(query.category ?? "") ? (query.category as NotificationCategory) : null;
  const inCategory = (row: ReminderRowData) => !category || row.category === category;
  const due = openRows.filter((row) => Date.parse(row.scheduled_for) <= now.getTime());
  const nowRows = due.filter(inCategory).sort(byUrgency);
  const comingRows = showComing
    ? openRows.filter((row) => Date.parse(row.scheduled_for) > now.getTime() && inCategory(row)).sort((a, b) => Date.parse(a.scheduled_for) - Date.parse(b.scheduled_for))
    : [];
  const doneRows = closedRows.filter(inCategory);

  const details = await loadReminderDetails(supabase, [...nowRows, ...comingRows, ...doneRows], format, { isAdmin: isHouseholdAdmin(membership) }, t);
  const viewOf = (row: ReminderRowData) => ({ row, view: toReminderView(row, details, format, now, timeZone, t) });
  const days = snoozeDays(now, timeZone, format, t);
  const labels = rowLabels(t);

  // What they have now looked at is seen — the badge counts only what is new.
  const unseen = due.filter((row) => row.status === "generated" || row.status === "delivered").map((row) => row.id);
  if (unseen.length > 0) await markNotificationsSeen(supabase, unseen, now);

  const present = new Set([...openRows, ...closedRows].map((row) => row.category));
  const hrefFor = (next: NotificationCategory | null) => (next ? `/notifications?category=${next}` : "/notifications");

  const firstName = membership.displayName.split(/\s+/)[0];
  const lede =
    due.length > 0
      ? t("notifications.lede.count", { count: due.length, name: firstName })
      : comingRows.length > 0
        ? t("notifications.lede.upcomingOnly", { name: firstName })
        : t("notifications.lede.none", { name: firstName });

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
              {lede}
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

        {requests.length > 0 ? (
          <section className="space-y-2">
            <h2 className="text-base font-semibold">{t("notifications.requests.title")}</h2>
            <p className="text-sm text-[var(--wh-foreground-muted)]">{t("notifications.requests.lede")}</p>
            {requests.map((request) => (
              <Card key={request.id} className="space-y-3 p-4">
                <div className="flex items-start gap-3">
                  <IconTile icon={HandHeart} tone="people" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold break-words">{request.summary}</p>
                    <p className="text-xs text-[var(--wh-foreground-subtle)]">{t("notifications.requests.until", { date: format.date(request.expiresAt, "long"), time: format.time(request.expiresAt) })}</p>
                  </div>
                </div>
                <RequestAnswer
                  householdId={membership.household.id}
                  approvalId={request.id}
                  labels={{ approve: t("notifications.requests.approve"), decline: t("notifications.requests.decline"), working: t("common.saving") }}
                />
              </Card>
            ))}
          </section>
        ) : null}

        {/* Push on this phone, offered where reminders are read; nothing when it would not work or is already on. */}
        <PushNudge
          householdId={membership.household.id}
          publicKey={webPushPublicKey()}
          myEndpoints={myEndpoints}
          labels={{
            title: t("push.nudge.title"),
            lede: t("push.nudge.lede"),
            turnOn: t("push.device.turnOn"),
            notNow: t("push.nudge.notNow"),
            done: t("push.nudge.done"),
            unsupported: t("push.device.unsupported"),
          }}
        />

        {present.size > 1 ? (
          <nav aria-label={t("notifications.filter.label")} className="flex flex-wrap gap-2">
            <CategoryChip href={hrefFor(null)} active={category === null} label={t("notifications.filter.all")} />
            {NOTIFICATION_CATEGORIES.filter((key) => present.has(key)).map((key) => (
              <CategoryChip key={key} href={hrefFor(key)} active={category === key} label={t(`notifications.category.${key}` as TranslationKey)} />
            ))}
          </nav>
        ) : null}

        <section aria-labelledby="needs-you-now" className="space-y-2">
          <h2 id="needs-you-now" className="flex items-center gap-2 px-1 text-base font-semibold">
            {t("notifications.section.now")}
            {nowRows.length > 0 ? <span className="rounded-[var(--wh-radius-pill)] bg-[var(--wh-primary-soft)] px-2 text-sm text-[var(--wh-primary)]">{nowRows.length}</span> : null}
          </h2>
          {nowRows.length === 0 ? (
            <EmptyState icon={BellOff} title={t("notifications.empty.none.title")} description={t("notifications.empty.body")} />
          ) : (
            <ul className="space-y-3">
              {nowRows.map((row) => (
                <ReminderRow key={row.id} card view={viewOf(row).view} householdId={membership.household.id} snoozeDays={days} labels={labels} />
              ))}
            </ul>
          )}
        </section>

        {comingRows.length > 0 ? (
          <section aria-labelledby="coming-up" className="space-y-2">
            <h2 id="coming-up" className="px-1 text-base font-semibold">{t("notifications.section.coming")}</h2>
            {groupByDay(comingRows.map(viewOf), now, timeZone).map((group) => (
              <div key={group.label} className="space-y-1.5">
                <h3 className="px-1 text-sm font-medium text-[var(--wh-foreground-muted)]">{t(`notifications.day.${group.label}` as TranslationKey)}</h3>
                <Card className="p-0">
                  <ul className="divide-y divide-[var(--wh-border)]">
                    {group.items.map(({ row, view }) => (
                      <ReminderRow key={row.id} view={{ ...view, when: format.time(row.scheduled_for) }} householdId={membership.household.id} snoozeDays={days} labels={labels} />
                    ))}
                  </ul>
                </Card>
              </div>
            ))}
          </section>
        ) : null}

        {doneRows.length > 0 ? (
          <details className="group space-y-2">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-[var(--wh-radius-md)] px-1 text-base font-semibold [&::-webkit-details-marker]:hidden">
              <span>
                {t("notifications.section.done")} <span className="font-normal text-[var(--wh-foreground-muted)]">({doneRows.length})</span>
              </span>
              <ChevronDown aria-hidden className="size-5 text-[var(--wh-foreground-muted)] transition-transform group-open:rotate-180 motion-reduce:transition-none" />
            </summary>
            <Card className="p-0">
              <ul className="divide-y divide-[var(--wh-border)]">
                {doneRows.map((row) => (
                  <ReminderRow key={row.id} view={viewOf(row).view} householdId={membership.household.id} snoozeDays={days} labels={labels} />
                ))}
              </ul>
            </Card>
          </details>
        ) : null}

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
    urgent: t("notifications.urgent"),
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
    dismiss: t("notifications.dismissShort"),
  };
}
