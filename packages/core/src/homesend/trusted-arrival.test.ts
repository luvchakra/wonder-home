import { describe, expect, it } from "vitest";

import { fakeSupabase } from "./testing";
import { trustedSenderVoucher } from "./trusted-arrival";

/**
 * Who vouches for a trusted sender's email when it is added on arrival
 * (14-068 follow-up): the Admin who put the sender on the allowlist, while
 * still an active adult Admin. Anyone else, nobody.
 */
const H = "h1";

function db(over: { allowlist?: Record<string, unknown>[]; members?: Record<string, unknown>[]; roles?: Record<string, unknown>[] } = {}) {
  return fakeSupabase({
    homesend_email_allowlist: over.allowlist ?? [{ household_id: H, kind: "address", value: "office@school.example.org", created_by_member_id: "m-admin", created_at: "2026-11-14T10:00:00Z" }],
    household_members: over.members ?? [
      { id: "m-admin", household_id: H, profile_id: "u-admin", member_type: "adult", status: "active" },
      { id: "m-adult", household_id: H, profile_id: "u-adult", member_type: "adult", status: "active" },
    ],
    household_roles: over.roles ?? [{ household_id: H, member_id: "m-admin", role: "administrator" }],
  }).client;
}

describe("trustedSenderVoucher", () => {
  it("is the Admin who trusted the sender's address", async () => {
    expect(await trustedSenderVoucher(db(), H, "Green Valley <office@school.example.org>")).toEqual({ memberId: "m-admin", profileId: "u-admin" });
  });

  it("matches a trusted domain too, preferring an exact address", async () => {
    const allowlist = [
      { household_id: H, kind: "domain", value: "school.example.org", created_by_member_id: "m-head", created_at: "2026-11-01T10:00:00Z" },
      { household_id: H, kind: "address", value: "office@school.example.org", created_by_member_id: "m-admin", created_at: "2026-11-14T10:00:00Z" },
    ];
    const members = [
      { id: "m-admin", household_id: H, profile_id: "u-admin", member_type: "adult", status: "active" },
      { id: "m-head", household_id: H, profile_id: "u-head", member_type: "adult", status: "active" },
    ];
    const roles = [
      { household_id: H, member_id: "m-admin", role: "administrator" },
      { household_id: H, member_id: "m-head", role: "head" },
    ];
    expect(await trustedSenderVoucher(db({ allowlist, members, roles }), H, "office@school.example.org")).toMatchObject({ memberId: "m-admin" });
    expect(await trustedSenderVoucher(db({ allowlist, members, roles }), H, "fees@school.example.org")).toMatchObject({ memberId: "m-head" });
  });

  it("is nobody when the sender isn't trusted, nobody is named, or that member is no longer an active adult Admin", async () => {
    expect(await trustedSenderVoucher(db(), H, "someone@else.example.org")).toBeNull();
    expect(await trustedSenderVoucher(db(), H, null)).toBeNull();
    expect(await trustedSenderVoucher(db({ allowlist: [{ household_id: H, kind: "address", value: "office@school.example.org", created_by_member_id: null, created_at: "2026-11-14T10:00:00Z" }] }), H, "office@school.example.org")).toBeNull();
    expect(await trustedSenderVoucher(db({ roles: [] }), H, "office@school.example.org")).toBeNull();
    expect(await trustedSenderVoucher(db({ members: [{ id: "m-admin", household_id: H, profile_id: "u-admin", member_type: "adult", status: "removed" }] }), H, "office@school.example.org")).toBeNull();
    // Another household's allowlist never vouches here.
    expect(await trustedSenderVoucher(db(), "h2", "office@school.example.org")).toBeNull();
  });
});
