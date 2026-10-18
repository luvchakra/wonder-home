import { describe, expect, it, vi } from "vitest";

import { claimMembers, claimMembersByPhone, formatPhone, normalPhone } from "./member-phone";

describe("member phone numbers", () => {
  it("keeps every way an Indian number is written as one E.164 number", () => {
    for (const typed of ["98765 43210", "098765-43210", "+91 98765 43210", "0091 9876543210", "(+91) 98765.43210", "9876543210"]) {
      expect(normalPhone(typed)).toBe("+919876543210");
    }
  });

  it("needs a country code for any other number, and refuses what isn't a number", () => {
    expect(normalPhone("+44 20 7946 0958")).toBe("+442079460958");
    expect(normalPhone("2079460958")).toBeNull();
    expect(normalPhone("12345")).toBeNull();
    expect(normalPhone("call me")).toBeNull();
    expect(normalPhone("+0 123 456 789")).toBeNull();
    expect(normalPhone("")).toBeNull();
  });

  it("shows an Indian number in its usual groups", () => {
    expect(formatPhone("+919876543210")).toBe("+91 98765 43210");
    expect(formatPhone("+442079460958")).toBe("+442079460958");
  });

  it("claiming never fails a sign-in, and a sign-in claims by email and by phone", async () => {
    const failing = { rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST" } }) };
    expect(await claimMembersByPhone(failing as never)).toBe(0);
    const linked = {
      rpc: vi.fn((name: string) => Promise.resolve({ data: name === "claim_members_by_phone" ? [{ household_id: "h", member_id: "m" }] : [], error: null })),
    };
    expect(await claimMembers(linked as never)).toBe(1);
    expect(linked.rpc).toHaveBeenCalledWith("claim_members_by_email");
    expect(linked.rpc).toHaveBeenCalledWith("claim_members_by_phone");
  });
});
