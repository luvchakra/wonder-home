import { describe, expect, it } from "vitest";

import { countNeedsYou, loadNeedsYou } from "../hometalk/needs-you-repository";
import { planMomentPassed, planStale, type MomentRow } from "../notifications/stale";
import { checkModelDay, momentOf, momentPassed, momentPassedLine, readProposalMoment } from "./proposal-moment";
import { titleMatches } from "./proposal-moment-repository";

const IST = "Asia/Kolkata";

/** The owner's live row (2026-11-23): asked at 23:29 IST on 22 Nov, still waiting at 06:52 on the 23rd. */
const OWNERS_ROW = {
  action_type: "adjust_schedule",
  created_at: "2026-11-22T17:59:47Z",
  payload: { parameters: { to: "5:20 am", what: "morning walk" }, preview: { summary: "Move morning walk to 5:20 am" }, kind: "proposed" },
};

describe("when a proposal stops mattering (owner, 2026-11-23)", () => {
  it("infers the owner's legacy row: moot after 05:20 IST on 23 Nov", () => {
    expect(momentOf(OWNERS_ROW, IST)?.toISOString()).toBe("2026-11-22T23:50:00.000Z");
    expect(momentPassed(OWNERS_ROW, IST, new Date("2026-11-23T01:22:00Z"))).toBe(true); // 06:52 IST
    expect(momentPassed(OWNERS_ROW, IST, new Date("2026-11-22T23:49:00Z"))).toBe(false); // 05:19 IST
    expect(momentPassedLine(OWNERS_ROW)).toBe("Didn't move the morning walk: 5:20 am has passed.");
  });

  it("legacy with the target on the calendar uses its next occurrence after the ask", () => {
    const occurrences = [{ start: new Date("2026-11-23T00:30:00Z") }]; // 06:00 IST on the 23rd
    // The new time (05:20) is earlier than the walk (06:00), so it is the moment.
    expect(momentOf(OWNERS_ROW, IST, occurrences)?.toISOString()).toBe("2026-11-22T23:50:00.000Z");
    const later = { ...OWNERS_ROW, payload: { ...OWNERS_ROW.payload, parameters: { to: "7 pm", what: "morning walk" } } };
    expect(momentOf(later, IST, occurrences)?.toISOString()).toBe("2026-11-23T00:30:00.000Z");
  });

  it("move tomorrow's walk to 5:20 am → effective_until is tomorrow 05:20 IST", () => {
    const reading = readProposalMoment({ actionType: "adjust_schedule", parameters: { to: "5:20 am", what: "tomorrow's walk" }, utterance: "move tomorrow's walk to 5:20 am", at: new Date("2026-11-22T12:00:00Z"), timezone: IST });
    expect(reading).toMatchObject({ kind: "moment", day: "2026-11-23", basis: "new_time" });
    expect(reading.kind === "moment" && reading.until.toISOString()).toBe("2026-11-22T23:50:00.000Z");
  });

  it("with no day named, prefers the next time it comes", () => {
    const at = new Date("2026-11-22T17:59:47Z"); // 23:29 IST
    const reading = readProposalMoment({ actionType: "adjust_schedule", parameters: { to: "5:20 am", what: "morning walk" }, at, timezone: IST });
    expect(reading.kind === "moment" && reading.until.toISOString()).toBe("2026-11-22T23:50:00.000Z");
    const morning = readProposalMoment({ actionType: "adjust_schedule", parameters: { to: "7 pm", what: "dinner" }, at: new Date("2026-11-23T03:00:00Z"), timezone: IST });
    expect(morning.kind === "moment" && morning.until.toISOString()).toBe("2026-11-23T13:30:00.000Z"); // 19:00 IST today
  });

  it("a recurring change has no moment and stays", () => {
    for (const utterance of ["move my walk to 5:20 every day", "move my morning walk to 5:20 am from now on"]) {
      const reading = readProposalMoment({ actionType: "adjust_schedule", parameters: { to: "5:20 am", what: "my walk" }, utterance, at: new Date("2026-11-22T17:59:47Z"), timezone: IST });
      expect(reading.kind).toBe("recurring");
    }
    const recurring = { ...OWNERS_ROW, payload: { ...OWNERS_ROW.payload, moment: { recurring: true } } };
    expect(momentPassed(recurring, IST, new Date("2026-11-24T00:00:00Z"))).toBe(false);
  });

  it("a future occurrence stays until its moment", () => {
    const occurrences = [{ start: new Date("2026-11-25T00:30:00Z") }]; // 25 Nov 06:00 IST
    const reading = readProposalMoment({ actionType: "adjust_schedule", parameters: { to: "5:20 am", what: "walk" }, at: new Date("2026-11-23T01:30:00Z"), timezone: IST, occurrences });
    expect(reading.kind === "moment" && reading.until.toISOString()).toBe("2026-11-24T23:50:00.000Z");
    const row = { action_type: "adjust_schedule", created_at: "2026-11-23T01:30:00Z", payload: { effective_until: "2026-11-24T23:50:00.000Z" } };
    expect(momentPassed(row, IST, new Date("2026-11-23T10:00:00Z"))).toBe(false);
    expect(momentPassed(row, IST, new Date("2026-11-24T23:50:00Z"))).toBe(true);
  });

  it("payments, orders and a child's request waiting on a grown-up never expire this way", () => {
    const passed = "2026-11-20T00:00:00Z";
    for (const action_type of ["make_payment", "order_items", "assign_responsibility"]) {
      expect(momentOf({ action_type, created_at: "2026-11-19T00:00:00Z", payload: { effective_until: passed, parameters: { to: "5:20 am", what: "x" } } }, IST)).toBeNull();
    }
    expect(momentOf({ action_type: "adjust_schedule", created_at: "2026-11-19T00:00:00Z", payload: { effective_until: passed, referral: { approvalId: "a" } } }, IST)).toBeNull();
    expect(readProposalMoment({ actionType: "make_payment", parameters: { to: "5 pm" }, at: new Date(), timezone: IST }).kind).toBe("none");
  });

  it("a model's day counts only once checked against the calendar", () => {
    const input = { actionType: "adjust_schedule", parameters: { to: "5:20 am", what: "the walk after the party" }, at: new Date("2026-11-22T12:00:00Z"), timezone: IST, occurrences: [{ start: new Date("2026-11-24T00:30:00Z") }] };
    expect(checkModelDay("2026-11-24", input)).toMatchObject({ kind: "moment", basis: "model", day: "2026-11-24" });
    expect(checkModelDay("2026-11-23", input).kind).toBe("none"); // no occurrence that day
    expect(checkModelDay("2026-12-30", { ...input, occurrences: [] }).kind).toBe("none"); // too far
    expect(checkModelDay("2026-11-20", { ...input, occurrences: [] }).kind).toBe("none"); // before it was asked
    expect(checkModelDay("tomorrow", input).kind).toBe("none");
  });

  it("matches the calendar entry by its words", () => {
    expect(titleMatches("Morning walk", "tomorrow's morning walk")).toBe(true);
    expect(titleMatches("Evening run", "morning walk")).toBe(false);
  });
});

describe("the sweep and the reminders", () => {
  const row = (id: string, over: Partial<MomentRow> = {}): MomentRow => ({ id, household_id: "h", session_id: "s", timezone: IST, ...OWNERS_ROW, ...over });

  it("expires a one-time move whose moment has passed; keeps a recurring one and a payment", () => {
    const now = new Date("2026-11-23T01:22:00Z");
    const plan = planMomentPassed(
      [row("a"), row("b", { payload: { ...OWNERS_ROW.payload, moment: { recurring: true } } }), row("c", { action_type: "make_payment" }), row("d", { payload: { effective_until: "2026-11-23T05:00:00Z" } })],
      now,
    );
    expect(plan.map((entry) => entry.row.id)).toEqual(["a"]);
  });

  it("its waiting-for-a-yes reminder clears as past", () => {
    const open = { id: "n1", household_id: "h", recipient_member_id: "m", source_type: "approval", source_id: "a1", thread_key: "proposal:a1", category: "system", expires_at: null, scheduled_for: "2026-11-22T18:00:00Z", created_at: "2026-11-22T18:00:00Z" };
    const facts = { actions: new Map([["a1", { status: "expired", reason: "moment_passed" }]]), approvals: new Map(), appointments: new Map(), routines: new Map(), events: new Map() };
    expect(planStale([open], facts, new Date("2026-11-23T01:30:00Z"))).toEqual([{ id: "n1", householdId: "h", reason: "past" }]);
  });
});

/** A read-only stand-in for the member's client: every filter is accepted, each table answers with its rows. */
function fakeClient(tables: Record<string, unknown[]>) {
  return {
    from(table: string) {
      const result = { data: tables[table] ?? [], error: null, count: (tables[table] ?? []).length };
      const chain: Record<string, unknown> = {};
      for (const name of ["select", "eq", "gte", "gt", "order", "limit", "in"]) chain[name] = () => chain;
      chain.then = (resolve: (value: typeof result) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
      return chain;
    },
  } as never;
}

describe("Needs you and the bell, at read time", () => {
  it("drop a proposal whose moment has passed, before any sweep", async () => {
    const client = fakeClient({
      conversation_actions: [
        { id: "a1", session_id: "s", households: { timezone: IST }, ...OWNERS_ROW },
        { id: "a2", session_id: "s", action_type: "make_payment", created_at: "2026-11-22T18:00:00Z", payload: { preview: { summary: "Pay the plumber" } }, households: { timezone: IST } },
      ],
    });
    const now = new Date("2026-11-23T01:22:00Z");
    const list = await loadNeedsYou(client, "h", { now });
    expect(list.shown.map((item) => item.subjectId)).toEqual(["a2"]);
    expect(await countNeedsYou(client, "h", now)).toBe(1);
    // Before 05:20 IST it is still shown.
    expect(await countNeedsYou(client, "h", new Date("2026-11-22T20:00:00Z"))).toBe(2);
  });
});
