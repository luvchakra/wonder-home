import { runtimeEnv, type Env } from "../platform/settings/runtime-env";

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
 *   2. "Sign in with Google" on in Platform admin → Configuration → Features
 *      (until saved there, NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true in Vercel).
 *
 * Read on the server only; the pages pass the answer down as a prop.
 */
export function googleAuthEnabled(env: Env = runtimeEnv()): boolean {
  return switchedOn(env.WONDERHOME_GOOGLE_SIGN_IN, env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED);
}

/**
 * Whether sign-in by phone (a one-time code by SMS) is offered (story 01-011).
 * Like Google, it is the operator's to turn on, in two steps:
 *   1. Phone enabled in Supabase Auth, with an SMS provider (Twilio,
 *      MessageBird, Vonage or Textlocal) and its credentials.
 *   2. "Sign in with a phone number" on in Platform admin (until saved there,
 *      NEXT_PUBLIC_PHONE_AUTH_ENABLED=true in Vercel).
 * Until then no screen offers it, so nobody waits for a code that never comes.
 */
export function phoneAuthEnabled(env: Env = runtimeEnv()): boolean {
  return switchedOn(env.WONDERHOME_PHONE_SIGN_IN, env.NEXT_PUBLIC_PHONE_AUTH_ENABLED);
}

/** Platform admin's on/off wins; until it is saved, the old build-time variable's "true" (2026-11-22). */
function switchedOn(saved: string | undefined, legacy: string | undefined): boolean {
  if (saved === "on") return true;
  if (saved === "off") return false;
  return legacy === "true";
}
