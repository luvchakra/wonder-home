"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@wonderhome/core/db/server";
import { createHousehold } from "@wonderhome/core/identity/households";
import { createHouseholdSchema } from "@wonderhome/core/identity/schemas";
import { log } from "@wonderhome/core/observability/logger";

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

export type ActionState = { error?: string };

const credentialsSchema = z.object({
  email: z.email({ error: "Enter a valid email address." }),
  password: z.string().min(8, { error: "Use at least 8 characters." }),
});

const signUpSchema = credentialsSchema.extend({
  displayName: z.string().trim().min(1, { error: "Tell us what to call you." }).max(80),
});

/** The one message both failure modes return, so neither reveals which it was. */
const SIGN_IN_FAILED = "That email and password did not match. Please try again.";

export async function signIn(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: SIGN_IN_FAILED };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    log.warn("sign-in rejected", { reason: error.code ?? "unknown" });
    return { error: SIGN_IN_FAILED };
  }

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
  if (!data.session) {
    return { error: "Check your email to confirm your address, then sign in." };
  }

  redirect("/welcome");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

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
  try {
    await createHousehold(supabase, parsed.data);
  } catch (error) {
    log.error("household creation failed", { reason: error instanceof Error ? error.name : "unknown" });
    return { error: "We could not create the household. Please try again." };
  }

  redirect("/");
}

/** Only same-site paths are honoured, so ?next= cannot become an open redirect. */
function safeNext(value: FormDataEntryValue | null): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}
