/**
 * Step-up verification (story 15-007).
 *
 * Being signed in says who is asking. It does not say that this person, at
 * this moment, agreed to this. A laptop left open in a kitchen is signed in;
 * so is a session somebody walked away from an hour ago. For anything whose
 * cost is not recoverable — money leaving, data leaving, a person being
 * removed — the product asks again.
 *
 * This module closes a gap rather than adding a feature. `payment_intents`
 * has carried `step_up_verified_at` since the bills migration, and
 * `finance/payments.ts` refuses to execute without it — but nothing ever set
 * it, because there was nowhere to record a verification and nothing to
 * perform one. A check against a value nobody writes is not a control.
 *
 * Everything here is pure. Whether the password was right is Supabase's
 * question, answered in `step-up-repository.ts`; what a correct answer then
 * entitles somebody to is this module's, and it is answered the same way for
 * every caller.
 */

export const STEP_UP_PURPOSES = ["export", "deletion", "payment", "role_change"] as const;
export type StepUpPurpose = (typeof STEP_UP_PURPOSES)[number];

/**
 * How long a verification is good for, per purpose.
 *
 * Short enough that walking away ends it, long enough to finish the thing.
 * A deletion gets the longest window because the flow that follows it asks
 * the most questions; a payment gets the shortest because it is the one that
 * cannot be undone.
 */
export const VALID_MINUTES: Record<StepUpPurpose, number> = {
  payment: 10,
  export: 15,
  deletion: 20,
  role_change: 10,
};

export type Verification = {
  purpose: StepUpPurpose;
  verifiedAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
};

export type StepUpCheck =
  | { ok: true }
  | { ok: false; code: StepUpRefusal; reason: string };

export type StepUpRefusal = "missing" | "stale" | "spent" | "wrong_purpose";

/**
 * Whether a verification still stands for what is about to happen.
 *
 * Four refusals, and the order is the point: a verification for something
 * else is refused before its freshness is considered, because a fresh proof
 * of the wrong thing is the more dangerous mistake. Confirming a password to
 * export data must never also authorise a payment sitting in another tab.
 */
export function checkStepUp(
  verification: Verification | null,
  purpose: StepUpPurpose,
  now: Date = new Date(),
): StepUpCheck {
  if (!verification) {
    return {
      ok: false,
      code: "missing",
      reason: "Please confirm it is you before we do this.",
    };
  }

  if (verification.purpose !== purpose) {
    return {
      ok: false,
      code: "wrong_purpose",
      reason: "Please confirm it is you before we do this.",
    };
  }

  if (verification.consumedAt) {
    // One proof, one action. A verification that could be replayed is a
    // password typed once and spent for the rest of the day.
    return {
      ok: false,
      code: "spent",
      reason: "That confirmation has already been used. Please confirm again.",
    };
  }

  if (verification.expiresAt <= now) {
    return {
      ok: false,
      code: "stale",
      reason: "That confirmation has expired. Please confirm again.",
    };
  }

  return { ok: true };
}

export function expiryFor(purpose: StepUpPurpose, from: Date = new Date()): Date {
  return new Date(from.getTime() + VALID_MINUTES[purpose] * 60_000);
}

/**
 * What a person is told they are confirming.
 *
 * Named per purpose rather than generic, because "confirm your password" with
 * no object is how people confirm things they did not mean to. Somebody who
 * reads only this sentence should still know what they are agreeing to.
 */
export function describePurpose(purpose: StepUpPurpose): string {
  switch (purpose) {
    case "export":
      return "to send you a copy of your data";
    case "deletion":
      return "to start deleting data";
    case "payment":
      return "to make a payment";
    case "role_change":
      return "to change what somebody in your household may do";
  }
}

/**
 * How many wrong attempts before the door closes for a while.
 *
 * A step-up prompt is a password oracle: it says yes or no to a guess, from
 * inside a session that is already signed in. Without a limit it is a better
 * place to brute-force a password than the sign-in page, which is rate
 * limited by Supabase.
 */
export const MAX_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;

export type AttemptRecord = { at: Date; ok: boolean };

export type AttemptDecision =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterMinutes: number; reason: string };

/**
 * Whether another attempt may be made.
 *
 * Counts only the failures since the last success: getting it right clears
 * the slate, which is what stops a person who mistyped twice this morning
 * being locked out this evening.
 */
export function mayAttempt(
  attempts: readonly AttemptRecord[],
  now: Date = new Date(),
): AttemptDecision {
  const since = new Date(now.getTime() - LOCKOUT_MINUTES * 60_000);
  const recent = attempts.filter((attempt) => attempt.at > since);

  const lastSuccess = recent.reduce<Date | null>(
    (latest, attempt) => (attempt.ok && (!latest || attempt.at > latest) ? attempt.at : latest),
    null,
  );
  const failures = recent.filter((attempt) => !attempt.ok && (!lastSuccess || attempt.at > lastSuccess));

  if (failures.length < MAX_ATTEMPTS) {
    return { allowed: true, remaining: MAX_ATTEMPTS - failures.length };
  }

  const oldest = failures.reduce((earliest, attempt) => (attempt.at < earliest ? attempt.at : earliest), failures[0]!.at);
  const retryAfterMinutes = Math.max(
    1,
    Math.ceil((oldest.getTime() + LOCKOUT_MINUTES * 60_000 - now.getTime()) / 60_000),
  );

  return {
    allowed: false,
    retryAfterMinutes,
    reason: `Too many attempts. Please try again in ${retryAfterMinutes} ${retryAfterMinutes === 1 ? "minute" : "minutes"}.`,
  };
}
