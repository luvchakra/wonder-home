import { describe, expect, it } from "vitest";

import { DIRECT_ADD_POLICY_NAMES, loadDirectAdd, loadRecordFirst, RECORD_FIRST_POLICY_NAMES } from "./direct-add-repository";

/** A `policies` read that answers with some rows, nothing, or an error. */
function policies(answer: { data: unknown; error: unknown }) {
  const chain = { select: () => chain, eq: () => chain, in: () => chain, limit: async () => answer };
  return { from: () => chain } as never;
}

const legacy = (area: "money" | "health", rule: unknown) => ({ name: DIRECT_ADD_POLICY_NAMES[area], rule });
const picked = (setting: keyof typeof RECORD_FIRST_POLICY_NAMES, value: string) => ({ name: RECORD_FIRST_POLICY_NAMES[setting], rule: { value } });

describe("record-first settings (the owner, 2026-11-14)", () => {
  it("records money and health as Auto approved until an Admin picks otherwise (decision 2, the owner 2026-11-21)", async () => {
    expect(await loadDirectAdd(policies({ data: [], error: null }), "h-1")).toEqual({ money: true, health: true, checking: { money: false, health: false } });
  });

  it("reads a stored \"checking\" (the removed third choice) as Auto approved, safe before and after any rewrite", async () => {
    expect(await loadDirectAdd(policies({ data: [picked("moneyHealth", "checking")], error: null }), "h-1")).toEqual({ money: true, health: true, checking: { money: false, health: false } });
    expect(await loadRecordFirst(policies({ data: [picked("moneyHealth", "checking")], error: null }), "h-1")).toMatchObject({ moneyHealth: "confirmed" });
    expect(await loadRecordFirst(policies({ data: [picked("moneyHealth", "review")], error: null }), "h-1")).toMatchObject({ moneyHealth: "review" });
  });

  it("carries an old switch that was on over as recorded confirmed, area by area", async () => {
    expect(await loadDirectAdd(policies({ data: [legacy("money", { on: true })], error: null }), "h-1")).toEqual({ money: true, health: true, checking: { money: false, health: false } });
    // Anything but a stored true was off, which is now the default, Auto approved.
    expect(await loadDirectAdd(policies({ data: [legacy("money", { on: "yes" }), legacy("health", null)], error: null }), "h-1")).toEqual({ money: true, health: true, checking: { money: false, health: false } });
  });

  it("an Admin's pick decides both areas, and Wait for review is the 3 Nov behaviour", async () => {
    expect(await loadDirectAdd(policies({ data: [legacy("money", { on: true }), picked("moneyHealth", "review")], error: null }), "h-1")).toEqual({ money: false, health: false, checking: { money: false, health: false } });
    expect(await loadDirectAdd(policies({ data: [picked("moneyHealth", "confirmed")], error: null }), "h-1")).toMatchObject({ money: true, health: true, checking: { money: false, health: false } });
  });

  it("is the careful answer when the settings can't be read: everything waits", async () => {
    expect(await loadDirectAdd(policies({ data: null, error: { code: "57014" } }), "h-1")).toEqual({ money: false, health: false });
    expect(await loadRecordFirst(policies({ data: null, error: { code: "57014" } }), "h-1")).toMatchObject({ approvalScope: "everything", moneyHealth: "review", outsideSenders: "review" });
  });

  it("defaults to recording first and asking once about new senders; each can be switched back", async () => {
    expect(await loadRecordFirst(policies({ data: [], error: null }), "h-1")).toMatchObject({ approvalScope: "actions", moneyHealth: "confirmed", outsideSenders: "ask_once" });
    const back = await loadRecordFirst(policies({ data: [picked("approvalScope", "everything"), picked("outsideSenders", "review"), picked("moneyHealth", "nonsense")], error: null }), "h-1");
    expect(back).toMatchObject({ approvalScope: "everything", moneyHealth: "confirmed", outsideSenders: "review" });
  });
});
