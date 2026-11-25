import { describe, expect, it } from "vitest";

import { deploymentEnvironment, isTestEnvironment, normaliseRecipient, outboundAllowed, testRecipients } from "./environment";

describe("deployment environment", () => {
  it("is production unless marked test", () => {
    expect(deploymentEnvironment({})).toBe("production");
    expect(deploymentEnvironment({ VERCEL_ENV: "production" })).toBe("production");
    expect(deploymentEnvironment({ WONDERHOME_ENV: "test" })).toBe("test");
    expect(deploymentEnvironment({ WONDERHOME_ENV: " Test " })).toBe("test");
  });

  it("fails closed: any Vercel Preview is test even without WONDERHOME_ENV", () => {
    expect(isTestEnvironment({ VERCEL_ENV: "preview" })).toBe(true);
  });
});

describe("outbound guard", () => {
  const test = { WONDERHOME_ENV: "test", WONDERHOME_TEST_RECIPIENTS: "Owner@Example.org, +91 98765 43210" };

  it("lets production send to anyone", () => {
    expect(outboundAllowed("someone@real.example", {})).toBe(true);
    expect(outboundAllowed("+919999999999", { VERCEL_ENV: "production" })).toBe(true);
  });

  it("blocks every recipient on test when the allow-list is empty", () => {
    expect(outboundAllowed("someone@real.example", { WONDERHOME_ENV: "test" })).toBe(false);
    expect(outboundAllowed("+919999999999", { VERCEL_ENV: "preview" })).toBe(false);
    expect(outboundAllowed(null, { WONDERHOME_ENV: "test" })).toBe(false);
  });

  it("lets test reach only allow-listed emails and numbers, however they are written", () => {
    expect(outboundAllowed("owner@example.org", test)).toBe(true);
    expect(outboundAllowed("+919876543210", test)).toBe(true);
    expect(outboundAllowed("other@example.org", test)).toBe(false);
    expect(outboundAllowed("+919876543211", test)).toBe(false);
  });

  it("normalises recipients", () => {
    expect(normaliseRecipient(" A@B.Co ")).toBe("a@b.co");
    expect(normaliseRecipient("+91-98765 43210")).toBe("+919876543210");
    expect([...testRecipients({ WONDERHOME_TEST_RECIPIENTS: "a@b.co;;+1 555 0100" })]).toEqual(["a@b.co", "+15550100"]);
  });
});
