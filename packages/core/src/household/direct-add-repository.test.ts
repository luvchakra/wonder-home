import { describe, expect, it } from "vitest";

import { DIRECT_ADD_POLICY_NAMES, loadDirectAdd } from "./direct-add-repository";

/** A `policies` read that answers with some rows, nothing, or an error. */
function policies(answer: { data: unknown; error: unknown }) {
  const chain = { select: () => chain, eq: () => chain, in: () => chain, limit: async () => answer };
  return { from: () => chain } as never;
}

const row = (area: "money" | "health", rule: unknown) => ({ name: DIRECT_ADD_POLICY_NAMES[area], rule });

describe("loadDirectAdd (the owner, 2026-10-26)", () => {
  it("is off for both until an Admin turns one on", async () => {
    expect(await loadDirectAdd(policies({ data: [], error: null }), "h-1")).toEqual({ money: false, health: false });
  });

  it("reads each area's own row", async () => {
    expect(await loadDirectAdd(policies({ data: [row("money", { on: true })], error: null }), "h-1")).toEqual({ money: true, health: false });
    expect(await loadDirectAdd(policies({ data: [row("health", { on: true }), row("money", { on: false })], error: null }), "h-1")).toEqual({ money: false, health: true });
  });

  it("is off when the settings can't be read", async () => {
    expect(await loadDirectAdd(policies({ data: null, error: { code: "57014" } }), "h-1")).toEqual({ money: false, health: false });
  });

  it("is off for anything but a stored true", async () => {
    expect(await loadDirectAdd(policies({ data: [row("money", { on: "yes" }), row("health", null)], error: null }), "h-1")).toEqual({ money: false, health: false });
  });
});
