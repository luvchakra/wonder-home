/** Pure step-up rules for platform staff: no auth client, safe in tests and on any page. */

/** "reauth": the account has no password, and its last sign-in is too old to count. */
export type StaffPasswordCheck = "ok" | "wrong" | "limited" | "unavailable" | "reauth";

/**
 * How this staff member proves it is them again. An account with a password
 * types it; an account that signs in with Google alone has none, so it signs
 * in with Google again and has ten minutes from then (owner, 2026-11-20: the
 * owner's account is Google-only, and "Your password" could never match).
 */
export type StaffStepUp = { method: "password" } | { method: "google"; freshUntil: string | null };

export const STEP_UP_FRESH_MS = 10 * 60 * 1000;

type Amr = { method?: unknown; timestamp?: unknown };

/** Pure: the newest sign-in time in a session's `amr` claim, in milliseconds. */
export function lastSignInMs(amr: unknown): number | null {
  if (!Array.isArray(amr)) return null;
  const times = (amr as Amr[]).map((entry) => (typeof entry?.timestamp === "number" ? entry.timestamp * 1000 : null)).filter((value): value is number => value !== null);
  return times.length ? Math.max(...times) : null;
}

/** Pure: which proof an account can give, from its sign-in providers and its session's sign-in time. */
export function stepUpFor(providers: readonly string[], signedInAtMs: number | null, now = Date.now()): StaffStepUp {
  if (providers.includes("email")) return { method: "password" };
  const freshUntil = signedInAtMs !== null && now - signedInAtMs < STEP_UP_FRESH_MS ? new Date(signedInAtMs + STEP_UP_FRESH_MS).toISOString() : null;
  return { method: "google", freshUntil };
}

/** The words for a refused step-up; "Nothing was changed" is the caller's ending. */
export function stepUpRefusal(check: Exclude<StaffPasswordCheck, "ok">): string {
  switch (check) {
    case "limited":
      return "Too many attempts. Wait a moment, then try again.";
    case "unavailable":
      return "We couldn't check it's you just now. Nothing was changed.";
    case "reauth":
      return "You sign in with Google, so there's no password to type. Tap “Confirm with Google”, then save within ten minutes. Nothing was changed.";
    default:
      return "That isn't your WonderHome password. Nothing was changed.";
  }
}
