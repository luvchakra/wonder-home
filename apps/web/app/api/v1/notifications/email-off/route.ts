import { z } from "zod";

import { createAdminClient } from "@wonderhome/core/db/admin";
import { turnEmailOff } from "@wonderhome/core/notifications/email-health";
import { verifyUnsubscribe } from "@wonderhome/core/notifications/unsubscribe";

/**
 * The mail app's own unsubscribe (RFC 8058 one-click, story 27-009): the
 * `List-Unsubscribe` header on every notification email names this address,
 * and the mail app POSTs to it. The signed token is the only credential.
 * A GET (someone opening the address) goes to the page that asks first.
 */
/** The link carries a member id and a signed token; anything else is refused before the signature is even checked. */
const unsubscribeQuery = z.object({ m: z.uuid(), t: z.string().min(1).max(512) });

export async function POST(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const query = unsubscribeQuery.safeParse({ m: url.searchParams.get("m") ?? "", t: url.searchParams.get("t") ?? "" });
  if (!query.success) return new Response(null, { status: 400, headers: { "cache-control": "no-store" } });
  const { m: memberId, t: token } = query.data;
  if (!verifyUnsubscribe(memberId, token)) return new Response(null, { status: 400, headers: { "cache-control": "no-store" } });
  const ok = await turnEmailOff(createAdminClient(), memberId);
  return new Response(null, { status: ok ? 200 : 500, headers: { "cache-control": "no-store" } });
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  return Response.redirect(`${url.origin}/email-off${url.search}`, 302);
}
