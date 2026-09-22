import { describe, expect, it } from "vitest";

import { generateHomeSendAddress, platformHomeSendEmailDomain } from "./addresses";

describe("platformHomeSendEmailDomain", () => {
  it("is null when unset", () => {
    expect(platformHomeSendEmailDomain({})).toBeNull();
  });

  it("is null for a blank value", () => {
    expect(platformHomeSendEmailDomain({ WONDERHOME_HOMESEND_EMAIL_DOMAIN: "   " })).toBeNull();
  });

  it("reads and trims the configured domain", () => {
    expect(platformHomeSendEmailDomain({ WONDERHOME_HOMESEND_EMAIL_DOMAIN: " inbox.example.com \n" })).toBe("inbox.example.com");
  });
});

describe("generateHomeSendAddress", () => {
  it("produces an hs-<token>@<domain> address, lowercased", () => {
    const address = generateHomeSendAddress("Inbox.Example.COM");
    expect(address).toMatch(/^hs-[0-9a-f]{30}@inbox\.example\.com$/);
  });

  it("is unguessable — two calls never collide in a reasonable sample", () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateHomeSendAddress("inbox.example.com")));
    expect(seen.size).toBe(200);
  });
});
