import "server-only";

import { createIsolatedClient } from "@wonderhome/core/db/isolated";
import { createClient } from "@wonderhome/core/db/server";
import { log } from "@wonderhome/core/observability/logger";

import { lastSignInMs, stepUpFor, type StaffPasswordCheck, type StaffStepUp } from "./platform-step-up-rules";

export type { StaffPasswordCheck, StaffStepUp } from "./platform-step-up-rules";

async function signedIn() {
  const supabase = await createClient();
  const [{ data: userData }, { data: claimData }] = await Promise.all([supabase.auth.getUser(), supabase.auth.getClaims()]);
  const user = userData.user;
  if (!user) return null;
  const providers = (user.identities ?? []).map((identity) => identity.provider);
  const fallback = Array.isArray(user.app_metadata?.providers) ? (user.app_metadata.providers as string[]) : [];
  return { email: user.email ?? null, stepUp: stepUpFor(providers.length ? providers : fallback, lastSignInMs(claimData?.claims?.amr)) };
}

/** What the screen offers: a password field, or "Confirm with Google". */
export async function staffStepUp(): Promise<StaffStepUp> {
  try {
    return (await signedIn())?.stepUp ?? { method: "password" };
  } catch {
    return { method: "password" };
  }
}

/**
 * Re-authentication for a platform staff member before a destructive action.
 * With a password, the proof is that password, checked server-side against
 * Supabase on a throwaway client (the same way the household step-up does,
 * `security/step-up-repository.ts`), so the caller's session is untouched;
 * Supabase rate limits sign-in itself and a 429 comes back as "limited".
 * Without one (Google only), the proof is a Google sign-in in the last ten
 * minutes, read from the verified session's own `amr` claim.
 */
export async function confirmStaffPassword(password: string): Promise<StaffPasswordCheck> {
  try {
    const account = await signedIn();
    if (!account?.email) return "wrong";
    if (account.stepUp.method === "google") return account.stepUp.freshUntil ? "ok" : "reauth";
    if (!password) return "wrong";
    const client = createIsolatedClient();
    const { error } = await client.auth.signInWithPassword({ email: account.email, password });
    if (error) return error.status === 429 ? "limited" : "wrong";
    await client.auth.signOut({ scope: "local" }).catch(() => undefined);
    return "ok";
  } catch {
    log.warn("platform step-up unavailable", { event: "platform_step_up_unavailable", allow: ["event"] });
    return "unavailable";
  }
}
