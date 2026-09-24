"use client";

import { Bell, GraduationCap, HeartHandshake, HeartPulse, PawPrint, ShoppingBasket, Sparkles, Utensils, Wallet, Wrench } from "lucide-react";
import Link from "next/link";
import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";

import { CATEGORY_LABELS, type NotificationCategory } from "@wonderhome/core/notifications/policies";
import { Alert } from "@wonderhome/core/ui/alert";
import { ChoiceChips } from "@wonderhome/core/ui/choice-chips";
import { ExpandableRow } from "@wonderhome/core/ui/expandable-row";
import { IconTile, type IconTone } from "@wonderhome/core/ui/icon-tile";
import { Badge, type BadgeTone } from "@wonderhome/core/ui/pill";
import { Button } from "@wonderhome/core/ui/button";
import { Card } from "@wonderhome/core/ui/card";

import { completeReminderSourceAction, dismissReminderAction, snoozeReminderAction } from "../(auth)/notification-actions";
import type { ActionState } from "../(auth)/actions";

/**
 * One reminder in the notification center (story 23-005).
 *
 * Rule 4's row — a tinted tile for its category, the name, one line of
 * reason — with rule 21's chevron opening it in place to everything behind
 * it: the live details from the record it is about, why it came when it
 * did, the one thing to do about the record itself, and the reminder's own
 * snooze and dismiss. The category's icon is resolved here, inside the
 * client component, because a component cannot cross the server boundary.
 */

export type ReminderView = {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  priority: "high" | "medium" | "low";
  /** When it is for, already worded on the household's clock. */
  when: string;
  unread: boolean;
  details: readonly { label: string; value: string }[];
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

const PRIORITY: Record<ReminderView["priority"], { word: string; tone: BadgeTone }> = {
  high: { word: "High", tone: "attention" },
  medium: { word: "Medium", tone: "neutral" },
  low: { word: "Low", tone: "neutral" },
};

export function ReminderRow({
  view,
  householdId,
  snoozeDays,
}: {
  view: ReminderView;
  householdId: string;
  /** The next week's days, worded ("Today", "Tomorrow", "Sat 27 Sep"), for a picked time. */
  snoozeDays: readonly { value: string; label: string }[];
}) {
  const category = CATEGORY[view.category];
  const categoryLabel = CATEGORY_LABELS[view.category];
  const priority = PRIORITY[view.priority];

  return (
    <ExpandableRow
      summary={
        <>
          <span className="sr-only">{categoryLabel}: </span>
          <IconTile icon={category.icon} tone={category.tone} />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-medium">{view.title}</span>
              {view.open ? <Badge tone={priority.tone}>{priority.word}</Badge> : view.closedAs ? <Badge tone="handled">{view.closedAs}</Badge> : null}
              {view.unread ? <span className="size-2 shrink-0 rounded-full bg-[var(--wh-primary)]" aria-label="New" /> : null}
            </span>
            <span className="mt-0.5 block text-sm text-[var(--wh-foreground-muted)]">{view.body}</span>
          </span>
          <span className="shrink-0 self-start pt-0.5 text-xs text-[var(--wh-foreground-subtle)]">{view.when}</span>
        </>
      }
    >
      <div className="space-y-3 border-t border-[var(--wh-border)] pt-3">
        {view.details.length > 0 ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            {view.details.map((detail) => (
              <div key={detail.label} className="contents">
                <dt className="text-[var(--wh-foreground-muted)]">{detail.label}</dt>
                <dd className="font-medium">{detail.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {view.reason ? <p className="text-xs text-[var(--wh-foreground-subtle)]">{view.reason}</p> : null}

        {view.open ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {view.complete ? <CompleteForm id={view.id} householdId={householdId} label={view.complete.label} /> : null}
              {view.link ? (
                <Link
                  href={view.link.href}
                  className="inline-flex min-h-11 items-center rounded-[var(--wh-radius-pill)] px-4 text-sm font-semibold text-[var(--wh-primary)] hover:bg-[var(--wh-primary-soft)]"
                >
                  {view.link.label}
                </Link>
              ) : null}
            </div>
            <SnoozeForm id={view.id} householdId={householdId} days={snoozeDays} />
            <DismissForm id={view.id} householdId={householdId} />
          </div>
        ) : null}
      </div>
    </ExpandableRow>
  );
}

function Pending({ children, pendingLabel, variant = "primary" }: { children: string; pendingLabel: string; variant?: "primary" | "secondary" | "quiet" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? pendingLabel : children}
    </Button>
  );
}

function Feedback({ state }: { state: ActionState }) {
  if (state.error) return <Alert>{state.error}</Alert>;
  if (state.notice) return <Alert tone="info">{state.notice}</Alert>;
  return null;
}

function CompleteForm({ id, householdId, label }: { id: string; householdId: string; label: string }) {
  const [state, action] = useActionState(completeReminderSourceAction, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="notificationId" value={id} />
      <input type="hidden" name="householdId" value={householdId} />
      <Pending pendingLabel="Saving…">{label}</Pending>
      <Feedback state={state} />
    </form>
  );
}

const PRESETS = [
  { value: "in_15_minutes", label: "In 15 minutes" },
  { value: "in_1_hour", label: "In 1 hour" },
  { value: "later_today", label: "Later today" },
  { value: "tomorrow_morning", label: "Tomorrow morning" },
  { value: "custom", label: "Pick a day and time" },
] as const;

function SnoozeForm({ id, householdId, days }: { id: string; householdId: string; days: readonly { value: string; label: string }[] }) {
  const [state, action] = useActionState(snoozeReminderAction, {});
  const fieldId = useId();
  return (
    <details className="group rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] px-3 py-2">
      <summary className="flex min-h-10 cursor-pointer list-none items-center text-sm font-semibold text-[var(--wh-foreground)] [&::-webkit-details-marker]:hidden">
        Remind me later
      </summary>
      <form action={action} className="space-y-3 pt-2">
        <input type="hidden" name="notificationId" value={id} />
        <input type="hidden" name="householdId" value={householdId} />
        <ChoiceChips legend="When" legendHidden name="preset" options={PRESETS} defaultValue="in_1_hour" size="sm" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label htmlFor={`${fieldId}-date`} className="block space-y-1.5 text-sm">
            <span className="font-medium">Day, for a picked time</span>
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
            <span className="font-medium">Time, for a picked time</span>
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
        <Pending pendingLabel="Setting…" variant="secondary">Set reminder</Pending>
        <Feedback state={state} />
      </form>
    </details>
  );
}

function DismissForm({ id, householdId }: { id: string; householdId: string }) {
  const [state, action] = useActionState(dismissReminderAction, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="notificationId" value={id} />
      <input type="hidden" name="householdId" value={householdId} />
      <Pending pendingLabel="…" variant="quiet">Dismiss</Pending>
      <Feedback state={state} />
    </form>
  );
}

/**
 * The day in one card (story 23-011): what is waiting on this person today,
 * in the order it comes, built from the very reminders listed below it — a
 * summary, never a second source, and never a number the list does not
 * show. Shown only when there is more than one thing, and only to someone
 * who has not turned it off.
 */
export function ReminderDigest({
  firstName,
  items,
}: {
  firstName: string;
  items: readonly { id: string; category: NotificationCategory; title: string; when: string }[];
}) {
  return (
    <Card className="space-y-3">
      <div className="flex items-start gap-3">
        <IconTile icon={Sparkles} tone="primary" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">HomeBrain summary · Today</h2>
          <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">
            {items.length} things to take care of. Here&rsquo;s what&rsquo;s important for you, {firstName}.
          </p>
        </div>
      </div>
      <ol className="divide-y divide-[var(--wh-border)]">
        {items.map((item) => {
          const category = CATEGORY[item.category];
          return (
            <li key={item.id} className="flex items-center gap-3 py-2">
              <IconTile icon={category.icon} tone={category.tone} size="sm" />
              <span className="min-w-0 flex-1 text-sm">{item.title}</span>
              <span className="shrink-0 text-sm text-[var(--wh-foreground-muted)]">{item.when}</span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
