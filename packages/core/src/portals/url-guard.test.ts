import { describe, expect, it } from "vitest";

import { baseDomain, sameSite, validatePortalUrl, validateScrapeUrl } from "./url-guard";

describe("validatePortalUrl", () => {
  it("accepts a public https portal and strips embedded credentials", () => {
    const result = validatePortalUrl("https://user:pw@www.looplearning.com/login?next=/home#frag");
    expect(result.ok).toBe(true);
    expect(result.ok && result.host).toBe("www.looplearning.com");
    expect(result.ok && result.url).toBe("https://www.looplearning.com/login?next=/home");
  });

  it("refuses http — a password must not go over plaintext", () => {
    expect(validatePortalUrl("http://portal.example.com/login")).toEqual({ ok: false, reason: "insecure" });
  });

  it("refuses an IP literal, localhost, and internal suffixes (SSRF)", () => {
    expect(validatePortalUrl("https://169.254.169.254/latest/meta-data")).toEqual({ ok: false, reason: "blocked_host" });
    expect(validatePortalUrl("https://127.0.0.1/login")).toEqual({ ok: false, reason: "blocked_host" });
    expect(validatePortalUrl("https://localhost/login")).toEqual({ ok: false, reason: "blocked_host" });
    expect(validatePortalUrl("https://db.internal/login")).toEqual({ ok: false, reason: "blocked_host" });
  });

  it("refuses something that isn't a URL", () => {
    expect(validatePortalUrl("not a url")).toEqual({ ok: false, reason: "invalid_url" });
  });
});

describe("validateScrapeUrl (must be same site as the portal)", () => {
  const portal = "https://www.looplearning.com/login";

  it("accepts another subdomain of the same registrable domain", () => {
    const r = validateScrapeUrl("https://app.looplearning.com/task/list", portal);
    expect(r.ok).toBe(true);
    expect(r.ok && r.host).toBe("app.looplearning.com");
  });

  it("refuses an off-site host", () => {
    expect(validateScrapeUrl("https://evil.example.com/steal", portal)).toEqual({ ok: false, reason: "offsite" });
  });

  it("refuses http and blocked hosts too", () => {
    expect(validateScrapeUrl("http://www.looplearning.com/x", portal)).toEqual({ ok: false, reason: "insecure" });
    expect(validateScrapeUrl("https://127.0.0.1/x", portal)).toEqual({ ok: false, reason: "blocked_host" });
  });

  it("treats multi-part public suffixes as separate sites", () => {
    const schoolPortal = "https://portal.myschool.ac.in/login";
    expect(validateScrapeUrl("https://data.myschool.ac.in/home", schoolPortal).ok).toBe(true);
    expect(validateScrapeUrl("https://other.ac.in/home", schoolPortal)).toEqual({ ok: false, reason: "offsite" });
  });
});

describe("baseDomain / sameSite", () => {
  it("derives the registrable domain", () => {
    expect(baseDomain("www.looplearning.com")).toBe("looplearning.com");
    expect(baseDomain("a.b.c.looplearning.com")).toBe("looplearning.com");
    expect(baseDomain("portal.myschool.ac.in")).toBe("myschool.ac.in");
  });

  it("recognises same and different sites", () => {
    expect(sameSite("www.looplearning.com", "api.looplearning.com")).toBe(true);
    expect(sameSite("www.looplearning.com", "looplearning.com.evil.com")).toBe(false);
  });
});
