import { describe, expect, it } from "vitest";

import { lastSignInMs, stepUpFor, stepUpRefusal, STEP_UP_FRESH_MS } from "./platform-step-up-rules";

const NOW = Date.parse("2026-11-20T10:00:00Z");

describe("platform staff step-up", () => {
  it("asks an account with a password for its password", () => {
    expect(stepUpFor(["email", "google"], NOW - 60_000, NOW)).toEqual({ method: "password" });
  });

  it("lets a Google-only account confirm by a sign-in in the last ten minutes, and no older", () => {
    expect(stepUpFor(["google"], NOW - 60_000, NOW)).toEqual({ method: "google", freshUntil: new Date(NOW - 60_000 + STEP_UP_FRESH_MS).toISOString() });
    expect(stepUpFor(["google"], NOW - STEP_UP_FRESH_MS - 1, NOW)).toEqual({ method: "google", freshUntil: null });
    expect(stepUpFor(["google"], null, NOW)).toEqual({ method: "google", freshUntil: null });
  });

  it("reads the newest sign-in from the session's amr claim", () => {
    expect(lastSignInMs([{ method: "oauth", timestamp: 100 }, { method: "otp", timestamp: 200 }])).toBe(200_000);
    expect(lastSignInMs(undefined)).toBeNull();
    expect(lastSignInMs([{ method: "oauth" }])).toBeNull();
  });

  it("says plainly what went wrong", () => {
    expect(stepUpRefusal("wrong")).toBe("That isn't your WonderHome password. Nothing was changed.");
    expect(stepUpRefusal("reauth")).toContain("Confirm with Google");
  });
});
