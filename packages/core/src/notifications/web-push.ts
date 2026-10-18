import webpush from "web-push";

import type { ChannelAdapter, ChannelNotification, ChannelSendResult } from "./channels";

/**
 * Push notifications through the browser's own push service (story 23-015):
 * the standard Web Push protocol with VAPID, the same on Android, desktop
 * and an installed iPhone app. No third-party account sits in between.
 *
 * Live only when a deployment sets its key pair —
 * `WONDERHOME_VAPID_PUBLIC_KEY`, `WONDERHOME_VAPID_PRIVATE_KEY` and a contact
 * `WONDERHOME_VAPID_SUBJECT` (a `mailto:` or `https:` address the push
 * services can reach). Until then the push channel stays the fixture that
 * sends nothing, and Settings says push isn't switched on yet.
 */
export type WebPushConfig = { publicKey: string; privateKey: string; subject: string };

export function webPushConfigFromEnv(env: Record<string, string | undefined> = process.env): WebPushConfig | null {
  const publicKey = env.WONDERHOME_VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.WONDERHOME_VAPID_PRIVATE_KEY?.trim();
  const subject = env.WONDERHOME_VAPID_SUBJECT?.trim() || "mailto:support@wonderapps.biz";
  if (!publicKey || !privateKey || !/^(mailto:|https:\/\/)/.test(subject)) return null;
  return { publicKey, privateKey, subject };
}

/** The public half, for a browser to subscribe with; null when push is off. */
export function webPushPublicKey(env: Record<string, string | undefined> = process.env): string | null {
  return webPushConfigFromEnv(env)?.publicKey ?? null;
}

/** A device's subscription as the push channel's target: what `PushSubscription.toJSON()` gives. */
export type PushTarget = { endpoint: string; keys: { p256dh: string; auth: string } };

export function parsePushTarget(target: string | null): PushTarget | null {
  if (!target) return null;
  try {
    const value = JSON.parse(target) as Partial<PushTarget>;
    if (typeof value.endpoint !== "string" || !value.endpoint.startsWith("https://")) return null;
    if (typeof value.keys?.p256dh !== "string" || typeof value.keys?.auth !== "string") return null;
    return { endpoint: value.endpoint, keys: { p256dh: value.keys.p256dh, auth: value.keys.auth } };
  } catch {
    return null;
  }
}

/**
 * What the service worker receives: the words, where tapping it goes, and a
 * tag so a newer word about the same thing replaces the older one on the
 * phone instead of stacking (threads, not repeats).
 */
export function pushPayload(notification: ChannelNotification): string {
  return JSON.stringify({
    title: notification.title.slice(0, 120),
    body: notification.body.slice(0, 300),
    url: notification.url ?? "/notifications",
    tag: notification.tag ?? undefined,
    critical: notification.priority === "critical",
  });
}

type Sender = (target: PushTarget, payload: string, options: { TTL: number; urgency: "very-low" | "low" | "normal" | "high" }) => Promise<{ statusCode: number }>;

export function createWebPushAdapter(config: WebPushConfig, send?: Sender): ChannelAdapter {
  const sender: Sender =
    send ??
    ((target, payload, options) =>
      webpush.sendNotification(target, payload, { ...options, vapidDetails: { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey } }));
  return {
    channel: "push",
    live: true,
    async send(notification, target): Promise<ChannelSendResult> {
      const subscription = parsePushTarget(target);
      if (!subscription) return { ok: false, error: { code: "no_target", retryable: false, message: "No device is registered for push." } };
      const urgency = notification.priority === "critical" || notification.priority === "high" ? "high" : notification.priority === "low" ? "low" : "normal";
      try {
        // A reminder that sits undelivered for a day is no longer timely; critical waits up to a day, the rest a few hours.
        const response = await sender(subscription, pushPayload(notification), { TTL: notification.priority === "critical" ? 86_400 : 4 * 3600, urgency });
        return response.statusCode >= 200 && response.statusCode < 300
          ? { ok: true }
          : { ok: false, error: { code: "unavailable", retryable: true, message: `Push service answered ${response.statusCode}.` } };
      } catch (thrown) {
        const status = (thrown as { statusCode?: number }).statusCode;
        // 404/410: the device unsubscribed or the browser data was cleared — this subscription is gone for good.
        if (status === 404 || status === 410) return { ok: false, error: { code: "gone", retryable: false, message: "This device no longer accepts push." } };
        return { ok: false, error: { code: "unavailable", retryable: true, message: "The push service could not be reached." } };
      }
    },
  };
}
