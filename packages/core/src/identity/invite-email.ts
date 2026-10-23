import { EMAIL_COLORS, emailButton, renderEmailLayout } from "../email/layout";
import { escapeHtml, type OutgoingMail } from "../email/mailer";

/**
 * The email that carries a family member's sign-in link (story 01-010).
 *
 * Every line arrives already in the inviter's language; this only lays it
 * out. One warm sentence, one button, the link written out for a mail app
 * that strips buttons, and a quiet line saying it can be ignored. Every value
 * is escaped — a household's or a person's name is text, never markup.
 *
 * It goes through the same frame as every WonderHome email
 * (`email/layout.ts`): a complete document, a preview line and a footer
 * naming WonderHome, so a mail app reads it as the real thing it is.
 */
export function inviteEmail(input: {
  to: string;
  link: string;
  subject: string;
  greeting: string;
  message: string;
  action: string;
  expiry: string;
  footer: string;
  /** The reader's language, and the footer's privacy link in it. */
  lang?: string;
  privacy?: string;
}): OutgoingMail {
  const bodyHtml = [
    `<p style="margin:0 0 10px">${escapeHtml(input.greeting)}</p>`,
    `<p style="margin:0 0 20px">${escapeHtml(input.message)}</p>`,
    `<p style="margin:0 0 16px">${emailButton(input.action, input.link)}</p>`,
    `<p style="margin:0 0 12px;font-size:13px;color:${EMAIL_COLORS.muted};word-break:break-all"><a href="${escapeHtml(input.link)}" style="color:${EMAIL_COLORS.primary}">${escapeHtml(input.link)}</a></p>`,
    `<p style="margin:0;font-size:13px;color:${EMAIL_COLORS.muted}">${escapeHtml(input.expiry)}</p>`,
  ].join("");
  const bodyText = [input.greeting, input.message, `${input.action}: ${input.link}`, input.expiry].join("\n\n");
  const { html, text } = renderEmailLayout({
    origin: new URL(input.link).origin,
    ...(input.lang ? { lang: input.lang } : {}),
    preheader: input.message.slice(0, 120),
    bodyHtml,
    bodyText,
    reason: input.footer,
    ...(input.privacy ? { links: [{ label: input.privacy, href: "/legal" }] } : {}),
  });
  return { to: input.to, subject: input.subject, text, html };
}
