import { describe, expect, it } from "vitest";

import {
  MAX_ATTEMPTS,
  STEP_UP_PURPOSES,
  VALID_MINUTES,
  checkStepUp,
  describePurpose,
  expiryFor,
  mayAttempt,
  type AttemptRecord,
  type Verification,
} from "./step-up";

/**
 * Step-up verification (story 15-007).
 *
 * Release-blocking: every case here is one where letting something through
 * means money moving, or data leaving, on a proof that should not have counted.
 */

const NOW = new Date("2026-09-19T12:00:00.000Z");

function proof(overrides: Partial<Verification> = {}): Verification {
  return {
    purpose: "export",
    verifiedAt: new Date("2026-09-19T11:55:00.000Z"),
    expiresAt: new Date("2026-09-19T12:10:00.000Z"),
    consumedAt: null,
    ...overrides,
  };
}

describe("whether a proof still stands", () => {
  it("accepts a fresh, unspent proof of the right thing", () => {
    expect(checkStepUp(proof(), "export", NOW)).toEqual({ ok: true });
  });

  it("refuses when there is no proof at all", () => {
    expect(checkStepUp(null, "export", NOW)).toMatchObject({ ok: false, code: "missing" });
  });

  it("refuses a proof of something else, however fresh", () => {
    // The dangerous case: confirming a password to export data must never also
    // authorise a payment sitting in another tab.
    expect(checkStepUp(proof({ purpose: "export" }), "payment", NOW)).toMatchObject({
      ok: false,
      code: "wrong_purpose",
    });
  });

  it("checks the purpose before the freshness", () => {
    // A fresh proof of the wrong thing is the more dangerous mistake, so it is
    // the one reported.
    const stale = proof({ purpose: "export", expiresAt: new Date("2026-09-19T11:00:00.000Z") });
    expect(checkStepUp(stale, "payment", NOW)).toMatchObject({ code: "wrong_purpose" });
  });

  it("refuses a proof that has already been spent", () => {
    expect(checkStepUp(proof({ consumedAt: NOW }), "export", NOW)).toMatchObject({
      ok: false,
      code: "spent",
    });
  });

  it("refuses a proof that has expired", () => {
    const expired = proof({ expiresAt: new Date("2026-09-19T11:59:59.000Z") });
    expect(checkStepUp(expired, "export", NOW)).toMatchObject({ ok: false, code: "stale" });
  });

  it("treats the exact moment of expiry as expired", () => {
    expect(checkStepUp(proof({ expiresAt: NOW }), "export", NOW)).toMatchObject({ code: "stale" });
  });

  it("never explains itself in a way that helps a guess", () => {
    // "Missing" and "wrong purpose" say the same thing to the person in front
    // of the screen: confirm yourself. Neither confirms what does exist.
    const missing = checkStepUp(null, "payment", NOW);
    const wrong = checkStepUp(proof(), "payment", NOW);
    expect(missing.ok).toBe(false);
    expect(wrong.ok).toBe(false);
    if (missing.ok || wrong.ok) return;
    expect(missing.reason).toBe(wrong.reason);
  });
});

describe("how long a proof lasts", () => {
  it("gives every purpose a window", () => {
    for (const purpose of STEP_UP_PURPOSES) {
      expect(VALID_MINUTES[purpose], purpose).toBeGreaterThan(0);
    }
  });

  it("gives payments the shortest window, because they cannot be undone", () => {
    const others = STEP_UP_PURPOSES.filter((purpose) => purpose !== "payment");
    for (const purpose of others) {
      expect(VALID_MINUTES.payment).toBeLessThanOrEqual(VALID_MINUTES[purpose]);
    }
  });

  it("expires ahead of now, by the purpose's window", () => {
    expect(expiryFor("payment", NOW).getTime() - NOW.getTime()).toBe(VALID_MINUTES.payment * 60_000);
  });

  it("names what is being confirmed, for every purpose", () => {
    for (const purpose of STEP_UP_PURPOSES) {
      // "Confirm your password" with no object is how people confirm things
      // they did not mean to.
      expect(describePurpose(purpose).length, purpose).toBeGreaterThan(10);
    }
  });
});

describe("the attempt limit", () => {
  const at = (minutesAgo: number, ok: boolean): AttemptRecord => ({
    at: new Date(NOW.getTime() - minutesAgo * 60_000),
    ok,
  });

  it("allows the first attempt", () => {
    expect(mayAttempt([], NOW)).toEqual({ allowed: true, remaining: MAX_ATTEMPTS });
  });

  it("counts down with each recent failure", () => {
    expect(mayAttempt([at(1, false), at(2, false)], NOW)).toEqual({
      allowed: true,
      remaining: MAX_ATTEMPTS - 2,
    });
  });

  it("closes the door after the limit", () => {
    const failures = Array.from({ length: MAX_ATTEMPTS }, (_, index) => at(index + 1, false));
    const decision = mayAttempt(failures, NOW);

    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.retryAfterMinutes).toBeGreaterThan(0);
    expect(decision.reason).toContain("Too many attempts");
  });

  it("forgets failures once somebody gets it right", () => {
    // Mistyping twice this morning must not lock somebody out this evening.
    const attempts = [at(10, false), at(9, false), at(8, false), at(7, false), at(6, true), at(1, false)];
    expect(mayAttempt(attempts, NOW)).toEqual({ allowed: true, remaining: MAX_ATTEMPTS - 1 });
  });

  it("forgets failures once they are old enough", () => {
    const old = Array.from({ length: MAX_ATTEMPTS }, (_, index) => at(60 + index, false));
    expect(mayAttempt(old, NOW)).toMatchObject({ allowed: true });
  });

  it("counts only the window, not everything ever", () => {
    const mixed = [
      ...Array.from({ length: MAX_ATTEMPTS }, (_, index) => at(120 + index, false)),
      at(1, false),
    ];
    expect(mayAttempt(mixed, NOW)).toEqual({ allowed: true, remaining: MAX_ATTEMPTS - 1 });
  });
});
