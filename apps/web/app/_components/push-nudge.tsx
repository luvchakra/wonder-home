"use client";

import { BellRing, X } from "lucide-react";
import { useState, useSyncExternalStore } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Pill } from "@wonderhome/core/ui/pill";

import { usePushDevice } from "./push-device-card";

export type PushNudgeLabels = { title: string; lede: string; turnOn: string; notNow: string; done: string; unsupported: string };

/** Per device: "Not now" here is remembered on this phone only. */
const DISMISSED_KEY = "wh.pushNudge.dismissedAt";
/** "Not now" is asked again after this long, never sooner. */
const ASK_AGAIN_DAYS = 30;

/** Nothing to listen to: "Not now" on this page is kept in state, other tabs are read on their next load. */
const noSubscription = () => () => {};

function dismissedRecently(): boolean {
  try {
    const at = Number(window.localStorage.getItem(DISMISSED_KEY) ?? 0);
    return at > 0 && Date.now() - at < ASK_AGAIN_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

/**
 * Turn on push where reminders are read (the owner's review, 2026-10-22: one
 * device had push, so most reminders waited inside the app). Shown only when
 * it would work and is not on yet: the deployment has push, this browser can
 * have it, permission was never refused, and this device is not already
 * subscribed. Otherwise it renders nothing — never a button that does
 * nothing (rule 10). The same flow as Settings → Notifications
 * (`usePushDevice`). "Not now" waits 30 days on this device.
 */
export function PushNudge({ householdId, publicKey, myEndpoints, labels }: { householdId: string; publicKey: string | null; myEndpoints: string[]; labels: PushNudgeLabels }) {
  const { device, turnOn, saving, error } = usePushDevice({ householdId, publicKey, myEndpoints, unsupportedText: labels.unsupported });
  // Read once on this device; hidden on the server, so nothing flashes before the browser has looked.
  const dismissed = useSyncExternalStore(noSubscription, dismissedRecently, () => true);
  const [dismissedNow, setDismissedNow] = useState(false);
  const [justOn, setJustOn] = useState(false);

  if (!publicKey || dismissed || dismissedNow) return null;
  if (justOn && device === "on") {
    return (
      <p className="text-sm text-[var(--wh-handled)]" role="status">
        {labels.done}
      </p>
    );
  }
  if (device !== "off") return null;

  const notNow = () => {
    try {
      window.localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      // Without storage it is simply asked again next time.
    }
    setDismissedNow(true);
  };

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-start gap-3">
        <IconTile icon={BellRing} tone="primary" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{labels.title}</h2>
          <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{labels.lede}</p>
        </div>
        <button
          type="button"
          onClick={notNow}
          aria-label={labels.notNow}
          title={labels.notNow}
          className="grid size-9 shrink-0 place-items-center rounded-full text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)]"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
      <Pill
        type="button"
        tone="primary"
        disabled={saving}
        onClick={() => {
          setJustOn(true);
          void turnOn();
        }}
      >
        <BellRing aria-hidden className="size-3.5" /> {labels.turnOn}
      </Pill>
      {error ? <Alert>{error}</Alert> : null}
    </Card>
  );
}
