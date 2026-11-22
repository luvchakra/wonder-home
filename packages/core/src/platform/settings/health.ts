import { PLATFORM_ADMINS_VARIABLE, parsePlatformAdmins, platformAdminsHealth } from "../admins-variable";
import type { SettingStatus } from "./store";

/**
 * Configuration health (owner, 2026-11-22): every setting a working service
 * still lacks, in one sentence each, for Platform admin's Overview and
 * Integrations pages. A service nobody has started setting up is not a gap;
 * one half set up is, because it fails quietly (WhatsApp refused every message
 * for a day when its app secret was lost in a redeploy).
 */
export type ConfigurationGap = { key: string; words: string };

type Rule = { key: string; when: readonly string[]; words: string };

const RULES: readonly Rule[] = [
  { key: "WHATSAPP_APP_SECRET", when: ["WHATSAPP_ACCESS_TOKEN"], words: "WhatsApp app secret is not set — WhatsApp messages are refused." },
  { key: "WHATSAPP_VERIFY_TOKEN", when: ["WHATSAPP_ACCESS_TOKEN"], words: "WhatsApp verify token is not set — Meta can't confirm the webhook address." },
  { key: "WHATSAPP_PHONE_NUMBER_ID", when: ["WHATSAPP_ACCESS_TOKEN"], words: "WhatsApp phone number id is not set — WhatsApp is off." },
  { key: "WHATSAPP_TEMPLATE_NAME", when: ["WHATSAPP_ACCESS_TOKEN"], words: "WhatsApp message template is not set — WhatsApp is off." },
  { key: "RAZORPAY_WEBHOOK_SECRET", when: ["RAZORPAY_KEY_ID"], words: "Razorpay webhook secret is not set — Razorpay is off and payments can't be confirmed." },
  { key: "STRIPE_WEBHOOK_SECRET", when: ["STRIPE_SECRET_KEY"], words: "Stripe webhook secret is not set — Stripe is off." },
  { key: "RESEND_WEBHOOK_SECRET", when: ["RESEND_API_KEY"], words: "Resend webhook secret is not set — emails to HomeSend addresses are refused." },
  { key: "ALEXA_OAUTH_CLIENT_SECRET", when: ["ALEXA_OAUTH_CLIENT_ID"], words: "Alexa client secret is not set — Alexa account linking fails." },
  { key: "ALEXA_OAUTH_REDIRECT_URIS", when: ["ALEXA_OAUTH_CLIENT_ID"], words: "Alexa redirect URLs are not set — Alexa account linking fails." },
];

const isSet = (status: SettingStatus | undefined) => status !== undefined && (status.source === "saved" || status.source === "environment");

export function configurationHealth(
  statuses: ReadonlyMap<string, SettingStatus>,
  env: Readonly<Record<string, string | undefined>> = process.env,
): ConfigurationGap[] {
  const gaps = RULES.filter((rule) => rule.when.some((key) => isSet(statuses.get(key))) && !isSet(statuses.get(rule.key))).map(({ key, words }) => ({ key, words }));
  // Deployment-only (STAYS_IN_VERCEL): set but empty or partly not understood.
  const staffWords = platformAdminsHealth(parsePlatformAdmins(env[PLATFORM_ADMINS_VARIABLE]));
  return staffWords ? [...gaps, { key: PLATFORM_ADMINS_VARIABLE, words: staffWords }] : gaps;
}
