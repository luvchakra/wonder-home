import { escapeHtml, type OutgoingMail } from "../email/mailer";

/**
 * The email that carries a family member's sign-in link (story 01-010).
 *
 * Every line arrives already in the inviter's language; this only lays it
 * out. One warm sentence, one button, the link written out for a mail app
 * that strips buttons, and a quiet line saying it can be ignored. Every value
 * is escaped — a household's or a person's name is text, never markup.
 *
 * A mail app reads no CSS variables, so the colours are the light theme's
 * tokens in `ui-theme.css` (background, foreground, muted, subtle, primary)
 * written out as hex — the same values, not new ones.
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
}): OutgoingMail {
  const text = [input.greeting, "", input.message, input.link, "", input.expiry, "", input.footer].join("\n");
  const link = escapeHtml(input.link);
  const html = `<!doctype html>
<html><body style="margin:0;background:#FDFAF3;font-family:Sora,Segoe UI,Arial,sans-serif;color:#111A2F">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FDFAF3;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#FFFFFF;border-radius:20px;padding:28px">
<tr><td style="font-size:20px;font-weight:600;padding-bottom:12px">WonderHome</td></tr>
<tr><td style="font-size:16px;line-height:1.5;padding-bottom:8px">${escapeHtml(input.greeting)}</td></tr>
<tr><td style="font-size:16px;line-height:1.5;padding-bottom:20px">${escapeHtml(input.message)}</td></tr>
<tr><td style="padding-bottom:20px"><a href="${link}" style="display:inline-block;background:#6162F6;color:#FFFFFF;text-decoration:none;font-weight:600;border-radius:12px;padding:12px 20px">${escapeHtml(input.action)}</a></td></tr>
<tr><td style="font-size:13px;line-height:1.5;color:#515E72;word-break:break-all;padding-bottom:12px"><a href="${link}" style="color:#6162F6">${link}</a></td></tr>
<tr><td style="font-size:13px;line-height:1.5;color:#515E72;padding-bottom:12px">${escapeHtml(input.expiry)}</td></tr>
<tr><td style="font-size:12px;line-height:1.5;color:#76818F">${escapeHtml(input.footer)}</td></tr>
</table>
<p style="font-family:Georgia,serif;font-style:italic;color:#76818F;font-size:14px;margin-top:16px">Less mental load. More family time!</p>
</td></tr></table>
</body></html>`;
  return { to: input.to, subject: input.subject, text, html };
}
