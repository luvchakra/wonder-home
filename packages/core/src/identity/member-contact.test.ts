import { describe, expect, it, vi } from "vitest";

vi.mock("../api/audit", () => ({ auditChange: vi.fn().mockResolvedValue(undefined) }));

import { CONTACT_PROBLEM, contactLinks, mayEditMemberContact, parseMemberContact, phoneForEditing, setMemberContact } from "./member-contact";
import type { HouseholdMembership } from "./schemas";

function member(memberId: string, roles: string[]): HouseholdMembership {
  return { household: { id: "h1" }, memberId, displayName: "X", memberType: "adult", roles } as unknown as HouseholdMembership;
}

/** A fake client that records what is written to household_member_contacts. */
function client(rows: { member_id: string; email: string | null; phone: string | null; phone_as_typed: string | null }[] = [], readError: { code: string } | null = null) {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const remove = vi.fn(() => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }));
  const from = vi.fn(() => ({
    select: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: readError ? null : rows, error: readError }) }) }),
    upsert,
    delete: remove,
  }));
  return { supabase: { from } as never, upsert, remove };
}

describe("member contact details", () => {
  it("keeps blank as blank and stores a phone as E.164 with what was typed", () => {
    expect(parseMemberContact({ email: "", phone: "" })).toEqual({ ok: true, contact: { email: null, phone: null, phoneAsTyped: null } });
    expect(parseMemberContact({ email: " Asha@Example.com ", phone: "098765-43210" })).toEqual({
      ok: true,
      contact: { email: "asha@example.com", phone: "+919876543210", phoneAsTyped: "098765-43210" },
    });
    expect(parseMemberContact({ email: "", phone: "+44 20 7946 0958" })).toMatchObject({ ok: true, contact: { phone: "+442079460958" } });
  });

  it("refuses what isn't an email or a number, in a plain sentence", () => {
    expect(parseMemberContact({ email: "asha@", phone: "" })).toEqual({ ok: false, error: CONTACT_PROBLEM.email });
    expect(parseMemberContact({ email: "", phone: "call me" })).toEqual({ ok: false, error: CONTACT_PROBLEM.phone });
    expect(parseMemberContact({ email: "", phone: "2079460958" })).toEqual({ ok: false, error: CONTACT_PROBLEM.phone });
  });

  it("reads back what the person typed, and links only checked values", () => {
    expect(phoneForEditing({ email: null, phone: "+919876543210", phoneAsTyped: "98765 43210" })).toBe("98765 43210");
    expect(phoneForEditing({ email: null, phone: "+919876543210", phoneAsTyped: null })).toBe("+91 98765 43210");
    expect(phoneForEditing(null)).toBe("");
    expect(contactLinks({ email: "a.b@example.com", phone: "+919876543210", phoneAsTyped: null })).toEqual({ mail: "mailto:a.b@example.com", call: "tel:+919876543210" });
    expect(contactLinks(null)).toEqual({ mail: null, call: null });
  });

  it("lets the member themselves or an Admin edit them, nobody else", async () => {
    expect(mayEditMemberContact(member("me", ["adult"]), "me")).toBe(true);
    expect(mayEditMemberContact(member("admin", ["administrator"]), "someone")).toBe(true);
    expect(mayEditMemberContact(member("me", ["adult"]), "someone")).toBe(false);
    expect(mayEditMemberContact(member("kid", ["child"]), "sibling")).toBe(false);
    const { supabase, upsert } = client();
    await expect(setMemberContact(supabase, member("me", ["adult"]), { memberId: "someone", contact: { email: "x@example.com", phone: null, phoneAsTyped: null } })).rejects.toThrow(/own contact details/);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("saves, leaves alone what didn't change, clears when both are blank", async () => {
    const fresh = client();
    expect(await setMemberContact(fresh.supabase, member("me", ["adult"]), { memberId: "me", contact: { email: "me@example.com", phone: "+919876543210", phoneAsTyped: "98765 43210" } })).toBe("saved");
    expect(fresh.upsert).toHaveBeenCalledWith(
      { member_id: "me", household_id: "h1", email: "me@example.com", phone: "+919876543210", phone_as_typed: "98765 43210", updated_by_member_id: "me" },
      { onConflict: "member_id" },
    );
    const existing = client([{ member_id: "me", email: "me@example.com", phone: null, phone_as_typed: null }]);
    expect(await setMemberContact(existing.supabase, member("me", ["adult"]), { memberId: "me", contact: { email: "me@example.com", phone: null, phoneAsTyped: null } })).toBe("unchanged");
    expect(await setMemberContact(existing.supabase, member("me", ["adult"]), { memberId: "me", contact: { email: null, phone: null, phoneAsTyped: null } })).toBe("removed");
    expect(existing.remove).toHaveBeenCalled();
  });

  it("before the migration runs, saves nothing and says so instead of failing", async () => {
    const missing = client([], { code: "PGRST205" });
    expect(await setMemberContact(missing.supabase, member("me", ["adult"]), { memberId: "me", contact: { email: "me@example.com", phone: null, phoneAsTyped: null } })).toBe("unavailable");
    expect(missing.upsert).not.toHaveBeenCalled();
  });
});
