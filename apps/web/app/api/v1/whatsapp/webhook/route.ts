import { after } from "next/server";

import { createAdminClient } from "@wonderhome/core/db/admin";
import { whatsappConfigFromEnv } from "@wonderhome/core/notifications/whatsapp";
import { handleWhatsAppWebhook } from "@wonderhome/core/notifications/whatsapp-webhook";

import { whatsappAsk } from "@/app/_lib/whatsapp-hometalk";

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
  return handleWhatsAppWebhook(request, { config: whatsappConfigFromEnv(), admin: createAdminClient, defer: (work) => after(work), ask });
}

export const GET = handle;
export const POST = handle;
export const dynamic = "force-dynamic";
