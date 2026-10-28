"use client";

import { Bell, GraduationCap, HeartHandshake, Moon, PawPrint, Send, ShoppingBasket, Users, Utensils, Wallet } from "lucide-react";
import { useState, useTransition } from "react";

import type { TunableCategory } from "@wonderhome/core/notifications/policies";
import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Card } from "@wonderhome/core/ui/card";
import { ChoiceChips } from "@wonderhome/core/ui/choice-chips";
import { IconTile, type IconTone } from "@wonderhome/core/ui/icon-tile";
import { Select } from "@wonderhome/core/ui/select";
import { Switch } from "@wonderhome/core/ui/switch";

import { saveHouseholdNotificationsAction } from "./household-actions";

export type HouseholdNotificationsLabels = {
  kinds: { title: string; lede: string; on: string; timing: string };
  channels: { title: string; lede: string; none: string };
  unanswered: { title: string; lede: string; channelStep: string; channelStepBody: string; backupStep: string; backupStepBody: string };
  quiet: { title: string; lede: string; on: string; from: string; until: string; clock: string };
  save: string;
  saving: string;
  saved: string;
  failed: string;
};

type Kind = { category: TunableCategory; name: string; options: readonly { value: string; label: string }[] };

const ICON: Record<TunableCategory, { icon: typeof Bell; tone: IconTone }> = {
  meals: { icon: Utensils, tone: "meals" },
  school: { icon: GraduationCap, tone: "school" },
  groceries: { icon: ShoppingBasket, tone: "home" },
  bills: { icon: Wallet, tone: "money" },
  pets: { icon: PawPrint, tone: "care" },
  family: { icon: HeartHandshake, tone: "people" },
};

/**
 * How the whole household is notified, for its Admins (the owner,
 * 2026-10-22). Every answer is picked, never typed (rule 20): a switch per
 * kind, its starting timing from the policy's own presets, the channels this
 * deployment can actually use (rule 10: nothing that cannot send is offered),
 * the two steps an unanswered reminder may take, and the household's quiet
 * hours by the hour. One save for the page, since these are read together.
 */
export function HouseholdNotificationsForm({
  householdId,
  kinds,
  channels,
  hours,
  initial,
  timeZone,
  labels,
}: {
  householdId: string;
  kinds: readonly Kind[];
  channels: readonly { channel: "push" | "email" | "whatsapp"; name: string }[];
  hours: readonly { value: number; label: string }[];
  initial: {
    kindsOff: readonly TunableCategory[];
    defaults: Record<TunableCategory, string>;
    channelsOff: readonly string[];
    channelStep: boolean;
    backupStep: boolean;
    quiet: { fromHour: number; untilHour: number } | null;
  };
  timeZone: string;
  labels: HouseholdNotificationsLabels;
}) {
  const [kindsOff, setKindsOff] = useState<ReadonlySet<TunableCategory>>(() => new Set(initial.kindsOff));
  const [defaults, setDefaults] = useState(initial.defaults);
  const [channelsOff, setChannelsOff] = useState<ReadonlySet<string>>(() => new Set(initial.channelsOff));
  const [channelStep, setChannelStep] = useState(initial.channelStep);
  const [backupStep, setBackupStep] = useState(initial.backupStep);
  const [quietOn, setQuietOn] = useState(initial.quiet !== null);
  const [quiet, setQuiet] = useState(initial.quiet ?? { fromHour: 22, untilHour: 7 });
  const [result, setResult] = useState<{ tone: "info" | "risk"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = <T,>(set: ReadonlySet<T>, value: T, on: boolean) => {
    const next = new Set(set);
    if (on) next.delete(value);
    else next.add(value);
    return next;
  };

  const save = () => {
    setResult(null);
    startTransition(async () => {
      const outcome = await saveHouseholdNotificationsAction({
        householdId,
        kindsOff: [...kindsOff],
        defaults,
        channelsOff: [...channelsOff] as ("push" | "email" | "whatsapp")[],
        channelStep,
        backupStep,
        quiet: quietOn ? quiet : null,
      });
      setResult("error" in outcome ? { tone: "risk", text: outcome.error || labels.failed } : { tone: "info", text: labels.saved });
    });
  };

  return (
    <div className="space-y-5">
      <Card className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">{labels.kinds.title}</h2>
          <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{labels.kinds.lede}</p>
        </div>
        <ul className="divide-y divide-[var(--wh-border)]">
          {kinds.map((kind) => {
            const on = !kindsOff.has(kind.category);
            return (
              <li key={kind.category} className="space-y-2 py-3">
                {/* The name gets the row's room and wraps before it is ever cut (rules 11, 15); the timing sits on its own line. */}
                <div className="flex items-center gap-3">
                  <IconTile icon={ICON[kind.category].icon} tone={ICON[kind.category].tone} />
                  <span className="min-w-0 flex-1 text-sm font-medium">{kind.name}</span>
                  <label className="flex min-h-11 shrink-0 items-center gap-2 text-sm">
                    <Switch checked={on} onCheckedChange={(next) => setKindsOff((current) => toggle(current, kind.category, next))} label={`${kind.name}: ${labels.kinds.on}`} />
                    <span>{labels.kinds.on}</span>
                  </label>
                </div>
                {on ? (
                  // Chips wrap, so a timing is never cut at 360px (rule 15).
                  <ChoiceChips
                    className="sm:ps-14"
                    legend={labels.kinds.timing.replace("{category}", kind.name)}
                    legendHidden
                    name={`default_${kind.category}`}
                    options={kind.options}
                    value={defaults[kind.category]}
                    onValueChange={(preset) => setDefaults((current) => ({ ...current, [kind.category]: preset }))}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="space-y-3">
        <div className="flex items-start gap-3">
          <IconTile icon={Send} tone="primary" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">{labels.channels.title}</h2>
            <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{channels.length > 0 ? labels.channels.lede : labels.channels.none}</p>
          </div>
        </div>
        {channels.length > 0 ? (
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            {channels.map((channel) => (
              <label key={channel.channel} className="inline-flex min-h-11 items-center gap-2 text-sm">
                <Switch
                  checked={!channelsOff.has(channel.channel)}
                  onCheckedChange={(next) => setChannelsOff((current) => toggle(current, channel.channel, next))}
                  label={channel.name}
                />
                <span>{channel.name}</span>
              </label>
            ))}
          </div>
        ) : null}
      </Card>

      <Card className="space-y-3">
        <div className="flex items-start gap-3">
          <IconTile icon={Users} tone="attention" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">{labels.unanswered.title}</h2>
            <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{labels.unanswered.lede}</p>
          </div>
        </div>
        {[
          { checked: channelStep, set: setChannelStep, title: labels.unanswered.channelStep, body: labels.unanswered.channelStepBody },
          { checked: backupStep, set: setBackupStep, title: labels.unanswered.backupStep, body: labels.unanswered.backupStepBody },
        ].map((step) => (
          <div key={step.title} className="flex items-start gap-3 text-sm">
            <Switch checked={step.checked} onCheckedChange={step.set} label={step.title} className="mt-0.5" />
            <span>
              <span className="font-medium">{step.title}</span>
              <span className="block text-[var(--wh-foreground-muted)]">{step.body}</span>
            </span>
          </div>
        ))}
      </Card>

      <Card className="space-y-3">
        <div className="flex items-start gap-3">
          <IconTile icon={Moon} tone="primary" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">{labels.quiet.title}</h2>
            <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{labels.quiet.lede}</p>
          </div>
        </div>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <Switch checked={quietOn} onCheckedChange={setQuietOn} label={labels.quiet.on} />
          <span>{labels.quiet.on}</span>
        </label>
        {quietOn ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select label={labels.quiet.from} name="householdQuietFrom" value={String(quiet.fromHour)} onChange={(event) => setQuiet((current) => ({ ...current, fromHour: Number(event.target.value) }))}>
              {hours.map((hour) => (
                <option key={hour.value} value={hour.value}>
                  {hour.label}
                </option>
              ))}
            </Select>
            <Select label={labels.quiet.until} name="householdQuietUntil" value={String(quiet.untilHour)} onChange={(event) => setQuiet((current) => ({ ...current, untilHour: Number(event.target.value) }))}>
              {hours.map((hour) => (
                <option key={hour.value} value={hour.value}>
                  {hour.label}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        <p className="text-xs text-[var(--wh-foreground-subtle)]">{labels.quiet.clock.replace("{timeZone}", timeZone)}</p>
      </Card>

      {result ? <Alert tone={result.tone}>{result.text}</Alert> : null}
      <Button type="button" onClick={save} disabled={pending}>
        {pending ? labels.saving : labels.save}
      </Button>
    </div>
  );
}
