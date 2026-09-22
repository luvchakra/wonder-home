import { describe, expect, it } from "vitest";

import { signWebhookPayload, verifyWebhookSignature, webhookSignatureHeader } from "./webhook-signing";

const SECRET = "a-very-real-signing-secret";
const BODY = JSON.stringify({ hello: "world" });

describe("signWebhookPayload / verifyWebhookSignature", () => {
  it("round-trips: a signature this module produces verifies against the same body and secret", () => {
    const sig = signWebhookPayload(SECRET, BODY, 1_700_000_000);
    const header = webhookSignatureHeader(sig);
    expect(verifyWebhookSignature(SECRET, BODY, header)).toBe(true);
  });

  it("is deterministic for the same inputs", () => {
    const a = signWebhookPayload(SECRET, BODY, 1_700_000_000);
    const b = signWebhookPayload(SECRET, BODY, 1_700_000_000);
    expect(a.signature).toBe(b.signature);
  });

  it("produces the documented header shape", () => {
    const sig = signWebhookPayload(SECRET, BODY, 1_700_000_000);
    expect(webhookSignatureHeader(sig)).toBe(`t=1700000000,v1=${sig.signature}`);
  });

  it("fails verification against a body that was tampered with after signing", () => {
    const sig = signWebhookPayload(SECRET, BODY, 1_700_000_000);
    const header = webhookSignatureHeader(sig);
    expect(verifyWebhookSignature(SECRET, JSON.stringify({ hello: "tampered" }), header)).toBe(false);
  });

  it("fails verification against the wrong secret", () => {
    const sig = signWebhookPayload(SECRET, BODY, 1_700_000_000);
    const header = webhookSignatureHeader(sig);
    expect(verifyWebhookSignature("a-different-secret", BODY, header)).toBe(false);
  });

  it("fails verification when the timestamp in the header was changed — the timestamp is signed, not just attached", () => {
    const sig = signWebhookPayload(SECRET, BODY, 1_700_000_000);
    const forgedHeader = `t=1700000001,v1=${sig.signature}`;
    expect(verifyWebhookSignature(SECRET, BODY, forgedHeader)).toBe(false);
  });

  it("rejects a header that is not the expected shape", () => {
    expect(verifyWebhookSignature(SECRET, BODY, "not-a-real-header")).toBe(false);
    expect(verifyWebhookSignature(SECRET, BODY, "")).toBe(false);
  });

  it("defaults to the current time when no timestamp is given", () => {
    const before = Math.floor(Date.now() / 1000);
    const sig = signWebhookPayload(SECRET, BODY);
    const after = Math.floor(Date.now() / 1000);
    expect(sig.timestamp).toBeGreaterThanOrEqual(before);
    expect(sig.timestamp).toBeLessThanOrEqual(after);
  });
});
