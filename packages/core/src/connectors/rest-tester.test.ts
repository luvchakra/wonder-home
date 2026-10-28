import { describe, expect, it } from "vitest";

import { resolveRestTarget } from "./rest-tester";

describe("resolveRestTarget", () => {
  const base = "https://api.example.com/v1";

  it("joins a relative path onto the base address", () => {
    expect(resolveRestTarget(base, "/v1/orders")).toEqual({ ok: true, url: "https://api.example.com/v1/orders" });
    expect(resolveRestTarget(base, "things?q=1")).toMatchObject({ ok: true });
  });

  it("accepts a full URL on the same site", () => {
    expect(resolveRestTarget(base, "https://files.example.com/x")).toEqual({ ok: true, url: "https://files.example.com/x" });
  });

  it("rejects a different site", () => {
    expect(resolveRestTarget(base, "https://evil.test/steal")).toEqual({ ok: false, reason: "offsite" });
  });

  it("rejects non-https and internal hosts", () => {
    expect(resolveRestTarget(base, "http://api.example.com/x")).toEqual({ ok: false, reason: "insecure" });
    expect(resolveRestTarget("https://169.254.169.254/", "/latest")).toEqual({ ok: false, reason: "invalid_base" });
    expect(resolveRestTarget("https://localhost/", "/x")).toEqual({ ok: false, reason: "invalid_base" });
  });

  it("rejects a base address that isn't a valid public https host", () => {
    expect(resolveRestTarget("not a url", "/x")).toEqual({ ok: false, reason: "invalid_base" });
  });

  it("strips credentials from the resolved address", () => {
    expect(resolveRestTarget(base, "https://user:pass@api.example.com/x")).toEqual({ ok: true, url: "https://api.example.com/x" });
  });
});
