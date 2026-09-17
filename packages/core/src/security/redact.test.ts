// lint-secrets: fixtures — the credential-shaped values below are fakes,
// present precisely to prove they are redacted rather than logged.
import { describe, expect, it } from "vitest";

import { REDACTED, redact } from "./redact";

describe("redact", () => {
  it("removes credentials by key name", () => {
    expect(
      redact({ userId: "u-1", service_role_key: "sb_secret_abc", authorization: "Bearer xyz" }),
    ).toEqual({ userId: "u-1", service_role_key: REDACTED, authorization: REDACTED });
  });

  it("removes private household content by key name", () => {
    expect(redact({ outcomeId: "o-1", transcript: "Sunita won't be here tomorrow" })).toEqual({
      outcomeId: "o-1",
      transcript: REDACTED,
    });
  });

  it("catches a credential embedded in a free-text string", () => {
    const out = redact({
      note_id: "n-1",
      detail: "failed connecting to postgresql://user:hunter2@db:5432/app",
    }) as Record<string, string>;
    expect(out.detail).not.toContain("hunter2");
    expect(out.detail).toContain(REDACTED);
  });

  it("catches a JWT anywhere in a message", () => {
    const out = redact("token eyJhbGciOiJIUzI1NiJ9.eyJyZWYiOiJhYmMifQ.c2lnbmF0dXJl here") as string;
    expect(out).not.toContain("eyJhbGciOi");
  });

  it("walks nested structures and arrays", () => {
    expect(
      redact({ runs: [{ agent: "planner", prompt: "private household context" }] }),
    ).toEqual({ runs: [{ agent: "planner", prompt: REDACTED }] });
  });

  it("keeps explicitly allowed keys", () => {
    expect(redact({ email: "a@b.test" }, { allow: ["email"] })).toEqual({ email: "a@b.test" });
  });

  it("stops at a depth limit instead of recursing forever", () => {
    const deep = { a: { b: { c: { d: { e: { f: { g: "x" } } } } } } };
    expect(JSON.stringify(redact(deep, { maxDepth: 3 }))).toContain(REDACTED);
  });
});
