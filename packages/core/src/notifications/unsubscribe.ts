import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The one-tap link in every notification email that turns email off (story 27-009).
 *
 * The link carries the member id and an HMAC of it, keyed by a server secret
 * and bound to this one purpose, so it can do exactly one thing — switch that
 * person's email channel off — and nobody can make one for someone else. It
 * never expires: an old email in an inbox should still work, and the worst it
 * can do is the thing the person wanted. Turning email back on is a signed-in
 * act in Settings.
 *
 * The secret is `WONDERHOME_LINK_SECRET`, or the deployment's cron secret when
 * that is not set. With neither, there is no link and the message points to
 * Settings instead; the link is never signed with an empty key.
 */
const PURPOSE = "email-off:";

export function unsubscribeSecret(env: Record<string, string | undefined> = process.env): string | null {
  const secret = env.WONDERHOME_LINK_SECRET?.trim() || env.CRON_SECRET?.trim();
  return secret ? secret : null;
}

function sign(memberId: string, secret: string): string {
  return createHmac("sha256", secret).update(PURPOSE + memberId).digest("base64url");
}

/** Whether this token was made for this member. Constant-time. */
export function verifyUnsubscribe(memberId: string, token: string, env: Record<string, string | undefined> = process.env): boolean {
  const secret = unsubscribeSecret(env);
  if (!secret || !/^[0-9a-f-]{36}$/i.test(memberId)) return false;
  const expected = Buffer.from(sign(memberId, secret));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** The link for this member (the API address the mail app's own unsubscribe POSTs to; opened in a browser it goes to the page that asks first), or null when the deployment has no secret to sign it with. */
export function unsubscribeUrl(origin: string, memberId: string, env: Record<string, string | undefined> = process.env): string | null {
  const secret = unsubscribeSecret(env);
  if (!secret) return null;
  return `${origin}/api/v1/notifications/email-off?m=${encodeURIComponent(memberId)}&t=${sign(memberId, secret)}`;
}
