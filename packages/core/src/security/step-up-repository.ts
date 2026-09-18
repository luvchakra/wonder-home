import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import { createAdminClient } from "../db/admin";
import { log } from "../observability/logger";
import {
  checkStepUp,
  expiryFor,
  mayAttempt,
  type AttemptRecord,
  type StepUpPurpose,
  type Verification,
} from "./step-up";

/**
 * Performing and spending a step-up verification (story 15-007).
 *
 * The proof is the account's own password, checked against Supabase. There is
 * no MFA on these accounts yet and no working transactional mail, so an
 * emailed nonce would be a control that silently never arrives — and a control
 * that cannot complete is worse than one that is honestly absent, because the
 * screens still claim it.
 *
 * Three things make this a real check rather than a ritual:
 *
 *   - It is verified **server-side**, against Supabase, on a throwaway client.
 *     Signing in on the shared browser client would rotate the caller's
 *     session mid-request.
 *   - It is **written by the server**. `step_up_verifications` has no insert
 *     policy: a client that could write one could hand itself the very thing
 *     the check exists to require.
 *   - It is **spent when used**. One proof, one action.
 */

type Row = Record<string, unknown>;

/**
 * Checks a password without disturbing the caller's session.
 *
 * `signInWithPassword` on the request-scoped client would issue new tokens and
 * write new cookies, logging the person into the session they are already in
 * and invalidating the one the rest of the request is using. So this runs on a
 * client with no session persistence at all: it exists to return true or false
 * and is thrown away.
 */
async function passwordIsCorrect(
  email: string,
  password: string,
  createIsolatedClient: () => SupabaseClient,
): Promise<boolean> {
  const client = createIsolatedClient();
  const { error } = await client.auth.signInWithPassword({ email, password });

  if (error) {
    // Supabase rate limits this itself; a 429 is not a wrong password, and
    // reporting it as one would tell somebody their password had changed.
    if (error.status === 429) {
      throw new ApiError("rate_limited", "Too many attempts. Please wait a moment.");
    }
    return false;
  }

  // Do not leave the throwaway session alive on the auth server.
  await client.auth.signOut({ scope: "local" }).catch(() => undefined);
  return true;
}

export type StepUpResult =
  | { ok: true; expiresAt: Date }
  | { ok: false; reason: string; remaining: number | null };

/**
 * Verifies a person and records the proof.
 *
 * Every outcome is written, successful or not, because the lockout can only
 * count attempts somebody wrote down.
 */
export async function verifyStepUp(
  supabase: SupabaseClient,
  input: {
    householdId: string;
    memberId: string;
    email: string;
    password: string;
    purpose: StepUpPurpose;
    createIsolatedClient: () => SupabaseClient;
  },
  now: Date = new Date(),
): Promise<StepUpResult> {
  const attempts = await recentAttempts(supabase, input.memberId, now);
  const allowance = mayAttempt(attempts, now);

  if (!allowance.allowed) {
    return { ok: false, reason: allowance.reason, remaining: 0 };
  }

  const correct = await passwordIsCorrect(input.email, input.password, input.createIsolatedClient);
  const expiresAt = expiryFor(input.purpose, now);

  await record(input.householdId, input.memberId, input.purpose, correct, now, expiresAt);

  if (!correct) {
    const remaining = allowance.remaining - 1;
    return {
      ok: false,
      // Deliberately not "wrong password": the person is already signed in, so
      // the only new information this sentence can carry is whether a guess
      // was right.
      reason:
        remaining > 0
          ? `That did not match. ${remaining} ${remaining === 1 ? "try" : "tries"} left.`
          : "That did not match. Please wait before trying again.",
      remaining: Math.max(remaining, 0),
    };
  }

  return { ok: true, expiresAt };
}

async function record(
  householdId: string,
  memberId: string,
  purpose: StepUpPurpose,
  ok: boolean,
  now: Date,
  expiresAt: Date,
): Promise<void> {
  const { error } = await createAdminClient().from("step_up_verifications").insert({
    household_id: householdId,
    member_id: memberId,
    purpose,
    outcome: ok ? "verified" : "failed",
    verified_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  });

  if (error) {
    // A failure that cannot be written is a failure that cannot be counted, so
    // it is loud. The caller still gets its answer: refusing the action would
    // punish the person for our outage.
    log.error("step-up verification not recorded", {
      purpose,
      reason: error.code ?? "unknown",
      allow: ["purpose", "reason"],
    });
  }
}

async function recentAttempts(
  supabase: SupabaseClient,
  memberId: string,
  now: Date,
): Promise<AttemptRecord[]> {
  const since = new Date(now.getTime() - 60 * 60_000).toISOString();
  const { data, error } = await supabase
    .from("step_up_verifications")
    .select("outcome, verified_at")
    .eq("member_id", memberId)
    .gte("verified_at", since)
    .order("verified_at", { ascending: false })
    .limit(50);

  // Unreadable history means an unknown number of attempts. Treating that as
  // "none so far" is the failure mode an attacker would want, so it is treated
  // as the limit already reached.
  if (error) {
    throw new ApiError("internal", "Could not check recent attempts. Please try again.");
  }

  return ((data as Row[] | null) ?? []).map((row) => ({
    at: new Date(row.verified_at as string),
    ok: row.outcome === "verified",
  }));
}

/**
 * The freshest unspent verification for this purpose, if any.
 *
 * Read with the member's own client: the RLS policy allows a member only their
 * own rows, so somebody else's proof cannot be found even by guessing an id.
 */
export async function latestVerification(
  supabase: SupabaseClient,
  memberId: string,
  purpose: StepUpPurpose,
): Promise<Verification | null> {
  const { data, error } = await supabase
    .from("step_up_verifications")
    .select("id, purpose, verified_at, expires_at, consumed_at")
    .eq("member_id", memberId)
    .eq("purpose", purpose)
    .eq("outcome", "verified")
    .is("consumed_at", null)
    .order("expires_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as Row;
  return {
    purpose: row.purpose as StepUpPurpose,
    verifiedAt: new Date(row.verified_at as string),
    expiresAt: new Date(row.expires_at as string),
    consumedAt: row.consumed_at ? new Date(row.consumed_at as string) : null,
  };
}

/**
 * Requires a fresh proof, and spends it.
 *
 * Deliberately one function rather than a check and a separate consume: two
 * calls is two chances for a caller to do the first and forget the second, and
 * a verification that is checked but never spent is a password typed once and
 * good for the rest of its window.
 *
 * It spends the proof *before* the action rather than after. An action that
 * fails halfway and leaves a live verification behind is one a retry can run
 * without asking again — and the retry might be the part that succeeds.
 */
export async function requireStepUp(
  supabase: SupabaseClient,
  input: { memberId: string; purpose: StepUpPurpose },
  now: Date = new Date(),
): Promise<void> {
  const verification = await latestVerification(supabase, input.memberId, input.purpose);
  const check = checkStepUp(verification, input.purpose, now);

  if (!check.ok) {
    throw new ApiError("forbidden", check.reason, { stepUp: input.purpose, code: check.code });
  }

  const { error } = await createAdminClient()
    .from("step_up_verifications")
    .update({ consumed_at: now.toISOString() })
    .eq("member_id", input.memberId)
    .eq("purpose", input.purpose)
    .eq("outcome", "verified")
    .is("consumed_at", null);

  if (error) {
    // Refusing here is the safe direction: an unspendable proof is one that
    // could be replayed, and the person can simply confirm again.
    throw new ApiError("internal", "Could not confirm that just now. Please try again.");
  }
}
