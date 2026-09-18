import { NextResponse } from "next/server";

import { createClient } from "@wonderhome/core/db/server";
import { log } from "@wonderhome/core/observability/logger";

/**
 * Where Supabase returns a person after it has verified them.
 *
 * Both the password recovery link and the Google redirect land here carrying
 * a one-time code. Exchanging it is what writes the session cookies, so this
 * handler is the only thing standing between a verified identity and a
 * signed-in session — and it runs on the server, where the cookies can be set
 * with the flags the browser will not let script touch.
 *
 * `next` is checked rather than trusted. It arrives in a URL, and a URL is
 * something an attacker can compose and send to somebody: an open redirect
 * here would let a phishing link finish its journey on our domain.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));

  if (!code) {
    const error = url.searchParams.get("error_description") ?? url.searchParams.get("error");
    if (error) log.warn("auth callback returned without a code", { reason: error });
    return NextResponse.redirect(new URL("/sign-in?error=link", url.origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    log.warn("auth callback could not exchange the code", { reason: error.code ?? "unknown" });
    return NextResponse.redirect(new URL("/sign-in?error=link", url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}

/** Only a path on this site, never another origin. */
function safeNext(value: string | null): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export const dynamic = "force-dynamic";
