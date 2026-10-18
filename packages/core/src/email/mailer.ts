import { createTransport } from "nodemailer";

/**
 * WonderHome's own outgoing email, behind a provider-neutral seam.
 *
 * SMTP is the one implementation: the owner chose the GoDaddy mailbox
 * connect@wonderapps.biz on 2026-10-18. Like every other integration here it
 * is inert until a deployment sets it up — `platformMailConfig` returning
 * `null` is what "not configured" looks like end to end, and a screen then
 * offers nothing that would claim to send. The credentials live only in the
 * deployment's environment, never in the repository:
 *
 *   WONDERHOME_SMTP_HOST       e.g. smtpout.secureserver.net (GoDaddy)
 *   WONDERHOME_SMTP_PORT       465 (implicit TLS, the default) or 587 (STARTTLS)
 *   WONDERHOME_SMTP_USER       the mailbox, e.g. connect@wonderapps.biz
 *   WONDERHOME_SMTP_PASSWORD   the mailbox password
 *   WONDERHOME_SMTP_FROM       optional; defaults to "WonderHome <user>"
 */

export type MailConfig = { host: string; port: number; secure: boolean; user: string; password: string; from: string };

export function platformMailConfig(env: Record<string, string | undefined> = process.env): MailConfig | null {
  const host = env.WONDERHOME_SMTP_HOST?.trim();
  const user = env.WONDERHOME_SMTP_USER?.trim();
  const password = env.WONDERHOME_SMTP_PASSWORD;
  if (!host || !user || !password) return null;
  const port = Number(env.WONDERHOME_SMTP_PORT?.trim() || 465);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;
  return { host, port, secure: port === 465, user, password, from: env.WONDERHOME_SMTP_FROM?.trim() || `WonderHome <${user}>` };
}

export type OutgoingMail = { to: string; subject: string; text: string; html: string };

export type SendResult = { ok: true } | { ok: false; reason: "rejected" | "unreachable" };

export type Mailer = { send(mail: OutgoingMail): Promise<SendResult> };

/** An SMTP mailer. Never throws: a failure is a closed word, never the server's prose. */
export function smtpMailer(config: MailConfig): Mailer {
  const transport = createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: !config.secure,
    auth: { user: config.user, pass: config.password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    // Nothing a message carries may make the transport read a file or a URL.
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return {
    async send(mail) {
      try {
        await transport.sendMail({ from: config.from, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html });
        return { ok: true };
      } catch (error) {
        const code = (error as { responseCode?: unknown }).responseCode;
        return { ok: false, reason: typeof code === "number" ? "rejected" : "unreachable" };
      }
    },
  };
}

/** The deployment's mailer, or null when no mail is configured. */
export function platformMailer(env: Record<string, string | undefined> = process.env): Mailer | null {
  const config = platformMailConfig(env);
  return config ? smtpMailer(config) : null;
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Text made safe to place in an HTML email. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => ESCAPES[character]!);
}

/** A plain address a person typed, as one recipient — never a list, a display name or a header injection. */
export function singleRecipient(address: string): string | null {
  const trimmed = address.trim();
  return /^[^\s@<>,;:"()[\]\\]+@[^\s@<>,;:"()[\]\\]+\.[^\s@<>,;:"()[\]\\]+$/.test(trimmed) && trimmed.length <= 254 ? trimmed : null;
}
