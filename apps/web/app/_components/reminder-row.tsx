"use client";

import { Bell, ChevronDown, Clock, GraduationCap, HeartHandshake, HeartPulse, MoreHorizontal, PawPrint, ShoppingBasket, Utensils, Wallet, Wrench, X } from "lucide-react";
import Link from "next/link";
import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";

import type { NotificationCategory } from "@wonderhome/core/notifications/policies";
import { Alert } from "@wonderhome/core/ui/alert";
import { IconTile, type IconTone } from "@wonderhome/core/ui/icon-tile";
import { Badge } from "@wonderhome/core/ui/pill";
import { Button, ButtonLink } from "@wonderhome/core/ui/button";

import { completeReminderSourceAction, dismissReminderAction, snoozeReminderAction } from "../(auth)/notification-actions";
import type { ActionState } from "../(auth)/actions";
import type { ReminderRowView } from "../_lib/reminder-groups";
import { PRESET_KEYS, type SnoozePreset } from "../_lib/snooze-presets";

/**
 * One row in the notification center (story 23-005), made crisp (the owner,
 * 2026-11-03): design rule 4's row and nothing more in view — a tinted tile
 * for its category, the name, one line with the key fact said once ("₹300 ·
 * due yesterday"), and the single thing to do. Putting it off and "Not
 * needed" sit behind the row's ⋯; the record's details, why it came when it
 * did and a second way in open with a tap on the row (rule 21). A row may
 * stand for several alike reminders (`reminder-groups.ts`); then its ⋯ puts
 * off or clears each of them. "Urgent" is said, in words, only for money or
 * health that truly is. The category's icon is resolved here, inside the
 * client component, because a component cannot cross the server boundary.
 */

export type ReminderView = {
  id: string;
  category: NotificationCategory;
  /** The category's name in the viewer's language. */
  categoryLabel: string;
  title: string;
  body: string;
  priority: "high" | "medium" | "low";
  /** When it is for, already worded on the household's clock. */
  when: string;
  unread: boolean;
  details: readonly { label: string; value: string }[];
  /** The key fact, said once on the row ("₹300 · due yesterday"); null when the body says it best. */
  fact: string | null;
  /** Its own date has passed and it is still open. */
  overdue: boolean;
  /** What it is about (`obligation`, `homesend_item`, …), for grouping alike reminders. */
  sourceType: string | null;
  /** Why it came when it did — only ever what the engine actually used. */
  reason: string | null;
  complete: { label: string } | null;
  link: { href: string; label: string } | null;
  /** Still open, so it can be acted on, snoozed or dismissed. */
  open: boolean;
  /** How it ended, for the history ("Done", "Resolved"). */
  closedAs: string | null;
};

const CATEGORY: Record<NotificationCategory, { icon: typeof Bell; tone: IconTone }> = {
  meals: { icon: Utensils, tone: "meals" },
  school: { icon: GraduationCap, tone: "school" },
  groceries: { icon: ShoppingBasket, tone: "home" },
  bills: { icon: Wallet, tone: "money" },
  home: { icon: Wrench, tone: "home" },
  pets: { icon: PawPrint, tone: "care" },
  appointments: { icon: HeartPulse, tone: "health" },
  family: { icon: HeartHandshake, tone: "people" },
  system: { icon: Bell, tone: "primary" },
};

/**
 * The row's own words in the viewer's language, read on the server and
 * passed in — a client component has no catalog of its own (story 22-004).
 */
export type ReminderRowLabels = {
  urgent: string;
  unread: string;
  saving: string;
  snooze: {
    open: string;
    when: string;
    presets: Record<SnoozePreset, string>;
    day: string;
    time: string;
    set: string;
    setting: string;
  };
  dismiss: string;
  /** The ⋯ menu's name for a screen reader. */
  more: string;
};

/** The one-tap times under "Remind me later"; a picked day and time sits after them. */
const QUICK_PRESETS = PRESET_KEYS.filter((key) => key !== "custom");

export function ReminderRow({
  row,
  householdId,
  snoozeDays,
  labels,
}: {
  row: ReminderRowView;
  householdId: string;
  labels: ReminderRowLabels;
  /** The next week's days, worded ("Today", "Tomorrow", "Sat 27 Sep"), for a picked time. */
  snoozeDays: readonly { value: string; label: string }[];
}) {
  const category = CATEGORY[row.category];
  const { more } = row;
  const expandable = more.details.length > 0 || more.reason !== null || more.link !== null || more.items.length > 0;
  const heading = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold break-words">{row.title}</span>
          {row.countLabel ? <Badge tone="neutral">{row.countLabel}</Badge> : null}
          {row.urgent ? <Badge tone="attention">{labels.urgent}</Badge> : null}
          {!row.open && row.closedAs ? <Badge tone="handled">{row.closedAs}</Badge> : null}
          {row.unread ? <span className="size-2 shrink-0 rounded-full bg-[var(--wh-primary)]" role="img" aria-label={labels.unread} /> : null}
        </p>
        <p className="text-sm break-words text-[var(--wh-foreground-muted)]">{row.line}</p>
      </div>
      <span className="flex shrink-0 items-center gap-1 pt-0.5 text-xs whitespace-nowrap text-[var(--wh-foreground-subtle)]">
        {row.when}
        {expandable ? <ChevronDown aria-hidden className="size-4 transition-transform group-open/row:rotate-180 motion-reduce:transition-none" /> : null}
      </span>
    </div>
  );
  return (
    <li className="relative flex items-start gap-3 px-3 py-3 sm:px-4" data-reminder-row={row.key}>
      <span className="sr-only">{row.categoryLabel}: </span>
      <IconTile icon={category.icon} tone={category.tone} />
      <div className="min-w-0 flex-1 space-y-2">
        {expandable ? (
          <details className="group/row">
            <summary className="cursor-pointer list-none rounded-[var(--wh-radius-sm)] [&::-webkit-details-marker]:hidden">{heading}</summary>
            <div className="mt-2 space-y-2">
              {more.details.length > 0 ? (
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] px-3 py-2 text-sm">
                  {more.details.map((detail) => (
                    <div key={detail.label} className="contents">
                      <dt className="text-[var(--wh-foreground-muted)]">{detail.label}</dt>
                      <dd className="font-medium break-words">{detail.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {more.items.length > 0 ? (
                <ul className="space-y-1 rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] px-3 py-2 text-sm">
                  {more.items.map((item) => (
                    <li key={item.id} className="flex items-start justify-between gap-3">
                      <span className="min-w-0 break-words">{item.title === row.title ? item.line : item.title}</span>
                      <span className="shrink-0 text-xs whitespace-nowrap text-[var(--wh-foreground-subtle)]">{item.when}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {more.reason ? <p className="text-xs text-[var(--wh-foreground-subtle)]">{more.reason}</p> : null}
              {more.link ? (
                <Link href={more.link.href} className="inline-flex min-h-10 items-center text-sm font-semibold text-[var(--wh-primary)] underline-offset-2 hover:underline">
                  {more.link.label}
                </Link>
              ) : null}
            </div>
          </details>
        ) : (
          heading
        )}

        {row.open ? (
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              {row.primary?.kind === "complete" ? <CompleteForm id={row.primary.id} householdId={householdId} label={row.primary.label} savingLabel={labels.saving} /> : null}
              {row.primary?.kind === "link" ? (
                <ButtonLink href={row.primary.href} className="min-h-10 rounded-[var(--wh-radius-pill)] px-4">
                  {row.primary.label}
                </ButtonLink>
              ) : null}
            </div>
            <MoreMenu ids={row.ids} householdId={householdId} days={snoozeDays} labels={labels} />
          </div>
        ) : null}
      </div>
    </li>
  );
}

/** The row's ⋯: putting it off and saying it is not needed, kept out of the way until asked for. */
function MoreMenu({ ids, householdId, days, labels }: { ids: readonly string[]; householdId: string; days: readonly { value: string; label: string }[]; labels: ReminderRowLabels }) {
  return (
    <details className="group/more shrink-0">
      <summary
        aria-label={labels.more}
        className="grid size-10 cursor-pointer list-none place-items-center rounded-full text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)] [&::-webkit-details-marker]:hidden"
      >
        <MoreHorizontal aria-hidden className="size-5" />
      </summary>
      <div className="absolute inset-x-3 z-10 mt-1 space-y-1 rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)] p-2 shadow-[var(--wh-shadow-card)] sm:left-auto sm:w-80">
        <SnoozeForm ids={ids} householdId={householdId} days={days} labels={labels.snooze} />
        <DismissForm ids={ids} householdId={householdId} label={labels.dismiss} />
      </div>
    </details>
  );
}

function Ids({ ids, householdId }: { ids: readonly string[]; householdId: string }) {
  return (
    <>
      {ids.map((id) => (
        <input key={id} type="hidden" name="notificationId" value={id} />
      ))}
      <input type="hidden" name="householdId" value={householdId} />
    </>
  );
}

function Pending({ children, pendingLabel, variant = "primary" }: { children: string; pendingLabel: string; variant?: "primary" | "secondary" | "quiet" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending} className="rounded-[var(--wh-radius-pill)]">
      {pending ? pendingLabel : children}
    </Button>
  );
}

function Feedback({ state }: { state: ActionState }) {
  if (state.error) return <Alert>{state.error}</Alert>;
  if (state.notice) return <Alert tone="info">{state.notice}</Alert>;
  return null;
}

function CompleteForm({ id, householdId, label, savingLabel }: { id: string; householdId: string; label: string; savingLabel: string }) {
  const [state, action] = useActionState(completeReminderSourceAction, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="notificationId" value={id} />
      <input type="hidden" name="householdId" value={householdId} />
      <Pending pendingLabel={savingLabel}>{label}</Pending>
      <Feedback state={state} />
    </form>
  );
}

function SnoozeForm({
  ids,
  householdId,
  days,
  labels,
}: {
  ids: readonly string[];
  householdId: string;
  days: readonly { value: string; label: string }[];
  labels: ReminderRowLabels["snooze"];
}) {
  const [state, action] = useActionState(snoozeReminderAction, {});
  const fieldId = useId();
  return (
    <details className="group">
      <summary className="flex min-h-10 w-full cursor-pointer list-none items-center gap-1.5 rounded-[var(--wh-radius-pill)] px-2 text-sm font-semibold whitespace-nowrap text-[var(--wh-primary)] hover:bg-[var(--wh-primary-soft)] [&::-webkit-details-marker]:hidden">
        <Clock aria-hidden className="size-4" />
        {labels.open}
      </summary>
      <form action={action} className="mt-2 space-y-3 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] p-3">
        <Ids ids={ids} householdId={householdId} />
        {/* One tap: each time is its own submit, carrying its preset. */}
        <div role="group" aria-label={labels.when} className="flex flex-wrap gap-2">
          {QUICK_PRESETS.map((value) => (
            <QuickTime key={value} value={value} label={labels.presets[value]} />
          ))}
        </div>
        <details>
          <summary className="inline-flex min-h-10 cursor-pointer list-none items-center text-sm font-medium text-[var(--wh-foreground-muted)] underline-offset-2 hover:underline [&::-webkit-details-marker]:hidden">
            {labels.presets.custom}
          </summary>
          <div className="mt-2 space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label htmlFor={`${fieldId}-date`} className="block space-y-1.5 text-sm">
                <span className="font-medium">{labels.day}</span>
                <select
                  id={`${fieldId}-date`}
                  name="date"
                  defaultValue={days[0]?.value}
                  className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
                >
                  {days.map((day) => (
                    <option key={day.value} value={day.value}>
                      {day.label}
                    </option>
                  ))}
                </select>
              </label>
              <label htmlFor={`${fieldId}-time`} className="block space-y-1.5 text-sm">
                <span className="font-medium">{labels.time}</span>
                <input
                  id={`${fieldId}-time`}
                  type="time"
                  name="time"
                  step={900}
                  defaultValue="18:00"
                  className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
                />
              </label>
            </div>
            <QuickTime value="custom" label={labels.set} pendingLabel={labels.setting} />
          </div>
        </details>
        <Feedback state={state} />
      </form>
    </details>
  );
}

/** A snooze time that is its own submit button; the action reads the pressed button's preset. */
function QuickTime({ value, label, pendingLabel }: { value: SnoozePreset; label: string; pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" name="preset" value={value} variant="secondary" disabled={pending} className="min-h-10 rounded-[var(--wh-radius-pill)] px-3.5">
      {pending && pendingLabel ? pendingLabel : label}
    </Button>
  );
}

function DismissForm({ ids, householdId, label }: { ids: readonly string[]; householdId: string; label: string }) {
  const [state, action] = useActionState(dismissReminderAction, {});
  return (
    <form action={action}>
      <Ids ids={ids} householdId={householdId} />
      <DismissButton label={label} />
      <Feedback state={state} />
    </form>
  );
}

function DismissButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="quiet" disabled={pending} className="min-h-10 w-full justify-start rounded-[var(--wh-radius-pill)] px-2 text-[var(--wh-foreground-muted)]">
      <X aria-hidden className="size-4" />
      {label}
    </Button>
  );
}
