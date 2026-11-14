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
  it("records money and health as Checking until an Admin picks otherwise (decision 2)", async () => {
    expect(await loadDirectAdd(policies({ data: [], error: null }), "h-1")).toEqual({ money: true, health: true, checking: { money: true, health: true } });
  });

  it("carries an old switch that was on over as recorded confirmed, area by area", async () => {
    expect(await loadDirectAdd(policies({ data: [legacy("money", { on: true })], error: null }), "h-1")).toEqual({ money: true, health: true, checking: { money: false, health: true } });
    // Anything but a stored true was off, which is now the default, Checking.
    expect(await loadDirectAdd(policies({ data: [legacy("money", { on: "yes" }), legacy("health", null)], error: null }), "h-1")).toEqual({ money: true, health: true, checking: { money: true, health: true } });
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
    expect(await loadRecordFirst(policies({ data: [], error: null }), "h-1")).toMatchObject({ approvalScope: "actions", moneyHealth: "checking", outsideSenders: "ask_once" });
    const back = await loadRecordFirst(policies({ data: [picked("approvalScope", "everything"), picked("outsideSenders", "review"), picked("moneyHealth", "nonsense")], error: null }), "h-1");
    expect(back).toMatchObject({ approvalScope: "everything", moneyHealth: "checking", outsideSenders: "review" });
  });
});
