"use client";

import { Bell, GraduationCap, HeartHandshake, Moon, PawPrint, ShoppingBasket, Sparkles, Utensils, Wallet } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { TunableCategory } from "@wonderhome/core/notifications/policies";
import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile, type IconTone } from "@wonderhome/core/ui/icon-tile";
import { Select } from "@wonderhome/core/ui/select";

import type { ActionState } from "../(auth)/actions";

/**
 * Notification settings (story 23-007): quiet hours to the minute, and how
 * early each kind of reminder comes. Every answer is picked from a list
 * (rule 20) — the times are the household's own clock in quarter hours, the
 * timings are the policy's own presets — so nothing typed can mean
 * something the engine does not.
 */

type Save = (state: ActionState, formData: FormData) => Promise<ActionState>;

/** These cards' words in the viewer's language, built on the server (story 22-004). */
export type ReminderSettingsLabels = {
  saving: string;
  save: string;
  quiet: { title: string; body: string; keep: string; from: string; until: string; clock: string; save: string };
  prefs: {
    title: string;
    body: string;
    on: string;
    /** "{category} timing" — `{category}` is filled in here with the category's name. */
    timing: string;
    save: string;
    categories: Record<TunableCategory, string>;
  };
  smart: { title: string; body: string; digest: string; digestBody: string; learn: string; learnBody: string };
};

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

function Feedback({ state }: { state: ActionState }) {
  if (state.error) return <Alert>{state.error}</Alert>;
  if (state.notice) return <Alert tone="info">{state.notice}</Alert>;
  return null;
}

export function QuietHoursCard({
  householdId,
  quiet,
  times,
  timeZone,
  save,
  labels,
}: {
  householdId: string;
  /** "HH:MM" on the household's clock, or null when there are none. */
  quiet: { from: string; until: string } | null;
  /** Quarter-hour choices, already worded in the person's time format. */
  times: readonly { value: string; label: string }[];
  timeZone: string;
  save: Save;
  labels: ReminderSettingsLabels;
}) {
  const [state, action] = useActionState(save, {});
  return (
    <Card className="space-y-3">
      <div className="flex items-start gap-3">
        <IconTile icon={Moon} tone="primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{labels.quiet.title}</p>
          <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{labels.quiet.body}</p>
        </div>
      </div>
      <form action={action} className="space-y-3">
        <input type="hidden" name="householdId" value={householdId} />
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" name="quietOn" defaultChecked={quiet !== null} className="size-5 rounded accent-[var(--wh-primary)]" />
          <span>{labels.quiet.keep}</span>
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select label={labels.quiet.from} name="quietFrom" defaultValue={quiet?.from ?? "22:00"}>
            {times.map((time) => (
              <option key={time.value} value={time.value}>
                {time.label}
              </option>
            ))}
          </Select>
          <Select label={labels.quiet.until} name="quietUntil" defaultValue={quiet?.until ?? "07:00"}>
            {times.map((time) => (
              <option key={time.value} value={time.value}>
                {time.label}
              </option>
            ))}
          </Select>
        </div>
        <p className="text-xs text-[var(--wh-foreground-subtle)]">{labels.quiet.clock.replace("{timeZone}", timeZone)}</p>
        <Feedback state={state} />
        <Submit label={labels.quiet.save} pendingLabel={labels.saving} />
      </form>
    </Card>
  );
}

const CATEGORY: Record<TunableCategory, { icon: typeof Bell; tone: IconTone }> = {
  meals: { icon: Utensils, tone: "meals" },
  school: { icon: GraduationCap, tone: "school" },
  groceries: { icon: ShoppingBasket, tone: "home" },
  bills: { icon: Wallet, tone: "money" },
  pets: { icon: PawPrint, tone: "care" },
  family: { icon: HeartHandshake, tone: "people" },
};

export function ReminderPreferencesCard({
  householdId,
  rows,
  save,
  labels,
}: {
  householdId: string;
  rows: readonly {
    category: TunableCategory;
    preset: string;
    enabled: boolean;
    options: readonly { value: string; label: string }[];
  }[];
  save: Save;
  labels: ReminderSettingsLabels;
}) {
  const [state, action] = useActionState(save, {});
  return (
    <Card className="space-y-3">
      <div>
        <p className="text-sm font-semibold">{labels.prefs.title}</p>
        <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{labels.prefs.body}</p>
      </div>
      <form action={action} className="space-y-1">
        <input type="hidden" name="householdId" value={householdId} />
        <ul className="divide-y divide-[var(--wh-border)]">
          {rows.map((row) => {
            const category = CATEGORY[row.category];
            const name = labels.prefs.categories[row.category];
            return (
              <li key={row.category} className="flex flex-wrap items-center gap-3 py-3">
                <IconTile icon={category.icon} tone={category.tone} />
                <span className="min-w-0 flex-1 text-sm font-medium">{name}</span>
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name={`enabled_${row.category}`}
                    defaultChecked={row.enabled}
                    className="size-5 rounded accent-[var(--wh-primary)]"
                  />
                  <span>{labels.prefs.on}</span>
                </label>
                <div className="w-full sm:w-72 [&_label]:sr-only">
                  <Select label={labels.prefs.timing.replace("{category}", name)} name={`preset_${row.category}`} defaultValue={row.preset}>
                    {row.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="space-y-2 pt-2">
          <Feedback state={state} />
          <Submit label={labels.prefs.save} pendingLabel={labels.saving} />
        </div>
      </form>
    </Card>
  );
}

/**
 * Two choices about how clever reminders get (stories 23-011, 23-012), each
 * the person's own: the day's summary above the notification list (on unless
 * turned off), and moving a first reminder to when they usually deal with
 * that kind of thing (off unless turned on). Both say plainly what they do,
 * and what they never do.
 */
export function SmartRemindersCard({
  householdId,
  dailyDigest,
  learnTiming,
  save,
  labels,
}: {
  householdId: string;
  dailyDigest: boolean;
  learnTiming: boolean;
  save: Save;
  labels: ReminderSettingsLabels;
}) {
  const [state, action] = useActionState(save, {});
  return (
    <Card className="space-y-3">
      <div className="flex items-start gap-3">
        <IconTile icon={Sparkles} tone="primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{labels.smart.title}</p>
          <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{labels.smart.body}</p>
        </div>
      </div>
      <form action={action} className="space-y-3">
        <input type="hidden" name="householdId" value={householdId} />
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="dailyDigest" defaultChecked={dailyDigest} className="mt-0.5 size-5 shrink-0 rounded accent-[var(--wh-primary)]" />
          <span>
            <span className="font-medium">{labels.smart.digest}</span>
            <span className="block text-[var(--wh-foreground-muted)]">{labels.smart.digestBody}</span>
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="learnTiming" defaultChecked={learnTiming} className="mt-0.5 size-5 shrink-0 rounded accent-[var(--wh-primary)]" />
          <span>
            <span className="font-medium">{labels.smart.learn}</span>
            <span className="block text-[var(--wh-foreground-muted)]">{labels.smart.learnBody}</span>
          </span>
        </label>
        <Feedback state={state} />
        <Submit label={labels.save} pendingLabel={labels.saving} />
      </form>
    </Card>
  );
}
