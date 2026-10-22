"use client";

import { BellRing, Check, Smartphone } from "lucide-react";
import { startTransition, useActionState, useEffect, useState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Pill } from "@wonderhome/core/ui/pill";

import type { ActionState } from "../(auth)/actions";
import { removePushSubscriptionAction, savePushSubscriptionAction, sendTestPushAction } from "../(auth)/notification-preferences-actions";

export type PushDeviceLabels = {
  title: string;
  lede: string;
  on: string;
  off: string;
  turnOn: string;
  turnOff: string;
  test: string;
  testTitle: string;
  testBody: string;
  testSent: string;
  working: string;
  notConfigured: string;
  unsupported: string;
  blocked: string;
  /** "On for {count} of your devices". */
  otherDevices: string;
};

type DeviceState = "checking" | "unsupported" | "blocked" | "on" | "off";

function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

/** "Chrome on Android", so a person can tell their devices apart. */
function deviceLabel(): string {
  const agent = navigator.userAgent;
  const browser = /Edg\//.test(agent) ? "Edge" : /SamsungBrowser/.test(agent) ? "Samsung Internet" : /Firefox\//.test(agent) ? "Firefox" : /Chrome\//.test(agent) ? "Chrome" : /Safari\//.test(agent) ? "Safari" : "Browser";
  const system = /Android/.test(agent) ? "Android" : /iPhone|iPad/.test(agent) ? "iPhone" : /Mac OS X/.test(agent) ? "Mac" : /Windows/.test(agent) ? "Windows" : /Linux/.test(agent) ? "Linux" : "";
  return system ? `${browser} on ${system}` : browser;
}

/**
 * This device's push: whether it can have push, whether it already does, and
 * turning it on or off — one flow for every place that offers it (the
 * settings card, and the nudge where reminders are read), so there is one way
 * to subscribe, never two.
 */
export function usePushDevice({ householdId, publicKey, myEndpoints, unsupportedText }: { householdId: string; publicKey: string | null; myEndpoints: string[]; unsupportedText: string }) {
  const [device, setDevice] = useState<DeviceState>("checking");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [saveState, save, saving] = useActionState<ActionState, FormData>(savePushSubscriptionAction, {});
  const [removeState, remove, removing] = useActionState<ActionState, FormData>(removePushSubscriptionAction, {});
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!publicKey) return;
    let cancelled = false;
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || typeof Notification === "undefined") {
        if (!cancelled) setDevice("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setDevice("blocked");
        return;
      }
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = registration ? await registration.pushManager.getSubscription() : null;
      if (cancelled) return;
      setEndpoint(subscription?.endpoint ?? null);
      setDevice(subscription && myEndpoints.includes(subscription.endpoint) ? "on" : "off");
    })().catch(() => {
      if (!cancelled) setDevice("unsupported");
    });
    return () => {
      cancelled = true;
    };
  }, [publicKey, myEndpoints]);

  const turnOn = async () => {
    setProblem(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setDevice(permission === "denied" ? "blocked" : "off");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey!) }));
      const json = subscription.toJSON();
      const data = new FormData();
      data.set("householdId", householdId);
      data.set("endpoint", subscription.endpoint);
      data.set("p256dh", json.keys?.p256dh ?? "");
      data.set("auth", json.keys?.auth ?? "");
      data.set("label", deviceLabel());
      setEndpoint(subscription.endpoint);
      startTransition(() => save(data));
      setDevice("on");
    } catch {
      setProblem(unsupportedText);
    }
  };

  const turnOff = async () => {
    setProblem(null);
    const registration = await navigator.serviceWorker.getRegistration("/").catch(() => undefined);
    const subscription = registration ? await registration.pushManager.getSubscription().catch(() => null) : null;
    const target = subscription?.endpoint ?? endpoint;
    await subscription?.unsubscribe().catch(() => false);
    if (target) {
      const data = new FormData();
      data.set("householdId", householdId);
      data.set("endpoint", target);
      startTransition(() => remove(data));
    }
    setDevice("off");
  };

  return { device, endpoint, turnOn, turnOff, saving, removing, error: saveState.error ?? removeState.error ?? problem };
}

/**
 * Push on this device (story 23-015). Turning it on asks the browser's
 * permission, subscribes with WonderHome's public key and keeps the
 * subscription for this member; turning it off forgets this device only.
 * Where push cannot work — not set up on this deployment, a browser without
 * it, permission blocked — the card says so in words and offers no button
 * that would do nothing (rule 10).
 */
export function PushDeviceCard({
  householdId,
  publicKey,
  myEndpoints,
  labels,
}: {
  householdId: string;
  /** Null when this deployment has no push key pair yet. */
  publicKey: string | null;
  /** The endpoints already kept for this member, to tell whether this device is one of them. */
  myEndpoints: string[];
  labels: PushDeviceLabels;
}) {
  const { device, endpoint, turnOn, turnOff, saving, removing, error: deviceError } = usePushDevice({ householdId, publicKey, myEndpoints, unsupportedText: labels.unsupported });
  const [testState, test, testing] = useActionState<ActionState, FormData>(sendTestPushAction, {});

  const sendTest = () => {
    const data = new FormData();
    data.set("householdId", householdId);
    data.set("title", labels.testTitle);
    data.set("body", labels.testBody);
    startTransition(() => test(data));
  };

  const others = myEndpoints.filter((kept) => kept !== endpoint).length;
  const status = !publicKey
    ? labels.notConfigured
    : device === "unsupported"
      ? labels.unsupported
      : device === "blocked"
        ? labels.blocked
        : device === "on"
          ? labels.on
          : device === "off"
            ? labels.off
            : labels.working;
  const error = deviceError ?? testState.error;

  return (
    <Card className="space-y-3">
      <div className="flex items-start gap-3">
        <IconTile icon={device === "on" ? BellRing : Smartphone} tone={device === "on" ? "handled" : "primary"} />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{labels.title}</h2>
          <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{labels.lede}</p>
          <p className="mt-1.5 text-sm font-medium" aria-live="polite">{status}</p>
          {others > 0 ? <p className="text-xs text-[var(--wh-foreground-subtle)]">{labels.otherDevices.replace("{count}", String(others))}</p> : null}
        </div>
      </div>
      {publicKey && (device === "on" || device === "off") ? (
        <div className="flex flex-wrap gap-2">
          {device === "off" ? (
            <Pill type="button" tone="primary" disabled={saving} onClick={() => void turnOn()}>
              <BellRing aria-hidden className="size-3.5" /> {labels.turnOn}
            </Pill>
          ) : (
            <>
              <Pill type="button" tone="soft" disabled={testing} onClick={sendTest}>
                {testState.notice === "sent" && !testing ? <Check aria-hidden className="size-3.5" /> : null} {testState.notice === "sent" && !testing ? labels.testSent : labels.test}
              </Pill>
              <Pill type="button" tone="quiet" disabled={removing} onClick={() => void turnOff()}>
                {labels.turnOff}
              </Pill>
            </>
          )}
        </div>
      ) : null}
      {error ? <Alert>{error}</Alert> : null}
    </Card>
  );
}
