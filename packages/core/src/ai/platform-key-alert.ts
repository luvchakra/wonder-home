import type { SupabaseClient } from "@supabase/supabase-js";

import { renderEmailLayout } from "../email/layout";
import { escapeHtml, type Mailer } from "../email/mailer";
import { siteOrigin } from "../notifications/email";
import { QUOTA_ALERT_AFTER_MS } from "../notifications/notices";
import { keyFingerprint, type KeyAlertKind } from "./key-alerts";
import { platformKey } from "./model-key";
import { runtimeEnv } from "../platform/settings/runtime-env";

/**
 * An alert on WonderHome's own key reaches the platform admins (story 14-048,
 * design §13.1). A household's key is told to that household's Admin
 * (`notices.ts` `aiKeyNotices`); the deployment's own key (`WONDERHOME_AI_KEY`)
 * belongs to no household, so it was recorded and told to no one.
 *
 * The delivery clock emails the platform's owners and operators when it opens
 * and again every day it stays open (2026-11-21: the one email of 14 Nov went
 * unnoticed for six days while every family was answered by rules alone); the
 * platform-admin AI card and Overview show it while it is open. A quota
 * refusal waits until it has lasted, like a household's. An alert for a key
 * that is no longer the platform's (or any household's) is closed as
 * superseded, so a replaced key leaves no stale warning. Service role only,
 * and nothing of the key itself is ever read back or sent.
 */

export type PlatformKeyAlert = { id: string; provider: string; kind: KeyAlertKind; failures: number; firstSeenAt: string; lastSeenAt: string; notifiedAt: string | null };

type AlertRow = { id: string; provider: string; kind: KeyAlertKind; failures: number; first_seen_at: string; last_seen_at: string; platform_notified_at: string | null };

/** The open alert on the platform's own key, or null (no key, nothing open, or it can't be read). */
export async function openPlatformKeyAlert(admin: SupabaseClient, env: Record<string, string | undefined> = runtimeEnv()): Promise<PlatformKeyAlert | null> {
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

/** Every day an open alert lasts, the platform's owners and operators hear of it again. */
export const RETELL_EVERY_MS = 24 * 60 * 60 * 1000;

/**
 * Closes open alerts for keys in use by nobody any more: not a saved or
 * deployed platform secret (`keep`, every secret setting's fingerprint), and
 * not a household's own key (the database checks those). Returns how many.
 */
export async function supersedeStaleKeyAlerts(admin: SupabaseClient, env: Record<string, string | undefined> = runtimeEnv()): Promise<number> {
  try {
    const keep = platformSecretFingerprints(env);
    const { data, error } = await admin.rpc("supersede_ai_key_alerts", { p_keep: keep });
    if (error) return 0;
    return typeof data === "number" ? data : 0;
  } catch {
    return 0;
  }
}

/** The fingerprints of every platform secret a provider might be sent: the AI key, the voice and speech keys. */
export function platformSecretFingerprints(env: Record<string, string | undefined>): string[] {
  const names = Object.keys(env).filter((name) => /^(WONDERHOME_[A-Z_]*KEY|GEMINI_[A-Z_]*KEY|GOOGLE_[A-Z_]*KEY|ANTHROPIC_API_KEY|OPENAI_API_KEY)$/.test(name));
  const values = names.map((name) => env[name]?.trim()).filter((value): value is string => Boolean(value));
  return [...new Set(values.map((value) => keyFingerprint(value)))];
}

/** A call with the platform key just worked (a "Test key" that passed): its alert is over. */
export async function resolvePlatformKeyAlert(admin: SupabaseClient, key: string): Promise<void> {
  try {
    await admin.rpc("resolve_ai_key_alert", { p_fingerprint: keyFingerprint(key) });
  } catch {
    // Best effort: the next call that works resolves it anyway.
  }
}

/**
 * What an open alert has meant for families, for the AI card and Overview:
 * how many things sent in since it opened were kept without being read by a
 * model. Counts only, across households (service role, platform staff).
 */
export async function itemsReadWithoutModelSince(admin: SupabaseClient, since: string): Promise<number | null> {
  try {
    const { count, error } = await admin
      .from("home_send_items")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since)
      .or("failure_reason.eq.model_unavailable,and(status.eq.classified,classified_kind.eq.unknown)");
    return error ? null : (count ?? 0);
  } catch {
    return null;
  }
}

/** One plain line for the card: since when, and what it has meant. */
export function platformAlertLine(alert: Pick<PlatformKeyAlert, "provider" | "kind" | "firstSeenAt">, unread: number | null, timeZone = "Asia/Kolkata"): string {
  const provider = PROVIDER_NAMES[alert.provider] ?? alert.provider;
  const since = new Date(alert.firstSeenAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone });
  const what = alert.kind === "key_rejected" ? `${provider} has refused WonderHome's key` : alert.kind === "out_of_credits" ? `WonderHome's ${provider} account is out of credit` : `WonderHome's ${provider} key is over its quota`;
  const families = unread === null ? "families without their own key are answered by rules only" : `${unread} ${unread === 1 ? "item was" : "items were"} read by rules only`;
  return `Since ${since}, ${what}: nothing has been read by a model, and ${families}. Save a working key, then press Test key.`;
}

const PROVIDER_NAMES: Record<string, string> = { anthropic: "Anthropic", google: "Google", openai: "OpenAI" };

const WHAT_WENT_WRONG: Record<KeyAlertKind, string> = {
  out_of_credits: "is out of credits",
  quota_exhausted: "has used up its quota",
  key_rejected: "was refused as not valid",
};

/** The email: which provider, what went wrong, what households see meanwhile, and what to do. Never the key. */
export function platformKeyMail(alert: Pick<PlatformKeyAlert, "provider" | "kind"> & Partial<Pick<PlatformKeyAlert, "firstSeenAt" | "notifiedAt">>, origin: string, now = new Date(), unread: number | null = null): { subject: string; text: string; html: string } {
  const provider = PROVIDER_NAMES[alert.provider] ?? alert.provider;
  const days = alert.firstSeenAt ? Math.floor((now.getTime() - new Date(alert.firstSeenAt).getTime()) / RETELL_EVERY_MS) : 0;
  const headline = days >= 1 ? `Still not fixed, day ${days + 1}: WonderHome's own ${provider} key ${WHAT_WENT_WRONG[alert.kind]}` : `WonderHome's own ${provider} key ${WHAT_WENT_WRONG[alert.kind]}`;
  const lines = [
    `${provider} refused WonderHome's platform key.`,
    unread === null
      ? "Households without a key of their own are answered by WonderHome's rules only: nothing they send is read by a model until it works again."
      : `Households without a key of their own are answered by WonderHome's rules only: ${unread} ${unread === 1 ? "thing" : "things"} sent in since it started ${unread === 1 ? "was" : "were"} kept unread, and will be read once it works.`,
    alert.kind === "key_rejected" ? `Create a new key in ${provider}'s console, save it in Platform admin → AI & providers, then press Test key.` : `Add credit or raise the limit in ${provider}'s billing page, then press Test key in Platform admin → AI & providers.`,
    "You'll hear again every day it stays open. It clears on its own with the next call that works.",
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
 * platform key, and again every day it stays open. Closes stale alerts first.
 * Returns how many were emailed. Never throws.
 */
export async function tellPlatformAdmins(admin: SupabaseClient, mailer: Mailer | null, now: Date, env: Record<string, string | undefined> = runtimeEnv()): Promise<number> {
  try {
    await supersedeStaleKeyAlerts(admin, env);
    const alert = await openPlatformKeyAlert(admin, env);
    if (!alert || !mailer) return 0;
    if (alert.notifiedAt && now.getTime() - new Date(alert.notifiedAt).getTime() < RETELL_EVERY_MS) return 0;
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
    // Claimed first, so two servers on the same tick never both send the day's email.
    const claim = admin.from("ai_key_alerts").update({ platform_notified_at: now.toISOString() }).eq("id", alert.id);
    const { data: claimed } = await (alert.notifiedAt ? claim.eq("platform_notified_at", alert.notifiedAt) : claim.is("platform_notified_at", null)).select("id");
    if ((claimed ?? []).length === 0) return 0;
    const mail = platformKeyMail(alert, siteOrigin(env), now, await itemsReadWithoutModelSince(admin, alert.firstSeenAt));
    let sent = 0;
    for (const to of emails) if ((await mailer.send({ to, ...mail })).ok) sent += 1;
    // Nobody could be emailed: let the next tick try again.
    if (sent === 0) await admin.from("ai_key_alerts").update({ platform_notified_at: alert.notifiedAt }).eq("id", alert.id);
    return sent;
  } catch {
    return 0;
  }
}
