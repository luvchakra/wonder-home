import { after } from "next/server";

import { createAdminClient } from "@wonderhome/core/db/admin";
import { platformResendConfig } from "@wonderhome/core/homesend/email-gateway";
import { handleEmailWebhook } from "@wonderhome/core/homesend/email-webhook";

/**
 * The email intake channel's front door (HomeSend Phase 2). Everything it
 * does is `handleEmailWebhook` (`packages/core/src/homesend/email-webhook.ts`),
 * given the real service-role client, Resend's API and Next's `after`.
 *
 * Provider-authenticated, not household-authenticated — so it never calls
 * `requireUser`/`requireMembership` and never uses `defineRoute` (which reads
 * the body as JSON before a handler runs; signature verification needs the
 * exact raw bytes first).
 *
 * Real end to end only once a deployment sets `RESEND_API_KEY` and
 * `RESEND_WEBHOOK_SECRET` (a Resend account and a verified receiving domain
 * are a human's errand — DNS records, domain ownership — not something this
 * session can create). Unconfigured, it answers every caller with the same
 * 401 an anonymous caller gets anywhere else.
 */
export async function POST(request: Request): Promise<Response> {
  const config = platformResendConfig();
  return handleEmailWebhook(request, { config, supabase: config ? createAdminClient() : (null as never), defer: (work) => after(work) });
}

export const dynamic = "force-dynamic";
