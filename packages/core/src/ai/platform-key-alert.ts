import type { SupabaseClient } from "@supabase/supabase-js";

import { renderEmailLayout } from "../email/layout";
import { escapeHtml, type Mailer } from "../email/mailer";
import { siteOrigin } from "../notifications/email";
import { QUOTA_ALERT_AFTER_MS } from "../notifications/notices";
import { keyFingerprint, type KeyAlertKind } from "./key-alerts";
import { platformKey } from "./model-key";

/**
 * An alert on WonderHome's own key reaches the platform admins (story 14-048,
 * design §13.1). A household's key is told to that household's Admin
 * (`notices.ts` `aiKeyNotices`); the deployment's own key (`WONDERHOME_AI_KEY`)
 * belongs to no household, so it was recorded and told to no one.
 *
 * The delivery clock emails the platform's owners and operators once per
 * alert; the platform-admin AI operations read shows it while it is open. A
 * quota refusal waits until it has lasted, like a household's. Service role
 * only, and nothing of the key itself is ever read back or sent.
 */

export type PlatformKeyAlert = { id: string; provider: string; kind: KeyAlertKind; failures: number; firstSeenAt: string; lastSeenAt: string; notifiedAt: string | null };

type AlertRow = { id: string; provider: string; kind: KeyAlertKind; failures: number; first_seen_at: string; last_seen_at: string; platform_notified_at: string | null };

/** The open alert on the platform's own key, or null (no key, nothing open, or it can't be read). */
export async function openPlatformKeyAlert(admin: SupabaseClient, env: Record<string, string | undefined> = process.env): Promise<PlatformKeyAlert | null> {
  const key = platformKey(env);
  if (!key) return null;
  const { data, error } = await admin
    .from("ai_key_alerts")
    .select("id, provider, kind, failures, first_seen_at, last_seen_at, platform_notified_at")
    .eq("key_fingerprint", keyFingerprint(key.key))
    .is("resolved_at", null)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as AlertRow;
  return { id: row.id, provider: row.provider, kind: row.kind, failures: row.failures, firstSeenAt: row.first_seen_at, lastSeenAt: row.last_seen_at, notifiedAt: row.platform_notified_at };
}

const PROVIDER_NAMES: Record<string, string> = { anthropic: "Anthropic", google: "Google", openai: "OpenAI" };

const WHAT_WENT_WRONG: Record<KeyAlertKind, string> = {
  out_of_credits: "is out of credits",
  quota_exhausted: "has used up its quota",
  key_rejected: "was refused as not valid",
};

/** The email: which provider, what went wrong, what households see meanwhile, and what to do. Never the key. */
export function platformKeyMail(alert: Pick<PlatformKeyAlert, "provider" | "kind">, origin: string): { subject: string; text: string; html: string } {
  const provider = PROVIDER_NAMES[alert.provider] ?? alert.provider;
  const headline = `WonderHome's own ${provider} key ${WHAT_WENT_WRONG[alert.kind]}`;
  const lines = [
    `${provider} refused WonderHome's platform key (WONDERHOME_AI_KEY).`,
    "Households without a key of their own can't use the assistant until it works again.",
    alert.kind === "key_rejected" ? "Check the key in the deployment's environment." : `Add credit or raise the limit in ${provider}'s billing page.`,
    "This alert clears on its own with the next call that works.",
  ];
  const { html, text } = renderEmailLayout({
    origin,
    preheader: headline,
    bodyHtml: `<h1 style="margin:0 0 12px;font-size:20px;">${escapeHtml(headline)}</h1>${lines.map((line) => `<p style="margin:0 0 10px;">${escapeHtml(line)}</p>`).join("")}`,
    bodyText: [headline, "", ...lines].join("\n"),
    reason: "You are getting this because you are a WonderHome platform owner or operator.",
  });
  return { subject: headline, text, html };
}

/**
 * Emails the platform's owners and operators about an open alert on the
 * platform key, once. Returns how many were emailed. Never throws.
 */
export async function tellPlatformAdmins(admin: SupabaseClient, mailer: Mailer | null, now: Date, env: Record<string, string | undefined> = process.env): Promise<number> {
  try {
    const alert = await openPlatformKeyAlert(admin, env);
    if (!alert || alert.notifiedAt || !mailer) return 0;
    if (alert.kind === "quota_exhausted" && now.getTime() - new Date(alert.firstSeenAt).getTime() < QUOTA_ALERT_AFTER_MS) return 0;
    const { data: staff } = await admin.from("platform_admins").select("profile_id").eq("status", "active").in("role", ["owner", "operator"]).limit(20);
    const emails = (
      await Promise.all(
        ((staff ?? []) as { profile_id: string }[]).map(async (row) => {
          const { data } = await admin.auth.admin.getUserById(row.profile_id).catch(() => ({ data: null }));
          return data?.user?.email ?? null;
        }),
      )
    ).filter((email): email is string => Boolean(email));
    if (emails.length === 0) return 0;
    const mail = platformKeyMail(alert, siteOrigin(env));
    let sent = 0;
    for (const to of emails) if ((await mailer.send({ to, ...mail })).ok) sent += 1;
    if (sent > 0) await admin.from("ai_key_alerts").update({ platform_notified_at: now.toISOString() }).eq("id", alert.id).is("platform_notified_at", null);
    return sent;
  } catch {
    return 0;
  }
}
