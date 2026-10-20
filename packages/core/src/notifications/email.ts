import { escapeHtml, singleRecipient, type Mailer, type OutgoingMail } from "../email/mailer";
import type { ChannelAdapter, ChannelNotification, ChannelSendResult } from "./channels";

/**
 * A notification as an email (story 27-001): the notification's own words, one
 * button back into WonderHome, and a line saying why it arrived and where to
 * change that. Nothing else: the same title and body push carries, so an inbox
 * never says more than the lock screen would.
 *
 * Every value is escaped; a title is text, never markup. The colours are the
 * light theme's tokens written out as hex (a mail app reads no CSS variables),
 * the same ones the invitation email uses.
 */

const DEFAULT_WORDS: NonNullable<ChannelNotification["emailWords"]> = {
  open: "Open in WonderHome",
  why: "You are getting this because email is on in your WonderHome notification settings. You can change that any time under Settings → Notifications.",
};

/** Where WonderHome lives, for the link in the message. */
export function siteOrigin(env: Record<string, string | undefined> = process.env): string {
  const set = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (set) return set.replace(/\/+$/, "");
  return env.VERCEL_ENV !== "production" && env.VERCEL_URL ? `https://${env.VERCEL_URL}` : "https://home.wonderapps.biz";
}

export function notificationMail(notification: ChannelNotification, to: string, origin: string): OutgoingMail {
  const words = notification.emailWords ?? DEFAULT_WORDS;
  const path = notification.url && notification.url.startsWith("/") ? notification.url : "/notifications";
  const link = `${origin}${path}`;
  const off = notification.emailOff && words.off ? { url: notification.emailOff, label: words.off } : null;
  const text = [notification.title, "", notification.body, "", `${words.open}: ${link}`, "", words.why, ...(off ? ["", `${off.label}: ${off.url}`] : [])].join("\n");
  const html = `<!doctype html>
<html><body style="margin:0;background:#FDFAF3;font-family:Sora,Segoe UI,Arial,sans-serif;color:#111A2F">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FDFAF3;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#FFFFFF;border-radius:20px;padding:28px">
<tr><td style="font-size:14px;font-weight:600;color:#515E72;padding-bottom:12px">WonderHome</td></tr>
<tr><td style="font-size:18px;font-weight:600;line-height:1.4;padding-bottom:8px">${escapeHtml(notification.title)}</td></tr>
<tr><td style="font-size:16px;line-height:1.5;padding-bottom:20px">${escapeHtml(notification.body)}</td></tr>
<tr><td style="padding-bottom:20px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#6162F6;color:#FFFFFF;text-decoration:none;font-weight:600;border-radius:12px;padding:12px 20px">${escapeHtml(words.open)}</a></td></tr>
<tr><td style="font-size:12px;line-height:1.5;color:#76818F">${escapeHtml(words.why)}${off ? ` <a href="${escapeHtml(off.url)}" style="color:#76818F">${escapeHtml(off.label)}</a>` : ""}</td></tr>
</table>
</td></tr></table>
</body></html>`;
  // A mail app can offer its own unsubscribe from these two headers (RFC 8058).
  const headers = off ? { "List-Unsubscribe": `<${off.url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : undefined;
  return { to, subject: notification.title, text, html, ...(headers ? { headers } : {}) };
}

export function createEmailAdapter(mailer: Mailer, env: Record<string, string | undefined> = process.env): ChannelAdapter {
  return {
    channel: "email",
    live: true,
    async send(notification, target): Promise<ChannelSendResult> {
      const to = target ? singleRecipient(target) : null;
      if (!to) return { ok: false, error: { code: "no_target", retryable: false, message: "No email address on file." } };
      const sent = await mailer.send(notificationMail(notification, to, siteOrigin(env)));
      if (sent.ok) return { ok: true };
      // A rejected address will not improve on a retry; an unreachable server may.
      return sent.reason === "rejected"
        ? { ok: false, error: { code: "rejected", retryable: false, message: "The mail server refused this address." } }
        : { ok: false, error: { code: "unavailable", retryable: true, message: "The mail server could not be reached." } };
    },
  };
}
