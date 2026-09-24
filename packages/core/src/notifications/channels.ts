/**
 * Delivery channels (story 06-008).
 *
 * `decide.ts` decides whether, whom, when and what to say. This module is the
 * next step: given that decision, which of a household member's channels
 * actually get it, and what happened when they were tried.
 *
 * `CLAUDE.md` governs whether any of this reaches a real inbox or phone: no
 * channel is live until credentials, authentication, contract behavior and
 * integration tests exist. In-app needs none of that — the notification row
 * itself is the delivery — so it is the one channel marked `live`. Push,
 * email and WhatsApp are fixtures: they record what *would* have been sent
 * and to what address, deterministically, so a household's preference is
 * captured correctly and takes effect the moment a real provider is wired in
 * behind the same adapter shape, without a schema or UI change.
 */

import { inQuietHours, quietHoursFrom } from "./timing";
import { createWhatsAppAdapter, whatsappConfigFromEnv } from "./whatsapp";

export const DELIVERY_CHANNELS = ["in_app", "push", "email", "whatsapp"] as const;
export type DeliveryChannel = (typeof DELIVERY_CHANNELS)[number];

/** A member's stored preference for one channel. */
export type ChannelPreference = {
  channel: DeliveryChannel;
  enabled: boolean;
  quietFrom: number | null;
  quietUntil: number | null;
  /** Minutes past the hour quiet begins and ends ("10:30 PM"); 0 when unset. */
  quietFromMinute?: number;
  quietUntilMinute?: number;
  /** A phone number, subscription reference, or similar. Null for in_app/email. */
  target: string | null;
};

export type ChannelNotification = {
  title: string;
  body: string;
  priority: "low" | "normal" | "high" | "critical";
};

export type ChannelError = {
  code: "no_target" | "not_configured" | "unavailable";
  retryable: boolean;
  message: string;
};

export type ChannelSendResult =
  /** `providerMessageId` ties a later delivery report back to this send (story 17-006). */
  | { ok: true; providerMessageId?: string }
  | { ok: false; error: ChannelError };

export type ChannelAdapter = {
  readonly channel: DeliveryChannel;
  /** Whether this channel reaches a real inbox/phone, or only records what would be sent. */
  readonly live: boolean;
  send(notification: ChannelNotification, target: string | null): Promise<ChannelSendResult>;
};

/**
 * In-app is always live: the notification row already exists once this runs,
 * so "sending" it is definitionally done. Nothing to configure, nothing that
 * can fail here — a failure to persist the row is the caller's problem, not
 * this adapter's.
 */
export const inAppAdapter: ChannelAdapter = {
  channel: "in_app",
  live: true,
  async send() {
    return { ok: true };
  },
};

/**
 * `email` resolves its target from the member's own account (`auth.users`),
 * passed in by the caller rather than looked up here, so this stays a pure
 * fixture with no database access of its own.
 */
export const emailAdapter: ChannelAdapter = {
  channel: "email",
  live: false,
  async send(_notification, target) {
    if (!target) {
      return { ok: false, error: { code: "no_target", retryable: false, message: "No email address on file." } };
    }
    return { ok: false, error: { code: "not_configured", retryable: false, message: "No email provider is configured for this deployment yet." } };
  },
};

export const pushAdapter: ChannelAdapter = {
  channel: "push",
  live: false,
  async send(_notification, target) {
    if (!target) {
      return { ok: false, error: { code: "no_target", retryable: false, message: "No device is registered for push." } };
    }
    return { ok: false, error: { code: "not_configured", retryable: false, message: "No push provider is configured for this deployment yet." } };
  },
};

export const whatsappAdapter: ChannelAdapter = {
  channel: "whatsapp",
  live: false,
  async send(_notification, target) {
    if (!target) {
      return { ok: false, error: { code: "no_target", retryable: false, message: "No WhatsApp number is on file." } };
    }
    return { ok: false, error: { code: "not_configured", retryable: false, message: "No WhatsApp provider is configured for this deployment yet." } };
  },
};

export const CHANNEL_ADAPTERS: Record<DeliveryChannel, ChannelAdapter> = {
  in_app: inAppAdapter,
  push: pushAdapter,
  email: emailAdapter,
  whatsapp: whatsappAdapter,
};

/**
 * The adapters this deployment actually has: WhatsApp's Cloud API once it
 * is configured (story 17-006), the fixtures otherwise.
 */
export function channelAdaptersFromEnv(env: Record<string, string | undefined> = process.env): Record<DeliveryChannel, ChannelAdapter> {
  const whatsapp = whatsappConfigFromEnv(env);
  return whatsapp ? { ...CHANNEL_ADAPTERS, whatsapp: createWhatsAppAdapter(whatsapp.adapter) } : CHANNEL_ADAPTERS;
}

/**
 * Which of a member's channels should be attempted for this notification.
 *
 * Pure, so the policy — disabled channels are skipped, quiet hours defer
 * everything except a critical risk, a channel needing an address is skipped
 * without one — is testable without a database or a network call. `decide.ts`
 * already chose *when* to deliver for the notification as a whole
 * (`chooseTime`); this decides which channels still apply at that moment,
 * since a household's quiet hours can differ by channel (someone silences
 * push at night but still wants email waiting for them).
 */
export function selectChannels(
  preferences: readonly ChannelPreference[],
  notification: ChannelNotification,
  now: Date,
  timeZone: string,
): ChannelPreference[] {
  return preferences.filter((preference) => {
    if (!preference.enabled) return false;
    if (preference.channel !== "in_app" && preference.channel !== "email" && !preference.target) return false;

    if (notification.priority === "critical") return true;
    const quiet = quietHoursFrom(preference);
    return !quiet || !inQuietHours(now, quiet, timeZone);
  });
}

export type ChannelAttempt = {
  channel: DeliveryChannel;
  result: ChannelSendResult;
};

/**
 * Tries every selected channel and reports what happened on each, without
 * throwing: one channel's fixture-refusal is not a reason to skip the
 * others, and the caller (which writes a `notification_events` row per
 * attempt) needs every outcome, not just the first.
 */
export async function dispatchToChannels(
  preferences: readonly ChannelPreference[],
  notification: ChannelNotification,
  now: Date,
  timeZone: string,
  adapters: Record<DeliveryChannel, ChannelAdapter> = CHANNEL_ADAPTERS,
): Promise<ChannelAttempt[]> {
  const selected = selectChannels(preferences, notification, now, timeZone);
  return Promise.all(
    selected.map(async (preference) => ({
      channel: preference.channel,
      result: await adapters[preference.channel].send(notification, preference.target),
    })),
  );
}

/** Whether at least one channel actually reached the recipient. */
export function anyDelivered(attempts: readonly ChannelAttempt[]): boolean {
  return attempts.some((attempt) => attempt.result.ok);
}

const CHANNEL_LABELS: Record<DeliveryChannel, string> = {
  in_app: "In-app",
  push: "Push",
  email: "Email",
  whatsapp: "WhatsApp",
};

export function channelLabel(channel: DeliveryChannel): string {
  return CHANNEL_LABELS[channel];
}
