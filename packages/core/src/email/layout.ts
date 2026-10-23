import { escapeHtml } from "./mailer";

/**
 * The one frame every WonderHome email goes through: a complete HTML document
 * (language, charset, title), a hidden preview line, the mark and name at the
 * top, the email's own content on a white card, and a footer that says who
 * sent it, why this person got it and where to change that, with a plain-text
 * twin of all of it.
 *
 * The same shape as WonderJobs' `server/email/layout.ts`, which sends from the
 * same GoDaddy mailbox and reaches the inbox: WonderHome's bare card (no head,
 * no charset, no footer naming the sender) was filed as spam by Gmail for the
 * owner while WonderJobs' was not (2026-10-23).
 *
 * A mail app reads no CSS variables and drops stylesheets, so everything is
 * inline and the colours are the light theme's tokens in `ui-theme.css`
 * written out as hex — the same values, not new ones. Every value passed in
 * as text is escaped here; `bodyHtml` arrives already escaped.
 */

export const EMAIL_COLORS = {
  page: "#FDFAF3",
  card: "#FFFFFF",
  ink: "#111A2F",
  muted: "#515E72",
  subtle: "#76818F",
  line: "#ECE6D8",
  primary: "#6162F6",
} as const;

const FONT = "Sora,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export type EmailLink = { label: string; href: string };

export type EmailLayoutInput = {
  /** WonderHome's absolute origin; the mark and the footer links are built from it. */
  origin: string;
  /** The reader's language, for `<html lang>`. */
  lang?: string;
  /** The inbox preview line. Plain text. */
  preheader: string;
  /** The email's own content, already escaped. */
  bodyHtml: string;
  /** The same content as plain text. */
  bodyText: string;
  /** One line: why this person got this email. Plain text. */
  reason: string;
  /** Footer links, paths resolved against `origin`. */
  links?: EmailLink[];
};

/** The PWA icon the app already serves, so no new image is drawn for email. */
export function emailMarkUrl(origin: string): string {
  return new URL("/icon-192.png", origin).toString();
}

export function renderEmailLayout(input: EmailLayoutInput): { html: string; text: string } {
  const C = EMAIL_COLORS;
  const abs = (href: string) => new URL(href, input.origin).toString();
  const links = (input.links ?? []).map((link) => ({ label: link.label, href: abs(link.href) }));
  const home = abs("/");
  const host = new URL(input.origin).host;
  const linkHtml = links.map((link) => `<a href="${escapeHtml(link.href)}" style="color:${C.subtle};text-decoration:underline">${escapeHtml(link.label)}</a>`).join(" &nbsp;·&nbsp; ");
  // Pads the preview so mail apps do not pull body text in after the preheader.
  const previewPad = "&#8203;&nbsp;".repeat(60);

  const html = `<!doctype html>
<html lang="${escapeHtml(input.lang ?? "en")}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>WonderHome</title></head>
<body style="margin:0;padding:0;background:${C.page};font-family:${FONT};color:${C.ink};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${C.page}">${escapeHtml(input.preheader)}${previewPad}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background:${C.page}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px">
<tr><td style="padding:0 4px 14px"><a href="${escapeHtml(home)}" style="text-decoration:none;color:${C.ink}"><img src="${escapeHtml(emailMarkUrl(input.origin))}" width="32" height="32" alt="" style="display:inline-block;vertical-align:middle;border:0;border-radius:8px;width:32px;height:32px"><span style="display:inline-block;vertical-align:middle;margin-left:10px;font-size:18px;font-weight:700;color:${C.ink}">WonderHome</span></a></td></tr>
<tr><td bgcolor="${C.card}" style="background:${C.card};border:1px solid ${C.line};border-radius:20px;padding:24px;font-size:16px;line-height:1.5;color:${C.ink}">
${input.bodyHtml}
</td></tr>
<tr><td align="center" style="padding:20px 16px 8px;font-size:12px;line-height:1.6;color:${C.subtle}">
<div style="font-size:13px;font-weight:700;color:${C.muted};margin:0 0 4px">WonderHome · ${escapeHtml(host)}</div>
<div style="margin:0 0 8px">${escapeHtml(input.reason)}</div>
${linkHtml ? `<div>${linkHtml}</div>` : ""}
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  const text = [input.bodyText.trim(), "", "—", `WonderHome · ${host}`, input.reason, ...links.map((link) => `${link.label}: ${link.href}`)].join("\n");
  return { html, text };
}

/** The one button style an email uses for its single action. */
export function emailButton(label: string, href: string): string {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;background:${EMAIL_COLORS.primary};color:#FFFFFF;text-decoration:none;font-weight:600;border-radius:12px;padding:12px 20px">${escapeHtml(label)}</a>`;
}

/** The first word of a person's name, for a greeting; null when there is none. */
export function firstName(displayName: unknown): string | null {
  const first = typeof displayName === "string" ? displayName.trim().split(/\s+/)[0] : "";
  return first ? first.slice(0, 40) : null;
}
