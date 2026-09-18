/**
 * Which sign-in methods this deployment actually offers.
 *
 * `design/DESIGN-NOTES.md` has held one rule about social sign-in since the
 * landing page shipped: a "Continue with Google" button that goes nowhere is
 * worse than none at all. So the button is not a design decision made once —
 * it is a function of whether Google is configured, and it is read in exactly
 * one place so the sign-in page, the sign-up page and the server action that
 * starts the redirect can never disagree about it.
 *
 * Turning it on takes two things, and both are the operator's to do:
 *   1. Google enabled as a provider in the Supabase dashboard, with a Google
 *      Cloud OAuth client's id and secret.
 *   2. NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true on the deployment.
 *
 * The flag is deliberately public: the buttons render in the browser, so the
 * answer has to reach it, and "is Google offered here" is not a secret.
 */
export function googleAuthEnabled(): boolean {
  return process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true";
}
