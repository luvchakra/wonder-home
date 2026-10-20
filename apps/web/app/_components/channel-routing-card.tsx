"use client";

import { Route } from "lucide-react";
import { useState, useTransition } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";

import { setChannelRouteAction } from "../(auth)/notification-preferences-actions";

export type ChannelRoutingLabels = {
  title: string;
  lede: string;
  /** Shown when no channel beyond the app is on. */
  none: string;
  /** "{kind} by {channel}", the accessible name of one tick box. */
  channelFor: string;
  failed: string;
};

/**
 * What goes where (story 27-002): each kind of reminder against the channels
 * the person has switched on, as tick boxes. Everything starts ticked; an
 * unticked box keeps that kind off that channel. The app always has it all,
 * and a critical alert still goes everywhere the person allowed anything.
 *
 * A name is never cut (design rule 11): the kind sits on its own line and the
 * channel boxes wrap beneath it, so it works at 360px with no sideways scroll.
 */
export function ChannelRoutingCard({
  householdId,
  kinds,
  channels,
  keptOff,
  labels,
}: {
  householdId: string;
  kinds: readonly { category: string; name: string }[];
  channels: readonly { channel: string; name: string }[];
  /** "category:channel" for each kind already kept off a channel. */
  keptOff: readonly string[];
  labels: ChannelRoutingLabels;
}) {
  const [off, setOff] = useState<ReadonlySet<string>>(() => new Set(keptOff));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const change = (category: string, channel: string, allowed: boolean) => {
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

  return (
    <Card className="space-y-3">
      <div className="flex items-start gap-3">
        <IconTile icon={Route} tone="primary" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{labels.title}</h2>
          <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{channels.length > 0 ? labels.lede : labels.none}</p>
        </div>
      </div>
      {channels.length > 0 ? (
        <ul className="divide-y divide-[var(--wh-border)]">
          {kinds.map((kind) => (
            <li key={kind.category} className="py-3">
              <p className="text-sm font-medium">{kind.name}</p>
              <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1">
                {channels.map((channel) => {
                  const checked = !off.has(`${kind.category}:${channel.channel}`);
                  return (
                    <label key={channel.channel} className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={pending}
                        onChange={(event) => change(kind.category, channel.channel, event.target.checked)}
                        aria-label={labels.channelFor.replace("{kind}", kind.name).replace("{channel}", channel.name)}
                        className="size-5 accent-[var(--wh-primary)]"
                      />
                      <span>{channel.name}</span>
                    </label>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <Alert tone="risk">{error}</Alert> : null}
    </Card>
  );
}
