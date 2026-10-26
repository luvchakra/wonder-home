import { describe, expect, it } from "vitest";

import { classifyKeyFailure, failureOf, keyFingerprint } from "./key-alerts";

describe("what a provider's refusal says about the key (the owner, 2026-10-26)", () => {
  it("knows a spent balance", () => {
    expect(classifyKeyFailure("anthropic", 400, '{"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}')).toBe("out_of_credits");
    expect(classifyKeyFailure("openai", 429, '{"error":{"code":"insufficient_quota","message":"You exceeded your current quota"}}')).toBe("out_of_credits");
    expect(classifyKeyFailure("google", 402, "")).toBe("out_of_credits");
  });

  it("reads Google's quota refusal as quota, told only once it lasts (a per-minute limit says the same words)", () => {
    expect(classifyKeyFailure("google", 429, '{"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details.","status":"RESOURCE_EXHAUSTED"}}')).toBe("quota_exhausted");
  });

  it("knows a key that isn't valid", () => {
    expect(classifyKeyFailure("google", 400, "API key not valid. Please pass a valid API key.")).toBe("key_rejected");
    expect(classifyKeyFailure("anthropic", 401, "invalid x-api-key")).toBe("key_rejected");
  });

  it("leaves everything else alone: an overload, a timeout, a bad request", () => {
    expect(classifyKeyFailure("anthropic", 529, "Overloaded")).toBeNull();
    expect(classifyKeyFailure("anthropic", 400, "messages: field required")).toBeNull();
    expect(classifyKeyFailure("openai", 429, "Rate limit reached for requests per min")).toBeNull();
  });

  it("fingerprints a key the way the database does, and reads a thrown SDK error", () => {
    expect(keyFingerprint("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(failureOf({ status: 429, message: "quota" })).toEqual({ status: 429, text: "quota " });
  });
});
