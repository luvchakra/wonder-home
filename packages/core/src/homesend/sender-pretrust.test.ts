import { describe, expect, it } from "vitest";

import { preTrustBasis, registeredName, type KnownSenders } from "./sender-pretrust";

const KNOWN: KnownSenders = {
  addresses: new Map([
    ["dad.mehta@gmail.com", "contact"],
    ["ms.iyer@gmail.com", "contact"],
    ["billing@acme-power.in", "payee"],
  ]),
  schoolDomains: new Set(["dpsrkp.net"]),
  schoolNames: ["Greenwood High School", "St. Mary's"],
  payeeNames: ["BESCOM", "Airtel Ltd."],
};

describe("decision 4 — who the household's records know (the owner, 2026-11-20)", () => {
  it("an exact address on record: a member's or teacher's email, or a payee who sent a recorded bill — even at a webmail domain", () => {
    expect(preTrustBasis("Dad <Dad.Mehta@gmail.com>", KNOWN)).toBe("contact");
    expect(preTrustBasis("billing@acme-power.in", KNOWN)).toBe("payee");
  });

  it("a child's school: a domain its notices or teachers came from, or a domain registered under the school's name", () => {
    expect(preTrustBasis("principal@dpsrkp.net", KNOWN)).toBe("school");
    expect(preTrustBasis("notices@greenwoodhigh.edu.in", KNOWN)).toBe("school");
    expect(preTrustBasis("office@greenwoodhighschool.org", KNOWN)).toBe("school");
  });

  it("a payee on record by its domain's name", () => {
    expect(preTrustBasis("noreply@bescom.co.in", KNOWN)).toBe("payee");
    expect(preTrustBasis("bills@airtel.in", KNOWN)).toBe("payee");
  });

  it("everyone else is still asked: a stranger at webmail, a lookalike subdomain, a short name, no address", () => {
    expect(preTrustBasis("someone@gmail.com", KNOWN)).toBeNull();
    expect(preTrustBasis("bescom@gmail.com", KNOWN)).toBeNull();
    expect(preTrustBasis("pay@bescom.evil.com", KNOWN)).toBeNull();
    expect(preTrustBasis("hello@stmarys.org", { ...KNOWN, schoolNames: ["St"] })).toBeNull();
    expect(preTrustBasis(null, KNOWN)).toBeNull();
    expect(preTrustBasis("not an address", KNOWN)).toBeNull();
  });

  it("the name a domain was registered under skips public suffixes", () => {
    expect(registeredName("bescom.co.in")).toBe("bescom");
    expect(registeredName("mail.greenwoodhigh.edu.in")).toBe("greenwoodhigh");
    expect(registeredName("bescom.evil.com")).toBe("evil");
    expect(registeredName("localhost")).toBeNull();
  });
});
