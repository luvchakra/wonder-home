import { beforeEach, describe, expect, it, vi } from "vitest";

const audit = vi.hoisted(() => vi.fn());
vi.mock("../api/audit", () => ({ recordAuditEvent: audit }));
vi.mock("../db/admin-context", () => ({ adminClientFor: () => { throw new Error("tests pass their own client"); }, adminGrant: { worker: () => ({}) } }));

import {
  applyPlatformAdminsVariable,
  decideStaffChange,
  emailFingerprint,
  forgetPlatformAdminsCheck,
  maskEmail,
  parsePlatformAdmins,
  platformAdminsHealth,
  verifiedEmailsOf,
} from "./admins-variable";

describe("parsePlatformAdmins", () => {
  it("reads email and email:role, trimmed and case-insensitive", () => {
    const parsed = parsePlatformAdmins(" You@Example.com:OWNER , helper@example.com:support,ops@example.com ");
    expect([...parsed.entries]).toEqual([
      ["you@example.com", "owner"],
      ["helper@example.com", "support"],
      ["ops@example.com", "operator"],
    ]);
    expect(parsed.invalid).toBe(0);
  });

  it("defaults the role to operator, never owner", () => {
    expect(parsePlatformAdmins("a@b.co").entries.get("a@b.co")).toBe("operator");
  });

  it("ignores and counts invalid entries", () => {
    const parsed = parsePlatformAdmins("not-an-email, x@y.com:boss, ok@y.com:support,,");
    expect([...parsed.entries.keys()]).toEqual(["ok@y.com"]);
    expect(parsed.invalid).toBe(2);
  });

  it("keeps the stronger role when an email is listed twice", () => {
    expect(parsePlatformAdmins("a@b.co:owner, A@b.co:support").entries.get("a@b.co")).toBe("owner");
  });

  it("tells Configuration health when set but empty or malformed, without the email", () => {
    expect(platformAdminsHealth(parsePlatformAdmins(undefined))).toBeNull();
    expect(platformAdminsHealth(parsePlatformAdmins("a@b.co"))).toBeNull();
    expect(platformAdminsHealth(parsePlatformAdmins(" "))).toMatch(/names nobody/);
    const words = platformAdminsHealth(parsePlatformAdmins("a@b.co, secret@b.co:root"));
    expect(words).toMatch(/1 entry/);
    expect(words).not.toContain("secret");
  });
});

describe("verifiedEmailsOf", () => {
  it("counts a confirmed email-and-password account", () => {
    expect(verifiedEmailsOf({ email: "A@b.co", email_confirmed_at: "2026-11-22", identities: [] })).toEqual(["a@b.co"]);
  });
  it("never counts an unconfirmed email", () => {
    expect(verifiedEmailsOf({ email: "a@b.co", email_confirmed_at: undefined, identities: [] })).toEqual([]);
  });
  it("counts a Google identity Google verified", () => {
    const identities = [{ provider: "google", identity_data: { email: "g@b.co", email_verified: true } }] as never;
    expect(verifiedEmailsOf({ email: "g@b.co", email_confirmed_at: undefined, identities })).toEqual(["g@b.co"]);
  });
  it("gives a phone-only account nothing", () => {
    expect(verifiedEmailsOf({ email: undefined, email_confirmed_at: undefined, identities: [{ provider: "phone", identity_data: { phone: "+91" } }] as never })).toEqual([]);
  });
});

describe("decideStaffChange", () => {
  const variable = (role: "support" | "operator" | "owner", status: "active" | "suspended" = "active") => ({ role, status, source: "variable" as const });
  it("grants a listed person with no row", () => expect(decideStaffChange(null, { role: "operator" })).toEqual({ kind: "grant", role: "operator" }));
  it("suspends a variable row once the email leaves the list", () => expect(decideStaffChange(variable("owner"), null)).toEqual({ kind: "suspend" }));
  it("changes a variable row's role", () => expect(decideStaffChange(variable("support"), { role: "owner" })).toEqual({ kind: "role_change", from: "support", role: "owner" }));
  it("reactivates a suspended variable row listed again", () => expect(decideStaffChange(variable("support", "suspended"), { role: "support" }).kind).toBe("reactivate"));
  it("never touches a manual row", () => {
    const manual = { role: "owner" as const, status: "active" as const, source: "manual" as const };
    expect(decideStaffChange(manual, null)).toEqual({ kind: "none" });
    expect(decideStaffChange(manual, { role: "support" })).toEqual({ kind: "none" });
  });
});

describe("applyPlatformAdminsVariable", () => {
  type Row = { role: string; status: string; source: string } | null;
  function fakeAdmin(row: Row, user: Record<string, unknown>) {
    const writes: { op: string; values?: unknown }[] = [];
    const chain = (op: string, values?: unknown) => {
      const query = {
        eq: () => query,
        select: () => query,
        maybeSingle: async () => ({ data: row, error: null }),
        then: (resolve: (value: { error: null }) => void) => {
          writes.push({ op, values });
          resolve({ error: null });
        },
      };
      return query;
    };
    const admin = {
      from: () => ({ select: () => chain("select"), insert: (values: unknown) => chain("insert", values), update: (values: unknown) => chain("update", values) }),
      auth: { admin: { getUserById: vi.fn(async () => ({ data: { user }, error: null })) } },
    };
    return { admin: admin as never, writes, getUserById: admin.auth.admin.getUserById };
  }

  beforeEach(() => {
    forgetPlatformAdminsCheck();
    audit.mockReset();
    vi.unstubAllEnvs();
  });

  it("grants a verified listed email its role, audited by fingerprint only", async () => {
    vi.stubEnv("WONDERHOME_PLATFORM_ADMINS", "boss@example.com:owner");
    const { admin, writes } = fakeAdmin(null, { email: "Boss@example.com", email_confirmed_at: "x", identities: [] });
    expect(await applyPlatformAdminsVariable("u1", { admin })).toEqual({ kind: "grant", role: "owner" });
    expect(writes).toEqual([{ op: "insert", values: { profile_id: "u1", role: "owner", status: "active", source: "variable" } }]);
    const metadata = audit.mock.calls[0]![1].metadata;
    expect(audit.mock.calls[0]![1].eventType).toBe("platform_admin.granted");
    expect(metadata.matchFingerprint).toBe(emailFingerprint("boss@example.com"));
    expect(metadata.matchMasked).toBe(maskEmail("boss@example.com"));
    expect(JSON.stringify(metadata)).not.toContain("boss@example.com");
  });

  it("never grants an unverified email", async () => {
    vi.stubEnv("WONDERHOME_PLATFORM_ADMINS", "boss@example.com:owner");
    const { admin, writes } = fakeAdmin(null, { email: "boss@example.com", email_confirmed_at: null, identities: [] });
    expect((await applyPlatformAdminsVariable("u1", { admin })).kind).toBe("none");
    expect(writes).toEqual([]);
  });

  it("never matches a phone-only user", async () => {
    vi.stubEnv("WONDERHOME_PLATFORM_ADMINS", "boss@example.com:owner");
    const { admin, writes } = fakeAdmin(null, { phone: "+919999999999", identities: [{ provider: "phone", identity_data: {} }] });
    expect((await applyPlatformAdminsVariable("u1", { admin })).kind).toBe("none");
    expect(writes).toEqual([]);
  });

  it("suspends a variable row whose email was removed, and leaves a manual row alone", async () => {
    vi.stubEnv("WONDERHOME_PLATFORM_ADMINS", "someone-else@example.com");
    const removed = fakeAdmin({ role: "operator", status: "active", source: "variable" }, { email: "boss@example.com", email_confirmed_at: "x", identities: [] });
    expect((await applyPlatformAdminsVariable("u1", { admin: removed.admin })).kind).toBe("suspend");
    expect(removed.writes).toEqual([{ op: "update", values: { status: "suspended" } }]);
    expect(audit.mock.calls[0]![1].eventType).toBe("platform_admin.suspended");

    const manual = fakeAdmin({ role: "owner", status: "active", source: "manual" }, { email: "boss@example.com", email_confirmed_at: "x", identities: [] });
    expect((await applyPlatformAdminsVariable("u2", { admin: manual.admin })).kind).toBe("none");
    expect(manual.writes).toEqual([]);
    expect(manual.getUserById).not.toHaveBeenCalled();
  });

  it("asks the auth server at most once per person per server start", async () => {
    vi.stubEnv("WONDERHOME_PLATFORM_ADMINS", "boss@example.com");
    const { admin, getUserById } = fakeAdmin(null, { email: "boss@example.com", email_confirmed_at: "x", identities: [] });
    await applyPlatformAdminsVariable("u1", { admin });
    await applyPlatformAdminsVariable("u1", { admin });
    expect(getUserById).toHaveBeenCalledTimes(1);
  });

  it("makes no lookup when the variable is unset and the person has no variable row", async () => {
    const { admin, getUserById, writes } = fakeAdmin(null, {});
    expect((await applyPlatformAdminsVariable("u1", { admin })).kind).toBe("none");
    expect(getUserById).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });
});
