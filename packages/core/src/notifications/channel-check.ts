import type { SupabaseClient } from "@supabase/supabase-js";

import { log } from "../observability/logger";
import { inQuietHours, quietHoursFrom } from "./timing";
import {
  channelAdaptersFromEnv,
  type ChannelAdapter,
  type ChannelNotification,
  type ChannelPreference,
  type ChannelSendResult,
  type DeliveryChannel,
} from "./channels";
import { emailAddressFor, recordPushOutcomes, sentInLastDay } from "./deliver";
import { EMAIL_DAILY_LIMIT, PUSH_DAILY_LIMIT } from "./push-gate";
import { ROUTABLE_CHANNELS, type RoutableChannel } from "./routing";
import { isWhatsAppNumber } from "./whatsapp";

/**
 * Whether a channel will reach this person, and why not (story 27-003).
 *
 * A reminder that never arrived is the most confusing thing a notification
 * system does, so each channel is checked against the same things
 * `deliverNotification` checks, and every reason is a closed word the screen
 * says in the person's language. The reasons are facts about this person's
 * set-up, never a provider's own text.
 *
 * - `not_set_up` — this deployment cannot send on the channel at all.
 * - `off` — the person has not switched it on.
 * - `no_device` — push is on but no phone or browser is registered.
 * - `no_address` — email has no confirmed account address, WhatsApp no number.
 * - `quiet_hours` — right now is inside this channel's quiet window (a
 *   critical alert still goes).
 * - `daily_limit` — the ceiling for ordinary reminders today is used up.
 */
export const CHANNEL_BLOCKS = ["not_set_up", "off", "no_device", "no_address", "quiet_hours", "daily_limit"] as const;
export type ChannelBlock = (typeof CHANNEL_BLOCKS)[number];

/** What is known about one channel for one person. */
export type ChannelFacts = {
  channel: RoutableChannel;
  live: boolean;
  enabled: boolean;
  /** Push: devices registered. Email/WhatsApp: whether an address exists. */
  hasTarget: boolean;
  inQuiet: boolean;
  sentToday: number;
};

const NORMAL_CEILING: Record<RoutableChannel, number | null> = {
  push: PUSH_DAILY_LIMIT.normal,
  email: EMAIL_DAILY_LIMIT.normal,
  whatsapp: null,
};

/** Everything that would keep an ordinary reminder from reaching this person on the channel, most basic first. Empty means it will. */
export function blocksFor(facts: ChannelFacts): ChannelBlock[] {
  if (!facts.live) return ["not_set_up"];
  const blocks: ChannelBlock[] = [];
  if (!facts.enabled) blocks.push("off");
  if (!facts.hasTarget) blocks.push(facts.channel === "push" ? "no_device" : "no_address");
  if (facts.inQuiet) blocks.push("quiet_hours");
  const ceiling = NORMAL_CEILING[facts.channel];
  if (ceiling !== null && facts.sentToday >= ceiling) blocks.push("daily_limit");
  return blocks;
}

export type ChannelCheck = {
  channel: RoutableChannel;
  blocks: ChannelBlock[];
  /** The code of the last attempt that failed in the past week, when no later one succeeded. */
  lastFailure: string | null;
};

/** What a person sees under each channel: whether it will reach them, and the plain reasons it might not. */
export async function loadChannelChecks(
  admin: SupabaseClient,
  input: { memberId: string; timeZone: string; now?: Date },
  adapters: Record<DeliveryChannel, ChannelAdapter> = channelAdaptersFromEnv(),
): Promise<ChannelCheck[]> {
  const now = input.now ?? new Date();
  const { preferences, devices } = await readSetup(admin, input.memberId);
  return Promise.all(
    ROUTABLE_CHANNELS.map(async (channel) => {
      const preference = preferences.find((row) => row.channel === channel);
      const hasTarget = await hasTargetFor(admin, input.memberId, channel, preference ?? null, devices);
      const quiet = preference ? quietHoursFrom(preference) : null;
      const facts: ChannelFacts = {
        channel,
        live: adapters[channel].live,
        enabled: preference?.enabled === true,
        hasTarget,
        inQuiet: quiet ? inQuietHours(now, quiet, input.timeZone) : false,
        sentToday: NORMAL_CEILING[channel] === null ? 0 : await sentInLastDay(admin, input.memberId, channel, now),
      };
      return { channel, blocks: blocksFor(facts), lastFailure: facts.live ? await lastFailureOn(admin, input.memberId, channel, now) : null };
    }),
  );
}

async function readSetup(admin: SupabaseClient, memberId: string) {
  const [{ data: rows }, { data: devices }] = await Promise.all([
    admin
      .from("notification_preferences")
      .select("channel, enabled, quiet_from, quiet_until, quiet_from_minute, quiet_until_minute, target")
      .eq("member_id", memberId)
      .neq("channel", "in_app"),
    admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("member_id", memberId),
  ]);
  const preferences: ChannelPreference[] = ((rows ?? []) as Record<string, unknown>[]).map((row) => ({
    channel: row.channel as DeliveryChannel,
    enabled: row.enabled === true,
    quietFrom: (row.quiet_from as number | null) ?? null,
    quietUntil: (row.quiet_until as number | null) ?? null,
    quietFromMinute: (row.quiet_from_minute as number | null) ?? 0,
    quietUntilMinute: (row.quiet_until_minute as number | null) ?? 0,
    target: (row.target as string | null) ?? null,
  }));
  return { preferences, devices: (devices ?? []) as { id: string; endpoint: string; p256dh: string; auth: string }[] };
}

async function hasTargetFor(admin: SupabaseClient, memberId: string, channel: RoutableChannel, preference: ChannelPreference | null, devices: readonly unknown[]): Promise<boolean> {
  if (channel === "push") return devices.length > 0;
  if (channel === "whatsapp") return isWhatsAppNumber(preference?.target ?? null);
  return (await emailAddressFor(admin, memberId)) !== null;
}

/** The last failure on a channel in the past week, unless something was sent after it. */
async function lastFailureOn(admin: SupabaseClient, memberId: string, channel: RoutableChannel, now: Date): Promise<string | null> {
  try {
    const { data } = await admin
      .from("notification_events")
      .select("event_type, metadata, created_at, notifications!inner(recipient_member_id)")
      .eq("channel", channel)
      .in("event_type", ["sent", "delivery_failed"])
      .eq("notifications.recipient_member_id", memberId)
      .gte("created_at", new Date(now.getTime() - 7 * 86_400_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1);
    const latest = ((data ?? []) as { event_type: string; metadata: { code?: unknown } | null }[])[0];
    return latest?.event_type === "delivery_failed" && typeof latest.metadata?.code === "string" ? latest.metadata.code : null;
  } catch {
    return null;
  }
}

export type TestResult =
  | { ok: true; devices?: number }
  | { ok: false; reason: ChannelBlock | "refused" | "unreachable" };

/** The reason a refused send gives, in the same closed words. */
export function reasonForFailure(result: Extract<ChannelSendResult, { ok: false }>, channel: RoutableChannel): Extract<TestResult, { ok: false }>["reason"] {
  return reasonForCode(result.error.code, channel);
}

/** The same, from the code a `delivery_failed` event kept. */
export function reasonForCode(code: string, channel: RoutableChannel): Extract<TestResult, { ok: false }>["reason"] {
  switch (code) {
    case "not_configured":
      return "not_set_up";
    case "no_target":
      return channel === "push" ? "no_device" : "no_address";
    case "gone":
      return "no_device";
    case "unavailable":
      return "unreachable";
    default:
      return "refused";
  }
}

/**
 * A test notification on one channel, to this person only (story 27-003).
 *
 * It goes now: a person asking to see it arrive has chosen the moment, so
 * quiet hours and the daily ceilings do not hold it, and it does not count
 * against them (it is not a notification, and leaves no event row). What it
 * does check is whether the channel can reach them at all, and says which
 * part is missing when it cannot. Never throws.
 */
export async function sendTestNotification(
  admin: SupabaseClient,
  input: { memberId: string; channel: RoutableChannel; notification: Pick<ChannelNotification, "title" | "body" | "url" | "emailWords">; now?: Date },
  adapters: Record<DeliveryChannel, ChannelAdapter> = channelAdaptersFromEnv(),
): Promise<TestResult> {
  const adapter = adapters[input.channel];
  if (!adapter?.live) return { ok: false, reason: "not_set_up" };
  try {
    const { preferences, devices } = await readSetup(admin, input.memberId);
    const preference = preferences.find((row) => row.channel === input.channel);
    // Push is switched on by registering a device, so only email and WhatsApp can be "off" with the means still in place.
    if (input.channel !== "push" && preference?.enabled !== true) return { ok: false, reason: "off" };
    const notification: ChannelNotification = { priority: "normal", tag: "wonderhome-test", url: "/settings/notifications", ...input.notification };

    if (input.channel === "push") {
      if (devices.length === 0) return { ok: false, reason: "no_device" };
      const attempts = await Promise.all(
        devices.map(async (device) => {
          const target = JSON.stringify({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } });
          return { channel: "push" as const, target, result: await adapter.send(notification, target) };
        }),
      );
      await recordPushOutcomes(admin, attempts, devices, input.now ?? new Date());
      const failure = attempts.find((attempt) => !attempt.result.ok)?.result;
      const sent = attempts.filter((attempt) => attempt.result.ok).length;
      if (sent > 0) return { ok: true, devices: sent };
      return { ok: false, reason: failure && !failure.ok ? reasonForFailure(failure, "push") : "refused" };
    }

    const target = input.channel === "email" ? await emailAddressFor(admin, input.memberId) : preference?.target ?? null;
    if (!target) return { ok: false, reason: "no_address" };
    const result = await adapter.send(notification, target);
    return result.ok ? { ok: true } : { ok: false, reason: reasonForFailure(result, input.channel) };
  } catch (thrown) {
    log.warn("test notification failed", { reason: thrown instanceof Error ? thrown.name : "unknown" });
    return { ok: false, reason: "unreachable" };
  }
}
