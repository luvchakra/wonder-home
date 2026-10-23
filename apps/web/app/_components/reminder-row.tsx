"use client";

import { Bell, Clock, GraduationCap, HeartHandshake, HeartPulse, PawPrint, ShoppingBasket, Utensils, Wallet, Wrench, X } from "lucide-react";
import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";

import { cn } from "@wonderhome/core/lib/cn";
import type { NotificationCategory } from "@wonderhome/core/notifications/policies";
import { Alert } from "@wonderhome/core/ui/alert";
import { IconTile, type IconTone } from "@wonderhome/core/ui/icon-tile";
import { Badge } from "@wonderhome/core/ui/pill";
import { Button, ButtonLink } from "@wonderhome/core/ui/button";

import { completeReminderSourceAction, dismissReminderAction, snoozeReminderAction } from "../(auth)/notification-actions";
import type { ActionState } from "../(auth)/actions";
import { PRESET_KEYS, type SnoozePreset } from "../_lib/snooze-presets";

/**
 * One reminder in the notification center (story 23-005), as an action card
 * (the owner, 2026-10-23: "easy to understand, actionable options upfront").
 *
 * Rule 4's row — a tinted tile for its category, the name, one line of
 * reason — and, in view without opening anything, the live facts from the
 * record it is about (an amount and a due date, an appointment's time and
 * what to prepare) and every action: the one thing to do about the record
 * itself, a way to open it, "Remind me later" with one-tap times, and "Not
 * needed". Priority is shown only when it is urgent, in words. The category's
 * icon is resolved here, inside the client component, because a component
 * cannot cross the server boundary.
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
};

/** The one-tap times under "Remind me later"; a picked day and time sits after them. */
const QUICK_PRESETS = PRESET_KEYS.filter((key) => key !== "custom");

export function ReminderRow({
  view,
  householdId,
  snoozeDays,
  labels,
  card = false,
}: {
  view: ReminderView;
  /** A card of its own (Needs you now), rather than a row in a shared card. */
  card?: boolean;
  householdId: string;
  labels: ReminderRowLabels;
  /** The next week's days, worded ("Today", "Tomorrow", "Sat 27 Sep"), for a picked time. */
  snoozeDays: readonly { value: string; label: string }[];
}) {
  const category = CATEGORY[view.category];
  return (
    <li
      className={cn(
        "flex items-start gap-3 px-3 py-4 sm:px-4",
        card && "rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)] shadow-[var(--wh-shadow-card)]",
      )}
    >
      <span className="sr-only">{view.categoryLabel}: </span>
      <IconTile icon={category.icon} tone={category.tone} />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold break-words">{view.title}</span>
            {view.open && view.priority === "high" ? <Badge tone="attention">{labels.urgent}</Badge> : null}
            {!view.open && view.closedAs ? <Badge tone="handled">{view.closedAs}</Badge> : null}
            {view.unread ? <span className="size-2 shrink-0 rounded-full bg-[var(--wh-primary)]" aria-label={labels.unread} /> : null}
          </p>
          <span className="shrink-0 pt-0.5 text-xs whitespace-nowrap text-[var(--wh-foreground-subtle)]">{view.when}</span>
        </div>
        <p className="text-sm text-[var(--wh-foreground-muted)]">{view.body}</p>

        {view.details.length > 0 ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] px-3 py-2 text-sm">
            {view.details.map((detail) => (
              <div key={detail.label} className="contents">
                <dt className="text-[var(--wh-foreground-muted)]">{detail.label}</dt>
                <dd className="font-medium break-words">{detail.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {view.reason ? <p className="text-xs text-[var(--wh-foreground-subtle)]">{view.reason}</p> : null}

        {view.open ? (
          <div className="space-y-2 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              {view.complete ? <CompleteForm id={view.id} householdId={householdId} label={view.complete.label} savingLabel={labels.saving} /> : null}
              {view.link ? (
                <ButtonLink href={view.link.href} variant={view.complete ? "secondary" : "primary"} className="rounded-[var(--wh-radius-pill)]">
                  {view.link.label}
                </ButtonLink>
              ) : null}
            </div>
            {/* Putting it off and saying it is not needed share one quiet line under the actions. */}
            <div className="flex items-start justify-between gap-2">
              <SnoozeForm id={view.id} householdId={householdId} days={snoozeDays} labels={labels.snooze} />
              <DismissForm id={view.id} householdId={householdId} label={labels.dismiss} />
            </div>
          </div>
        ) : null}
      </div>
    </li>
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
  id,
  householdId,
  days,
  labels,
}: {
  id: string;
  householdId: string;
  days: readonly { value: string; label: string }[];
  labels: ReminderRowLabels["snooze"];
}) {
  const [state, action] = useActionState(snoozeReminderAction, {});
  const fieldId = useId();
  return (
    <details className="group min-w-0 flex-1">
      <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1.5 rounded-[var(--wh-radius-pill)] px-2 text-sm font-semibold whitespace-nowrap text-[var(--wh-primary)] hover:bg-[var(--wh-primary-soft)] [&::-webkit-details-marker]:hidden">
        <Clock aria-hidden className="size-4" />
        {labels.open}
      </summary>
      <form action={action} className="mt-2 space-y-3 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] p-3">
        <input type="hidden" name="notificationId" value={id} />
        <input type="hidden" name="householdId" value={householdId} />
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

function DismissForm({ id, householdId, label }: { id: string; householdId: string; label: string }) {
  const [state, action] = useActionState(dismissReminderAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="notificationId" value={id} />
      <input type="hidden" name="householdId" value={householdId} />
      <DismissButton label={label} />
      <Feedback state={state} />
    </form>
  );
}

function DismissButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="quiet" disabled={pending} className="min-h-10 shrink-0 rounded-[var(--wh-radius-pill)] px-2 text-[var(--wh-foreground-muted)]">
      <X aria-hidden className="size-4" />
      {label}
    </Button>
  );
}
