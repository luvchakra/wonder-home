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

/**
 * Bright, soft and family-friendly (the owner, 2026-10-23): a peach page, a
 * white card with deep round corners, pastel accents from the brand's own
 * hues, and the house illustration across the top. Primary stays the one
 * colour of the one button (DESIGN rule 3); pastels only decorate.
 */
export const EMAIL_COLORS = {
  page: "#FFF6F1",
  card: "#FFFFFF",
  ink: "#1F2937",
  muted: "#515E72",
  subtle: "#7A8496",
  line: "#F6E3EC",
  primary: "#6366F1",
  blush: "#FFE4EF",
  mint: "#E4F8EC",
  sky: "#E3F5FF",
  butter: "#FFF1DC",
  rose: "#E8649A",
} as const;

const FONT = "Sora,'Nunito','Trebuchet MS','Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SCRIPT = "Caveat,'Segoe Print','Bradley Hand','Comic Sans MS',cursive";

export type EmailLink = { label: string; href: string };

export type EmailLayoutInput = {
  /** WonderHome's absolute origin; the art, the mark and the footer links are built from it. */
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

/** The PWA icon the app already serves, so no new mark is drawn for email. */
export function emailMarkUrl(origin: string): string {
  return new URL("/icon-192.png", origin).toString();
}

/**
 * The banner across the top of every email: the landing page's house
 * illustration (`HomeIllustration`) on a pastel sky with hearts and a star,
 * rendered once to a 2× PNG (`public/email/hello-home.png`, 1120×440), because
 * mail apps show neither SVG nor CSS backgrounds reliably.
 */
export function emailArtUrl(origin: string): string {
  return new URL("/email/hello-home.png", origin).toString();
}

/** The closing line every screen ends with, in the handwritten face; decoration, never the only place something is said. */
export const EMAIL_TAGLINE = "Less mental load. More family time!";

export function renderEmailLayout(input: EmailLayoutInput): { html: string; text: string } {
  const C = EMAIL_COLORS;
  const abs = (href: string) => new URL(href, input.origin).toString();
  const links = (input.links ?? []).map((link) => ({ label: link.label, href: abs(link.href) }));
  const home = abs("/");
  const host = new URL(input.origin).host;
  const linkHtml = links
    .map((link) => `<a href="${escapeHtml(link.href)}" style="display:inline-block;margin:4px 3px;padding:6px 12px;border-radius:999px;background:${C.card};border:1px solid ${C.line};color:${C.muted};text-decoration:none;font-size:12px">${escapeHtml(link.label)}</a>`)
    .join("");
  // Pads the preview so mail apps do not pull body text in after the preheader.
  const previewPad = "&#8203;&nbsp;".repeat(60);

  const html = `<!doctype html>
<html lang="${escapeHtml(input.lang ?? "en")}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>WonderHome</title>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700&amp;family=Caveat:wght@600&amp;display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:0;background:${C.page};font-family:${FONT};color:${C.ink};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${C.page}">${escapeHtml(input.preheader)}${previewPad}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background:${C.page}"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px">
<tr><td align="center" style="padding:0 4px 16px"><a href="${escapeHtml(home)}" style="text-decoration:none;color:${C.ink}"><img src="${escapeHtml(emailMarkUrl(input.origin))}" width="36" height="36" alt="" style="display:inline-block;vertical-align:middle;border:0;border-radius:11px;width:36px;height:36px"><span style="display:inline-block;vertical-align:middle;margin-left:10px;font-size:20px;font-weight:700;letter-spacing:-0.2px;color:${C.ink}">WonderHome</span></a></td></tr>
<tr><td bgcolor="${C.card}" style="background:${C.card};border:1px solid ${C.line};border-radius:28px;overflow:hidden">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="padding:10px 10px 0"><img src="${escapeHtml(emailArtUrl(input.origin))}" width="538" alt="" style="display:block;width:100%;max-width:538px;height:auto;border:0;border-radius:22px"></td></tr>
<tr><td style="padding:22px 26px 28px;font-size:16px;line-height:1.6;color:${C.ink}">
${input.bodyHtml}
</td></tr>
</table>
</td></tr>
<tr><td align="center" style="padding:22px 12px 4px;font-family:${SCRIPT};font-size:24px;line-height:1.2;color:${C.rose}">${escapeHtml(EMAIL_TAGLINE)}</td></tr>
<tr><td align="center" style="padding:10px 16px 8px;font-size:12px;line-height:1.6;color:${C.subtle}">
<div style="font-size:13px;font-weight:700;color:${C.muted};margin:0 0 4px">WonderHome · ${escapeHtml(host)}</div>
<div style="margin:0 0 10px">${escapeHtml(input.reason)}</div>
${linkHtml ? `<div>${linkHtml}</div>` : ""}
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  const text = [input.bodyText.trim(), "", EMAIL_TAGLINE, "", "—", `WonderHome · ${host}`, input.reason, ...links.map((link) => `${link.label}: ${link.href}`)].join("\n");
  return { html, text };
}

/** The one button style an email uses for its single action. */
export function emailButton(label: string, href: string): string {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;background:${EMAIL_COLORS.primary};color:#FFFFFF;text-decoration:none;font-weight:600;font-size:16px;border-radius:999px;padding:14px 26px;box-shadow:0 6px 16px rgba(99,102,241,0.28)">${escapeHtml(label)}</a>`;
}

/** The first word of a person's name, for a greeting; null when there is none. */
export function firstName(displayName: unknown): string | null {
  const first = typeof displayName === "string" ? displayName.trim().split(/\s+/)[0] : "";
  return first ? first.slice(0, 40) : null;
}
