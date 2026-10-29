"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { googleAuthEnabled, phoneAuthEnabled } from "@wonderhome/core/config/auth-providers";
import { claimMembers, formatPhone, normalPhone } from "@wonderhome/core/identity/member-phone";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { createClient } from "@wonderhome/core/db/server";
import { clientIpFromHeaders, hashClientIp } from "@wonderhome/core/homesend/rate-limit";
import { recordOnboardingEvent, startOnboarding } from "@wonderhome/core/household/onboarding-repository";
import { createHousehold } from "@wonderhome/core/identity/households";
import { createHouseholdSchema } from "@wonderhome/core/identity/schemas";
import { signOut as sharedSignOut } from "@wonderhome/core/identity/session-actions";
import { log } from "@wonderhome/core/observability/logger";
import { hitRateLimit, rateLimitMessage } from "@wonderhome/core/security/rate-limit";
import { sameSitePath } from "@wonderhome/core/security/same-site-path";

/**
 * Authentication and onboarding actions.
 *
 * No backlog story covers sign-in, sign-up or household creation UI, but story
 * 01-001 requires an authenticated creator, so the smallest honest version of
 * those surfaces lives here. Recorded in design/DESIGN-NOTES.md as a spec gap.
 *
 * Failures return a message rather than throwing: an auth screen that 500s
 * tells the person nothing about what to do next.
 */

/** `error` is something that went wrong; `notice` is something that went right. */
export type ActionState = { error?: string; notice?: string };

const credentialsSchema = z.object({
  email: z.email({ error: "Enter a valid email address." }),
  password: z.string().min(8, { error: "Use at least 8 characters." }),
});

const signUpSchema = credentialsSchema.extend({
  displayName: z.string().trim().min(1, { error: "Tell us what to call you." }).max(80),
});

/**
 * Whether this address may try once more (`auth.attempt`, per hashed address).
 * A throttle, not a gate: with no address or no counter it lets the attempt
 * through, and Supabase Auth's own limits still stand behind it.
 */
async function authAttemptAllowed(): Promise<boolean> {
  const ip = clientIpFromHeaders(await headers());
  if (!ip) return true;
  try {
    return await hitRateLimit(createAdminClient(), "auth.attempt", hashClientIp(ip));
  } catch {
    return true;
  }
}

const AUTH_PAUSED = rateLimitMessage("auth.attempt");

/** The one message both failure modes return, so neither reveals which it was. */
const SIGN_IN_FAILED = "That email and password did not match. Please try again.";

export async function signIn(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: SIGN_IN_FAILED };
  if (!(await authAttemptAllowed())) return { error: AUTH_PAUSED };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    log.warn("sign-in rejected", { reason: error.code ?? "unknown" });
    return { error: SIGN_IN_FAILED };
  }

  // A family member the household recorded with this email becomes that member now.
  await claimMembers(supabase);
  redirect(safeNext(formData.get("next")));
}

export async function signUp(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  }
  if (!(await authAttemptAllowed())) return { error: AUTH_PAUSED };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { display_name: parsed.data.displayName } },
  });

  if (error) {
    log.warn("sign-up rejected", { reason: error.code ?? "unknown" });
    return { error: "We could not create that account. Try a different email address." };
  }

  // With email confirmation switched on there is no session yet; say so rather
  // than dropping the person on a gated page that bounces them straight back.
  // This is a notice, not a failure: nothing went wrong, and showing it in the
  // red of an error made a normal sign-up look like a rejection.
  if (!data.session) {
    return { notice: "Check your email to confirm your address, then sign in." };
  }

  redirect("/welcome");
}

const emailSchema = z.object({ email: z.email({ error: "Enter a valid email address." }) });

/**
 * The one answer a password reset request ever gives.
 *
 * It is the same whether or not the address has an account, because the
 * alternative is an endpoint that tells anybody who asks which of their
 * guesses are real people. Sign-in already holds this line; so does this.
 */
const RESET_REQUESTED =
  "If that address has a WonderHome account, a link to set a new password is on its way. It expires in an hour.";

export async function requestPasswordReset(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Enter a valid email address." };
  if (!(await authAttemptAllowed())) return { error: AUTH_PAUSED };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    // Supabase sends the person here with a one-time code; the callback
    // exchanges it for a session and hands them to the form.
    redirectTo: `${await siteOrigin()}/auth/callback?next=%2Freset-password`,
  });

  // A failure is logged and never shown: the message must not differ by
  // outcome, or it becomes the enumeration oracle the wording avoids.
  if (error) log.warn("password reset request failed", { reason: error.code ?? "unknown" });

  return { notice: RESET_REQUESTED };
}

const newPasswordSchema = z
  .object({
    password: z.string().min(8, { error: "Use at least 8 characters." }),
    confirm: z.string(),
  })
  .refine((value) => value.password === value.confirm, {
    error: "Those two passwords do not match.",
    path: ["confirm"],
  });

/**
 * Sets a new password for whoever holds the recovery session.
 *
 * There is no "current password" field and there does not need to be: the
 * recovery link *is* the proof, and it only reaches the address on the
 * account. Without that session Supabase refuses the update, which is the
 * check that matters — so an expired or reused link cannot change anything.
 */
export async function resetPassword(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = newPasswordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    log.warn("password reset rejected", { reason: error.code ?? "unknown" });
    return {
      error:
        "That link has expired or has already been used. Ask for a new one and try again.",
    };
  }

  redirect("/");
}

/**
 * Starts the Google redirect, when Google is configured for this deployment.
 *
 * The flag is checked here as well as in the pages that render the button:
 * a hidden button is presentation, and a server action is reachable without
 * one.
 */
/** The phone sign-in's two steps: the number, then the code texted to it. */
export type PhoneSignInState = ActionState & { phone?: string };

const PHONE_UNAVAILABLE = "Signing in by phone isn't available here yet. Use your email, or ask your household's Admin for an invite link.";

/**
 * Step one of signing in by phone (story 01-011): text a one-time code to the
 * number. Supabase sends it and limits how often; a number with no account
 * yet gets one, which becomes the household's member recorded with that
 * number once the code is verified. Nothing is said about whether the number
 * belongs to anyone.
 */
/** Form fields of the two phone steps: always a string, capped before anything reads it (an absent field is ""). */
const phoneField = z.preprocess((value) => (typeof value === "string" ? value.slice(0, 64) : ""), z.string());
const codeField = z.preprocess((value) => (typeof value === "string" ? value.slice(0, 32) : ""), z.string());

export async function sendPhoneCode(_previous: PhoneSignInState, formData: FormData): Promise<PhoneSignInState> {
  if (!phoneAuthEnabled()) return { error: PHONE_UNAVAILABLE };
  const phone = normalPhone(phoneField.parse(formData.get("phone")));
  if (!phone) return { error: "Enter your phone number. An Indian number works as it is; add the country code for any other (+44…)." };
  if (!(await authAttemptAllowed())) return { error: AUTH_PAUSED };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ phone });
  if (error) {
    log.warn("phone code not sent", { reason: error.code ?? "unknown" });
    // No SMS provider is connected in Supabase Auth yet: say so, not "check the number".
    if (error.code === "phone_provider_disabled") return { error: PHONE_UNAVAILABLE };
    return { error: error.code === "over_sms_send_rate_limit" ? "Too many codes were asked for. Wait a minute, then try again." : "The code could not be sent. Check the number and try again." };
  }
  return { phone, notice: `We texted a code to ${formatPhone(phone)}.` };
}

/** Step two: the code. A verified number becomes the member recorded with it. */
export async function verifyPhoneCode(previous: PhoneSignInState, formData: FormData): Promise<PhoneSignInState> {
  if (!phoneAuthEnabled()) return { error: PHONE_UNAVAILABLE };
  const phone = normalPhone(phoneField.parse(formData.get("phone")));
  const token = codeField.parse(formData.get("code")).replace(/\s+/g, "");
  if (!phone) return { error: "Start again with your phone number." };
  if (!/^[0-9]{4,10}$/.test(token)) return { ...previous, phone, error: "Enter the code from the text message." };
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });
  if (error) {
    log.warn("phone code rejected", { reason: error.code ?? "unknown" });
    return { phone, error: "That code didn't work. It may have expired — ask for a new one." };
  }
  // A member the household recorded with this number becomes this account now.
  await claimMembers(supabase);
  redirect(safeNext(formData.get("next")));
}

export async function signInWithGoogle(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!googleAuthEnabled()) {
    return { error: "Google sign-in is not available on this deployment." };
  }

  const next = safeNext(formData.get("next"));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${await siteOrigin()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error || !data.url) {
    log.warn("google sign-in could not start", { reason: error?.code ?? "no-url" });
    return { error: "Google sign-in could not be started. Try again, or use your email address." };
  }

  redirect(data.url);
}

/**
 * Where this deployment lives, for the links Supabase mails out.
 *
 * Taken from the request rather than configuration so that a preview
 * deployment mails links back to itself instead of to production.
 */
async function siteOrigin(): Promise<string> {
  const incoming = await headers();
  const origin = incoming.get("origin");
  if (origin) return origin;

  const host = incoming.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  return `${protocol}://${host}`;
}

/** Now shared, so the nav drawer's own logout row can form-post the same action. */
export const signOut = sharedSignOut;

export async function createHouseholdAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = createHouseholdSchema.safeParse({
    householdName: formData.get("householdName"),
    displayName: formData.get("displayName"),
    timezone: formData.get("timezone") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  }

  const supabase = await createClient();
  let created: { householdId: string; memberId: string };
  try {
    created = await createHousehold(supabase, parsed.data);
  } catch (error) {
    log.error("household creation failed", { reason: error instanceof Error ? error.name : "unknown" });
    return { error: "We could not create the household. Please try again." };
  }

  // Straight into guided setup (story 02-009). If starting it fails, the
  // household still exists and setup starts itself on the first press.
  try {
    await startOnboarding(supabase, created);
    await recordOnboardingEvent(supabase, { householdId: created.householdId, event: "onboarding_started", step: "welcome" });
  } catch (error) {
    log.warn("onboarding not started", { reason: error instanceof Error ? error.name : "unknown" });
  }

  redirect("/onboarding");
}

/** Only same-site paths are honoured, so ?next= cannot become an open redirect. */
function safeNext(value: FormDataEntryValue | null): string {
  return sameSitePath(value) ?? "/";
}
