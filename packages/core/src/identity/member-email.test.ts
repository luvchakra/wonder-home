import { describe, expect, it, vi } from "vitest";

import { claimMembersByEmail, isEmail, normalEmail } from "./member-email";

describe("member sign-in email", () => {
  it("is matched lower case and trimmed, as the table stores it", () => {
    expect(normalEmail("  Asha@Example.COM ")).toBe("asha@example.com");
    expect(isEmail("asha@example.com")).toBe(true);
    expect(isEmail("asha@example")).toBe(false);
    expect(isEmail("not an email")).toBe(false);
  });

  it("claiming never fails a sign-in: an error links nothing and says so with a zero", async () => {
    const failing = { rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST" } }) };
    expect(await claimMembersByEmail(failing as never)).toBe(0);
    const linked = { rpc: vi.fn().mockResolvedValue({ data: [{ household_id: "h", member_id: "m" }], error: null }) };
    expect(await claimMembersByEmail(linked as never)).toBe(1);
    expect(linked.rpc).toHaveBeenCalledWith("claim_members_by_email");
  });
});
