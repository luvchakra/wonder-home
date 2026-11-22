import { after } from "next/server";

import { createAdminClient } from "@wonderhome/core/db/admin";
import { whatsappConfigFromEnv, whatsappMissingSettings } from "@wonderhome/core/notifications/whatsapp";
import { reloadedSettingsEnv, settingsStoreState, settledSettingsEnv } from "@wonderhome/core/platform/settings/runtime-env";
import { ensurePlatformSettings } from "@wonderhome/core/platform/settings/server";
import { handleWhatsAppWebhook } from "@wonderhome/core/notifications/whatsapp-webhook";

import { whatsappAsk, whatsappAutoAdd, whatsappDecider } from "@/app/_lib/whatsapp-hometalk";

/**
 * WhatsApp's webhook (story 17-006; inbound HomeSend intake, 14-015/14-016). Everything it does is
 * `handleWhatsAppWebhook` (`packages/core/src/notifications/whatsapp-webhook.ts`).
 *
 * Real only once a deployment sets the WhatsApp Cloud API credentials, an
 * approved template, `WHATSAPP_APP_SECRET` and `WHATSAPP_VERIFY_TOKEN` — a
 * WhatsApp Business account and a verified number are a person's errand.
 * Unconfigured, both methods refuse with the standard 401.
 */
async function handle(request: Request): Promise<Response> {
  // Processing (fetching a file, understanding it) runs after the response,
  // so WhatsApp gets its 200 quickly; the daily cron drains anything left.
  // The admin client is made only when a verified message is asked about: built eagerly, it threw on every
  // request where the service role is unset, and the unconfigured route answered 500 instead of its 401.
  const ask = (input: Parameters<ReturnType<typeof whatsappAsk>>[0]) => whatsappAsk(createAdminClient())(input);
  const addOnItsOwn = (input: Parameters<ReturnType<typeof whatsappAutoAdd>>[0]) => whatsappAutoAdd(createAdminClient())(input);
  const decider = whatsappDecider();
  // A cold server waits (bounded) for the saved settings: the app secret and verify token live in Platform admin.
  // The route registers the store's loader itself if this server has none (2026-11-22 outage: the route never saw
  // what Platform admin saved), and before refusing for a missing setting reads the store again, so a value saved a
  // moment ago on another server is not refused from an older copy.
  ensurePlatformSettings();
  let env = await settledSettingsEnv();
  let config = whatsappConfigFromEnv(env);
  if (!config?.appSecret || (request.method === "GET" && !config.verifyToken)) {
    env = await reloadedSettingsEnv();
    config = whatsappConfigFromEnv(env);
  }
  const notConfigured = { missing: whatsappMissingSettings(env), store: settingsStoreState() };
  return handleWhatsAppWebhook(request, { config, admin: createAdminClient, defer: (work) => after(work), ask, addOnItsOwn, decider, notConfigured });
}

export const GET = handle;
export const POST = handle;
export const dynamic = "force-dynamic";
