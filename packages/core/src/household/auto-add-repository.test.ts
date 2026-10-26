import { describe, expect, it } from "vitest";

import { loadAutoAddPercent } from "./auto-add-repository";

/** A `policies` read that answers with one row, nothing, or an error. */
function policies(answer: { data: unknown; error: unknown }) {
  const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => answer };
  return { from: () => chain } as never;
}

describe("loadAutoAddPercent", () => {
  it("reads the Admin's bar", async () => {
    expect(await loadAutoAddPercent(policies({ data: { rule: { percent: 85 } }, error: null }), "h-1")).toBe(85);
  });

  it("is 95% until an Admin picks one", async () => {
    expect(await loadAutoAddPercent(policies({ data: null, error: null }), "h-1")).toBe(95);
  });

  it("is the highest bar when the setting can't be read", async () => {
    expect(await loadAutoAddPercent(policies({ data: null, error: { code: "57014" } }), "h-1")).toBe(99);
  });

  // Design audit 2026-10-26: a stored bar WonderHome doesn't offer is read as the highest, never as the default.
  it("is the highest bar when the stored one isn't a bar WonderHome offers", async () => {
    expect(await loadAutoAddPercent(policies({ data: { rule: { percent: 42 } }, error: null }), "h-1")).toBe(99);
    expect(await loadAutoAddPercent(policies({ data: { rule: null }, error: null }), "h-1")).toBe(99);
  });
});
