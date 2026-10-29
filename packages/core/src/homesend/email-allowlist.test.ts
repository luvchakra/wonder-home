import { describe, expect, it } from "vitest";

import {
  allowedHouseholdsForSender,
  describeAllowlistEntry,
  normalizeAllowlistEntry,
  senderMatchesAllowlist,
  type AllowlistEntry,
} from "./email-allowlist";
import { fakeSupabase } from "./testing";

/**
 * The privacy gate, tested as pure logic (the webhook test exercises the
 * delivery path): what counts as a usable rule, and which senders it lets
 * through. The expectation is written first — an empty allowlist lets no one
 * in, an exact address matches only itself, a domain matches its own
 * addresses and not a look-alike.
 */

describe("normalizeAllowlistEntry — what a person may add", () => {
  it.each([
    ["bills@bescom.co.in", { kind: "address", value: "bills@bescom.co.in" }],
    ["  Bills@BESCOM.co.in  ", { kind: "address", value: "bills@bescom.co.in" }],
    ["BESCOM Billing <bills@bescom.co.in>", { kind: "address", value: "bills@bescom.co.in" }],
    ["@school.edu", { kind: "domain", value: "school.edu" }],
    ["school.edu", { kind: "domain", value: "school.edu" }],
    ["@mail.greenvalley.example.org", { kind: "domain", value: "mail.greenvalley.example.org" }],
  ])("%s → %o", (raw, expected) => {
    expect(normalizeAllowlistEntry(raw)).toEqual(expected);
  });

  it.each([
    ["", "empty"],
    ["   ", "whitespace only"],
    ["not an address", "a sentence"],
    ["@", "a lone at-sign"],
    ["@localhost", "a domain with no dot"],
    ["a@b@c.com", "two at-signs"],
    ["bills@", "no domain"],
    ["@.com", "an empty label"],
    ["bills@bescom", "an address with no dot in the domain"],
    ["a b@c.com", "a space in the local part"],
  ])("rejects %s (%s)", (raw) => {
    expect(normalizeAllowlistEntry(raw)).toBeNull();
  });

  it("reads a domain back with its leading @, an address as-is", () => {
    expect(describeAllowlistEntry({ kind: "domain", value: "school.edu" })).toBe("@school.edu");
    expect(describeAllowlistEntry({ kind: "address", value: "bills@bescom.co.in" })).toBe("bills@bescom.co.in");
  });
});

describe("senderMatchesAllowlist — who gets through", () => {
  const entries: AllowlistEntry[] = [
    { kind: "address", value: "bills@bescom.co.in" },
    { kind: "domain", value: "school.edu" },
  ];

  it("an empty allowlist lets no one in", () => {
    expect(senderMatchesAllowlist("bills@bescom.co.in", [])).toBe(false);
    expect(senderMatchesAllowlist("anyone@anywhere.com", [])).toBe(false);
  });

  it("an exact address matches only itself", () => {
    expect(senderMatchesAllowlist("bills@bescom.co.in", entries)).toBe(true);
    expect(senderMatchesAllowlist("BESCOM <bills@bescom.co.in>", entries)).toBe(true);
    expect(senderMatchesAllowlist("payments@bescom.co.in", entries)).toBe(false);
  });

  it("a domain matches its own addresses, case-insensitively", () => {
    expect(senderMatchesAllowlist("principal@school.edu", entries)).toBe(true);
    expect(senderMatchesAllowlist("Office <OFFICE@School.edu>", entries)).toBe(true);
  });

  it("a domain does not match a subdomain or a look-alike", () => {
    expect(senderMatchesAllowlist("x@mail.school.edu", entries)).toBe(false);
    expect(senderMatchesAllowlist("x@school.edu.evil.com", entries)).toBe(false);
    expect(senderMatchesAllowlist("x@notschool.edu", entries)).toBe(false);
  });

  it("a sender with no address or no domain matches nothing", () => {
    expect(senderMatchesAllowlist(null, entries)).toBe(false);
    expect(senderMatchesAllowlist("", entries)).toBe(false);
    expect(senderMatchesAllowlist("not-an-address", entries)).toBe(false);
    expect(senderMatchesAllowlist("@school.edu", entries)).toBe(false);
  });
});

describe("allowedHouseholdsForSender — the webhook's gate over many households", () => {
  const A = "11111111-1111-4111-8111-111111111111";
  const B = "22222222-2222-4222-8222-222222222222";

  function db() {
    return fakeSupabase({
      homesend_email_allowlist: [
        { household_id: A, kind: "domain", value: "school.edu" },
        { household_id: B, kind: "address", value: "bills@bescom.co.in" },
      ],
    });
  }

  it("returns only the households that approved the sender", async () => {
    const allowed = await allowedHouseholdsForSender(db().client, [A, B], "principal@school.edu");
    expect([...allowed]).toEqual([A]);
  });

  it("is empty when no household approved the sender", async () => {
    const allowed = await allowedHouseholdsForSender(db().client, [A, B], "stranger@elsewhere.com");
    expect(allowed.size).toBe(0);
  });

  it("is empty for no households or no sender", async () => {
    expect((await allowedHouseholdsForSender(db().client, [], "x@school.edu")).size).toBe(0);
    expect((await allowedHouseholdsForSender(db().client, [A], null)).size).toBe(0);
  });

  it("a household with no rows approves no one", async () => {
    const empty = fakeSupabase({ homesend_email_allowlist: [] });
    expect((await allowedHouseholdsForSender(empty.client, [A], "principal@school.edu")).size).toBe(0);
  });
});
