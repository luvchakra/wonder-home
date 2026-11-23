import { runtimeEnv, type Env } from "../platform/settings/runtime-env";

/**
 * How people can reach the team behind this deployment.
 *
 * Same discipline as social sign-in: a "Contact us" button that opens a mail
 * client addressed to nobody is worse than a section that offers a route
 * which actually works. So the address is configuration, and where it is
 * absent the contact section offers the in-product routes instead of a dead
 * mailto.
 *
 * Set "Public contact email" in Platform admin → Integrations → Email to
 * switch it on (until saved there, NEXT_PUBLIC_CONTACT_EMAIL in Vercel).
 */
export function contactEmail(env: Env = runtimeEnv()): string | null {
  const email = (env.WONDERHOME_CONTACT_EMAIL?.trim() || env.NEXT_PUBLIC_CONTACT_EMAIL?.trim());
  return email && email.includes("@") ? email : null;
}

/**
 * The company site WonderHome links to as "WonderApps", or null when none is set.
 *
 * Empty by default (owner, 2026-11-23: "Wonder-Apps will remain disabled for now"):
 * a link to a site that is down is a dead end, so with no address the pages name
 * WonderApps without linking it, or point at the in-app "Who runs WonderHome"
 * section instead. Set "Company website" in Platform admin → Integrations → Email.
 */
export function companySiteUrl(env: Env = runtimeEnv()): string | null {
  const url = env.WONDERHOME_COMPANY_SITE_URL?.trim();
  return url && /^https:\/\/[^\s]+$/.test(url) ? url : null;
}
