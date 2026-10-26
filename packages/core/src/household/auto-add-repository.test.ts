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

// AT-K (docs/testing/2026-10-26-hometalk-homesend-acceptance.md): the stored bar, read and then used.
describe("AT-K: the Admin's stored bar decides", () => {
  const medium = { readable: true, confidence: "medium" as "medium" | "high", score: 0.7, check: { verified: false, unverified: [] }, safety: { signals: [], instructionsIgnored: false } };
  const clear = { ...medium, confidence: "high" as const, score: 0.97, check: { verified: true, unverified: [] } };
  const decideUnder = async (answer: { data: unknown; error: unknown }, understanding: typeof medium) => {
    const { decideConfirmation } = await import("../homesend/confirmation");
    const bar = await loadAutoAddPercent(policies(answer), "h-1");
    return decideConfirmation({ kind: "grocery_item", extracted: { title: "Milk", quantity: 1, unit: "l", needs: [], confidence: "high" } as never, understanding, reconciliation: null, subject: null, memberInitiated: true, autonomy: "execute", autoAddPercent: bar }).mode;
  };
  it("AT-K01 a stored 60% lets a 70% reading be added on its own", async () => {
    expect(await decideUnder({ data: { rule: { percent: 60 } }, error: null }, medium)).toBe("auto_apply");
  });
  it("AT-K02 nothing stored (95%) holds a 70% reading", async () => {
    expect(await decideUnder({ data: null, error: null }, medium)).toBe("prepare");
  });
  it("AT-K03 nothing stored (95%) adds a 97% reading", async () => {
    expect(await decideUnder({ data: null, error: null }, clear)).toBe("auto_apply");
  });
  it("AT-K04 a setting that can't be read (99%) holds even a 97% reading", async () => {
    expect(await decideUnder({ data: null, error: { code: "57014" } }, clear)).toBe("prepare");
  });
  it("AT-K05 a stored bar WonderHome doesn't offer (99%) holds a 97% reading", async () => {
    expect(await decideUnder({ data: { rule: { percent: 42 } }, error: null }, clear)).toBe("prepare");
  });
});
