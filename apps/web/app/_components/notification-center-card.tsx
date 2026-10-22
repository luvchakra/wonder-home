"use client";

import { Bell, CalendarClock, GraduationCap, HeartHandshake, Home, PawPrint, ShoppingBasket, Utensils, Wallet } from "lucide-react";
import { useState, useTransition } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Card } from "@wonderhome/core/ui/card";
import { ChoiceChips } from "@wonderhome/core/ui/choice-chips";
import { ExpandableRow } from "@wonderhome/core/ui/expandable-row";
import { IconTile, type IconTone } from "@wonderhome/core/ui/icon-tile";
import { Switch } from "@wonderhome/core/ui/switch";

import { saveReminderKindAction, setChannelRouteAction } from "../(auth)/notification-preferences-actions";

export type NotificationCenterLabels = {
  title: string;
  lede: string;
  /** "Get these" — the switch for a kind. */
  on: string;
  /** "{category} timing", the accessible name of a kind's timing. */
  timing: string;
  when: string;
  where: string;
  /** "In the app" — always there, never a choice. */
  inApp: string;
  /** "{kind} by {channel}", the accessible name of one tick box. */
  channelFor: string;
  off: string;
  householdOff: string;
  householdChannelsOff: string;
  failed: string;
};

export type NotificationCenterKind = {
  category: string;
  name: string;
  /** Only the kinds a person can time (bills, school…) carry these. */
  tunable?: { preset: string; enabled: boolean; options: readonly { value: string; label: string }[] };
  /** An Admin turned this kind off for the whole household. */
  householdOff?: boolean;
};

const ICON: Record<string, { icon: typeof Bell; tone: IconTone }> = {
  meals: { icon: Utensils, tone: "meals" },
  school: { icon: GraduationCap, tone: "school" },
  groceries: { icon: ShoppingBasket, tone: "home" },
  bills: { icon: Wallet, tone: "money" },
  home: { icon: Home, tone: "home" },
  pets: { icon: PawPrint, tone: "care" },
  appointments: { icon: CalendarClock, tone: "care" },
  family: { icon: HeartHandshake, tone: "people" },
  system: { icon: Bell, tone: "neutral" },
};

/**
 * The notification center (the owner, 2026-10-22: "where an adult can update
 * their notification choices"): one row per kind of notification, each
 * opening in place (rule 21) to everything that decides it — whether it comes
 * at all, when, and where beyond the app. The collapsed row says all three in
 * words. Every change saves at once, and only that kind is written.
 *
 * What the household's Admins decided is said here and never offered back: a
 * kind they turned off reads so with no switch, and a channel they turned off
 * is not listed. A person narrows the household's choices, never widens them.
 */
export function NotificationCenterCard({
  householdId,
  kinds,
  channels,
  keptOff,
  householdChannelsOff,
  labels,
}: {
  householdId: string;
  kinds: readonly NotificationCenterKind[];
  /** The channels beyond the app this person has on and that reach someone here. */
  channels: readonly { channel: string; name: string }[];
  /** "category:channel" for each kind already kept off a channel. */
  keptOff: readonly string[];
  /** The household turned at least one channel off for everyone. */
  householdChannelsOff: boolean;
  labels: NotificationCenterLabels;
}) {
  const [off, setOff] = useState<ReadonlySet<string>>(() => new Set(keptOff));
  const [tuning, setTuning] = useState(() => new Map(kinds.filter((kind) => kind.tunable).map((kind) => [kind.category, { preset: kind.tunable!.preset, enabled: kind.tunable!.enabled }])));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const route = (category: string, channel: string, allowed: boolean) => {
    const key = `${category}:${channel}`;
    const before = off;
    setOff((current) => {
      const next = new Set(current);
      if (allowed) next.delete(key);
      else next.add(key);
      return next;
    });
    setError(null);
    startTransition(async () => {
      const result = await setChannelRouteAction({ householdId, category, channel, allowed });
      if ("error" in result) {
        setOff(before);
        setError(result.error || labels.failed);
      }
    });
  };

  const tune = (category: string, change: Partial<{ preset: string; enabled: boolean }>) => {
    const before = tuning;
    const current = tuning.get(category);
    if (!current) return;
    const next = { ...current, ...change };
    setTuning(new Map(tuning).set(category, next));
    setError(null);
    startTransition(async () => {
      const result = await saveReminderKindAction({ householdId, category, ...next });
      if ("error" in result) {
        setTuning(before);
        setError(result.error || labels.failed);
      }
    });
  };

  return (
    <Card className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">{labels.title}</h2>
        <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{labels.lede}</p>
      </div>
      <ul className="divide-y divide-[var(--wh-border)]">
        {kinds.map((kind) => {
          const icon = ICON[kind.category] ?? ICON.system!;
          const tuned = tuning.get(kind.category);
          const enabled = !kind.householdOff && (tuned?.enabled ?? true);
          const timing = tuned ? kind.tunable!.options.find((option) => option.value === tuned.preset)?.label : null;
          const reaching = [labels.inApp, ...channels.filter((channel) => !off.has(`${kind.category}:${channel.channel}`)).map((channel) => channel.name)];
          const summary = kind.householdOff ? labels.householdOff : !enabled ? labels.off : [timing, reaching.join(", ")].filter(Boolean).join(" · ");
          return (
            <ExpandableRow
              key={kind.category}
              summary={
                <>
                  <IconTile icon={icon.icon} tone={icon.tone} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{kind.name}</span>
                    <span className="block text-sm text-[var(--wh-foreground-muted)]">{summary}</span>
                  </span>
                </>
              }
            >
              <div className="space-y-4 px-2 pb-3 sm:ps-14">
                {kind.householdOff ? (
                  <p className="text-sm text-[var(--wh-foreground-muted)]">{labels.householdOff}</p>
                ) : (
                  <>
                    {tuned ? (
                      <div className="space-y-3">
                        <label className="flex min-h-11 items-center gap-3 text-sm">
                          <Switch checked={tuned.enabled} disabled={pending} onCheckedChange={(next) => tune(kind.category, { enabled: next })} label={`${kind.name}: ${labels.on}`} />
                          <span>{labels.on}</span>
                        </label>
                        {tuned.enabled ? (
                          // Chips wrap, so a timing is never cut at 360px (rule 15); each pick saves at once.
                          <ChoiceChips
                            legend={labels.when}
                            name={`timing_${kind.category}`}
                            options={kind.tunable!.options}
                            value={tuned.preset}
                            onValueChange={(preset) => tune(kind.category, { preset })}
                            disabled={pending}
                          />
                        ) : null}
                      </div>
                    ) : null}
                    {enabled ? (
                      <div>
                        <p className="text-sm font-medium">{labels.where}</p>
                        <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
                          <span className="inline-flex min-h-11 items-center gap-2 text-sm text-[var(--wh-foreground-muted)]">
                            <input type="checkbox" checked disabled aria-label={labels.channelFor.replace("{kind}", kind.name).replace("{channel}", labels.inApp)} className="size-5 accent-[var(--wh-primary)]" />
                            {labels.inApp}
                          </span>
                          {channels.map((channel) => (
                            <label key={channel.channel} className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={!off.has(`${kind.category}:${channel.channel}`)}
                                disabled={pending}
                                onChange={(event) => route(kind.category, channel.channel, event.target.checked)}
                                aria-label={labels.channelFor.replace("{kind}", kind.name).replace("{channel}", channel.name)}
                                className="size-5 accent-[var(--wh-primary)]"
                              />
                              <span>{channel.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </ExpandableRow>
          );
        })}
      </ul>
      {householdChannelsOff ? <p className="text-xs text-[var(--wh-foreground-subtle)]">{labels.householdChannelsOff}</p> : null}
      {error ? <Alert tone="risk">{error}</Alert> : null}
    </Card>
  );
}
