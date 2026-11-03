import { describe, expect, it } from "vitest";

import { CHANNEL_ADAPTERS } from "./channels";
import { reconcileHouseholdReminders } from "./reconcile";
import { memoryDatabase } from "./test-support";

/**
 * An entry HomeSend added below the household's bar is "Checking": its own
 * reminders wait until it is confirmed (the owner, 2026-11-03). Expected
 * results written first: held while unconfirmed; reminded once confirmed or
 * when the change was undone; nothing held when the columns aren't there yet.
 */
describe("reminders wait for an entry HomeSend is still checking", () => {
  // 22 Oct, 11:30 in Kolkata: a bill due on the 25th is three days out.
  const now = new Date("2026-10-22T06:00:00Z");
  function run(changes: Record<string, unknown>[]) {
    const { client, tables } = memoryDatabase({
      households: [{ id: "h1", timezone: "Asia/Kolkata", region: "IN", currency: "INR", measurement_system: "metric", default_language: "en", status: "active" }],
      household_members: [{ id: "m1", household_id: "h1", profile_id: "u1", member_type: "adult", status: "active", display_name: "Kunal", nickname: null, date_of_birth: null }],
      household_roles: [{ household_id: "h1", member_id: "m1", role: "head" }],
      obligations: [{ id: "b1", household_id: "h1", name: "Electricity", payee: null, amount_minor: 120000, currency: "INR", due_on: "2026-10-25", status: "expected", responsible_member_id: "m1" }],
      homesend_changes: changes,
      policies: [],
      notifications: [],
    } as Record<string, Record<string, unknown>[]>);
    return reconcileHouseholdReminders(client, "h1", { now, force: true, adapters: CHANNEL_ADAPTERS }).then(() => (tables.notifications ?? []).filter((row) => row.source_type === "obligation"));
  }
  const change = (over: Record<string, unknown>) => ({ id: "c1", household_id: "h1", intake_id: "i1", domain: "bill", entity_id: "b1", undone_at: null, confirmation_state: "unconfirmed", ...over });

  it("holds the bill's reminder while it is still being checked", async () => {
    expect(await run([change({})])).toEqual([]);
  });

  it("reminds once it is confirmed", async () => {
    expect(await run([change({ confirmation_state: "confirmed" })])).toHaveLength(1);
  });

  it("never holds a record whose HomeSend change was undone, or another record", async () => {
    expect(await run([change({ undone_at: "2026-10-21T00:00:00Z" })])).toHaveLength(1);
    expect(await run([change({ entity_id: "b2" })])).toHaveLength(1);
  });

  it("holds nothing in another household", async () => {
    expect(await run([change({ household_id: "h2" })])).toHaveLength(1);
  });
});
