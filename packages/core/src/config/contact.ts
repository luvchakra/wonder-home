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
