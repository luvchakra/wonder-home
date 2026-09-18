/**
 * How people can reach the team behind this deployment.
 *
 * Same discipline as social sign-in: a "Contact us" button that opens a mail
 * client addressed to nobody is worse than a section that offers a route
 * which actually works. So the address is configuration, and where it is
 * absent the contact section offers the in-product routes instead of a dead
 * mailto.
 *
 * Set NEXT_PUBLIC_CONTACT_EMAIL on the deployment to switch it on.
 */
export function contactEmail(): string | null {
  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();
  return email && email.includes("@") ? email : null;
}
