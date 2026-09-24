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

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      {pending ? "Saving…" : label}
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
}: {
  householdId: string;
  /** "HH:MM" on the household's clock, or null when there are none. */
  quiet: { from: string; until: string } | null;
  /** Quarter-hour choices, already worded in the person's time format. */
  times: readonly { value: string; label: string }[];
  timeZone: string;
  save: Save;
}) {
  const [state, action] = useActionState(save, {});
  return (
    <Card className="space-y-3">
      <div className="flex items-start gap-3">
        <IconTile icon={Moon} tone="primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Quiet hours</p>
          <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">
            Reminders wait until they end. Only something that genuinely cannot wait breaks them.
          </p>
        </div>
      </div>
      <form action={action} className="space-y-3">
        <input type="hidden" name="householdId" value={householdId} />
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" name="quietOn" defaultChecked={quiet !== null} className="size-5 rounded accent-[var(--wh-primary)]" />
          <span>Keep quiet hours</span>
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select label="From" name="quietFrom" defaultValue={quiet?.from ?? "22:00"}>
            {times.map((time) => (
              <option key={time.value} value={time.value}>
                {time.label}
              </option>
            ))}
          </Select>
          <Select label="Until" name="quietUntil" defaultValue={quiet?.until ?? "07:00"}>
            {times.map((time) => (
              <option key={time.value} value={time.value}>
                {time.label}
              </option>
            ))}
          </Select>
        </div>
        <p className="text-xs text-[var(--wh-foreground-subtle)]">On your household&rsquo;s clock ({timeZone}).</p>
        <Feedback state={state} />
        <Submit label="Save quiet hours" />
      </form>
    </Card>
  );
}

const CATEGORY: Record<TunableCategory, { icon: typeof Bell; tone: IconTone; label: string }> = {
  meals: { icon: Utensils, tone: "meals", label: "Meals & Recipes" },
  school: { icon: GraduationCap, tone: "school", label: "Kids & School" },
  groceries: { icon: ShoppingBasket, tone: "home", label: "Groceries" },
  bills: { icon: Wallet, tone: "money", label: "Bills & Finance" },
  pets: { icon: PawPrint, tone: "care", label: "Pets" },
  family: { icon: HeartHandshake, tone: "people", label: "Family" },
};

export function ReminderPreferencesCard({
  householdId,
  rows,
  save,
}: {
  householdId: string;
  rows: readonly {
    category: TunableCategory;
    preset: string;
    enabled: boolean;
    options: readonly { value: string; label: string }[];
  }[];
  save: Save;
}) {
  const [state, action] = useActionState(save, {});
  return (
    <Card className="space-y-3">
      <div>
        <p className="text-sm font-semibold">Reminder preferences</p>
        <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">
          How early each kind of reminder comes to you. Only yours — nobody else&rsquo;s change.
        </p>
      </div>
      <form action={action} className="space-y-1">
        <input type="hidden" name="householdId" value={householdId} />
        <ul className="divide-y divide-[var(--wh-border)]">
          {rows.map((row) => {
            const category = CATEGORY[row.category];
            return (
              <li key={row.category} className="flex flex-wrap items-center gap-3 py-3">
                <IconTile icon={category.icon} tone={category.tone} />
                <span className="min-w-0 flex-1 text-sm font-medium">{category.label}</span>
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name={`enabled_${row.category}`}
                    defaultChecked={row.enabled}
                    className="size-5 rounded accent-[var(--wh-primary)]"
                  />
                  <span>On</span>
                </label>
                <div className="w-full sm:w-72 [&_label]:sr-only">
                  <Select label={`${category.label} timing`} name={`preset_${row.category}`} defaultValue={row.preset}>
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
          <Submit label="Save reminder preferences" />
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
}: {
  householdId: string;
  dailyDigest: boolean;
  learnTiming: boolean;
  save: Save;
}) {
  const [state, action] = useActionState(save, {});
  return (
    <Card className="space-y-3">
      <div className="flex items-start gap-3">
        <IconTile icon={Sparkles} tone="primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Smarter reminders</p>
          <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">
            Both only change how your own reminders reach you. Nothing is decided for you.
          </p>
        </div>
      </div>
      <form action={action} className="space-y-3">
        <input type="hidden" name="householdId" value={householdId} />
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="dailyDigest" defaultChecked={dailyDigest} className="mt-0.5 size-5 shrink-0 rounded accent-[var(--wh-primary)]" />
          <span>
            <span className="font-medium">Today&rsquo;s summary</span>
            <span className="block text-[var(--wh-foreground-muted)]">
              A short list of what is waiting on you today, above your notifications.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="learnTiming" defaultChecked={learnTiming} className="mt-0.5 size-5 shrink-0 rounded accent-[var(--wh-primary)]" />
          <span>
            <span className="font-medium">Learn when I usually act</span>
            <span className="block text-[var(--wh-foreground-muted)]">
              Once you have dealt with a kind of reminder at much the same time at least five times, the first reminder of that
              kind moves to around then. A timing you chose above always wins, and quiet hours still apply.
            </span>
          </span>
        </label>
        <Feedback state={state} />
        <Submit label="Save" />
      </form>
    </Card>
  );
}
