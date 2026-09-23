import { createAdminClient } from "@wonderhome/core/db/admin";
import { whatsappConfigFromEnv } from "@wonderhome/core/notifications/whatsapp";
import { handleWhatsAppWebhook } from "@wonderhome/core/notifications/whatsapp-webhook";

/**
 * WhatsApp's webhook (story 17-006). Everything it does is
 * `handleWhatsAppWebhook` (`packages/core/src/notifications/whatsapp-webhook.ts`).
 *
 * Real only once a deployment sets the WhatsApp Cloud API credentials, an
 * approved template, `WHATSAPP_APP_SECRET` and `WHATSAPP_VERIFY_TOKEN` — a
 * WhatsApp Business account and a verified number are a person's errand.
 * Unconfigured, both methods refuse with the standard 401.
 */
async function handle(request: Request): Promise<Response> {
  return handleWhatsAppWebhook(request, { config: whatsappConfigFromEnv(), admin: createAdminClient });
}

export const GET = handle;
export const POST = handle;
export const dynamic = "force-dynamic";
