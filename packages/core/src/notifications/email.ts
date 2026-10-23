import { emailButton, renderEmailLayout } from "../email/layout";
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
  settings: "Notification settings",
  privacy: "Privacy",
};

/** Where WonderHome lives, for the link in the message. */
export function siteOrigin(env: Record<string, string | undefined> = process.env): string {
  const set = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (set) return set.replace(/\/+$/, "");
  return env.VERCEL_ENV !== "production" && env.VERCEL_URL ? `https://${env.VERCEL_URL}` : "https://home.wonderapps.biz";
}

/**
 * The notification in the shared email frame (`email/layout.ts`): a greeting
 * by name when one is known, the title, the body, one button, and a footer
 * that names WonderHome, says why it came and links to the settings that
 * control it — the shape of WonderJobs' emails, which the same mailbox gets
 * into the inbox.
 */
export function notificationMail(notification: ChannelNotification, to: string, origin: string): OutgoingMail {
  const words = { ...DEFAULT_WORDS, ...notification.emailWords };
  const path = notification.url && notification.url.startsWith("/") ? notification.url : "/notifications";
  const link = `${origin}${path}`;
  const off = notification.emailOff && words.off ? { href: notification.emailOff, label: words.off } : null;
  const hello = words.hello?.trim() || null;
  const bodyHtml = [
    hello ? `<p style="margin:0 0 10px">${escapeHtml(hello)}</p>` : "",
    `<div style="font-size:18px;font-weight:700;line-height:1.4;margin:0 0 8px">${escapeHtml(notification.title)}</div>`,
    `<p style="margin:0 0 20px;white-space:pre-wrap">${escapeHtml(notification.body)}</p>`,
    `<p style="margin:0">${emailButton(words.open, link)}</p>`,
  ].join("");
  const bodyText = [...(hello ? [hello] : []), notification.title, notification.body, `${words.open}: ${link}`].join("\n\n");
  const { html, text } = renderEmailLayout({
    origin,
    lang: words.lang,
    preheader: notification.body.slice(0, 120),
    bodyHtml,
    bodyText,
    reason: words.why,
    links: [
      { label: words.settings ?? DEFAULT_WORDS.settings!, href: "/settings/notifications" },
      { label: words.privacy ?? DEFAULT_WORDS.privacy!, href: "/legal" },
      ...(off ? [off] : []),
    ],
  });
  // A mail app can offer its own unsubscribe from these two headers (RFC 8058).
  const headers = off ? { "List-Unsubscribe": `<${off.href}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : undefined;
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
