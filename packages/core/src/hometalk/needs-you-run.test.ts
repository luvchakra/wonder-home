import { describe, expect, it } from "vitest";

import { memoryDatabase } from "../notifications/test-support";
import { runNeedsYouDeadlines } from "./needs-you-run";

/**
 * "Nothing waits" end to end on an in-memory database: the one-time pass in
 * miniature. Items sent weeks ago are asked about from when they were sent,
 * so their defaults are already due and are applied in the same pass.
 */
const NOW = new Date("2026-11-14T12:00:00Z");
const OLD = "2026-11-01T05:00:00Z";
/** `home_send_items`' own CHECKs a step could break: a routed item has its table and id together, and only a routed one has them. */
const HOME_SEND_CHECKS = {
  home_send_items: (row: Record<string, unknown>) => (row.routed_table == null) === (row.routed_id == null) && (row.routed_table == null || row.status === "routed"),
};
const PAGE = "Home | About us | Contact us\nAccept all cookies. Privacy Policy. © 2026 Example. All rights reserved.";

function seed() {
  return memoryDatabase({
    households: [{ id: "h1", timezone: "Asia/Kolkata" }],
    household_members: [
      { id: "m1", household_id: "h1", member_type: "adult", status: "active", profile_id: "u1" },
      { id: "kid", household_id: "h1", member_type: "child", status: "active", profile_id: null },
    ],
    policies: [],
    needs_you_items: [],
    conversation_actions: [
      { id: "p1", household_id: "h1", approval_status: "proposed", created_at: "2026-11-10T05:00:00Z" },
      { id: "p2", household_id: "h1", approval_status: "proposed", created_at: "2026-11-14T10:00:00Z" },
    ],
    jobs: [],
    home_send_items: [
      { id: "page", household_id: "h1", status: "classified", classified_kind: "unknown", raw_text: PAGE, readable: true, retry_count: 0, created_by_member_id: "m1", created_at: OLD, updated_at: OLD },
      { id: "plumber", household_id: "h1", status: "classified", classified_kind: "unknown", raw_text: "Plumber Ramesh, call before monsoon", readable: true, retry_count: 0, created_by_member_id: "m1", created_at: OLD, updated_at: OLD },
      { id: "garbled", household_id: "h1", status: "failed", failure_reason: "unreadable", raw_text: "pls chk", retry_count: 0, created_by_member_id: "m1", created_at: OLD, updated_at: OLD },
      { id: "garbled2", household_id: "h1", status: "failed", failure_reason: "unreadable", raw_text: "pls chk", retry_count: 1, created_by_member_id: "m1", created_at: OLD, updated_at: OLD },
      { id: "notice", household_id: "h1", status: "classified", classified_kind: "school_item", raw_text: "Rehearsal", title: "Rehearsal", readable: true, retry_count: 0, created_by_member_id: "kid", created_at: OLD, updated_at: OLD },
      { id: "bill-held", household_id: "h1", status: "classified", classified_kind: "bill", raw_text: "Water bill", title: "Water", readable: true, retry_count: 0, created_by_member_id: "m1", created_at: OLD, updated_at: OLD },
      { id: "elec", household_id: "h1", status: "routed", classified_kind: "bill", title: "Electricity", due: "2026-11-16", created_by_member_id: "m1", created_at: OLD, updated_at: OLD },
      { id: "milk", household_id: "h1", status: "routed", classified_kind: "grocery_item", title: "Milk", created_by_member_id: "m1", created_at: OLD, updated_at: OLD },
    ],
    homesend_changes: [
      { id: "c1", household_id: "h1", intake_id: "elec", domain: "bill", entity_id: "b1", confirmation_state: "unconfirmed", undone_at: null, created_at: OLD },
      { id: "c2", household_id: "h1", intake_id: "milk", domain: "grocery_item", entity_id: "g1", confirmation_state: "unconfirmed", undone_at: null, created_at: OLD },
    ],
  });
}

describe("the deadlines step", () => {
  it("ends every waiting item as something and applies due defaults, never touching money's confirmation", async () => {
    const { client, tables } = seed();
    const result = await runNeedsYouDeadlines(client, { now: NOW, householdIds: ["h1"], sweep: false });
    const item = (id: string) => tables.home_send_items!.find((row) => row.id === id)!;

    expect(item("page")).toMatchObject({ status: "archived", archive_reason: "not_household" });
    expect(item("plumber")).toMatchObject({ status: "archived", archive_reason: "kept_as_note" });
    // Read once more another way, before anyone is asked.
    expect(item("garbled")).toMatchObject({ status: "failed", retry_count: 1 });
    expect(tables.jobs!.some((job) => (job.payload as { itemId?: string }).itemId === "garbled")).toBe(true);
    // Read again already: its sender was asked to resend, and that default (set aside) applied.
    expect(item("garbled2")).toMatchObject({ status: "archived", archive_reason: "not_resent" });
    // A child's notice: asked of the Admins, kept as a note by default.
    expect(item("notice")).toMatchObject({ status: "archived", archive_reason: "kept_as_note" });
    expect(tables.needs_you_items!.find((row) => row.subject_id === "notice")).toMatchObject({ recipient_member_id: null, status: "defaulted", answer: "note" });
    // A bill held on the money switch is left to part B (recorded as Checking): no question, no note.
    expect(item("bill-held").status).toBe("classified");
    expect(tables.needs_you_items!.some((row) => row.subject_id === "bill-held")).toBe(false);

    // Checking: the grocery is kept as read; the bill stays Checking with its question closed.
    expect(tables.homesend_changes!.find((row) => row.id === "c2")).toMatchObject({ confirmation_state: "confirmed", confirmed_by_member_id: null });
    expect(tables.homesend_changes!.find((row) => row.id === "c1")!.confirmation_state).toBe("unconfirmed");
    expect(tables.needs_you_items!.find((row) => row.subject_id === "elec")).toMatchObject({ status: "defaulted", answer: "keep_checking" });

    // HomeTalk proposals: the one 48 hours old closes as not done; the fresh one stays.
    expect(tables.conversation_actions!.map((row) => row.approval_status)).toEqual(["expired", "proposed"]);
    expect(result).toMatchObject({ ready: true, notes: 1, setAside: 1, readAgain: 1, proposalsClosed: 1, defaulted: 4 });
    expect(tables.needs_you_items!.filter((row) => row.status === "open")).toEqual([]);

    // A second pass changes nothing.
    const again = await runNeedsYouDeadlines(client, { now: NOW, householdIds: ["h1"], sweep: false });
    expect(again).toMatchObject({ defaulted: 0, asked: 0, notes: 0, setAside: 0, readAgain: 0 });
  });

  it("withdraws a question whose entry was confirmed elsewhere (Mark paid, an edit)", async () => {
    const { client, tables } = seed();
    tables.needs_you_items!.push({ id: "q1", household_id: "h1", source: "homesend_check", subject_id: "elec", status: "open", default_at: "2026-11-20T00:00:00Z", expires_at: "2026-11-21T00:00:00Z" });
    tables.homesend_changes!.find((row) => row.id === "c1")!.confirmation_state = "confirmed";
    await runNeedsYouDeadlines(client, { now: NOW, householdIds: ["h1"], sweep: false });
    expect(tables.needs_you_items!.find((row) => row.id === "q1")).toMatchObject({ status: "withdrawn" });
  });

  it("applies no default when an Admin switched decision 4 off, and closes the question at 48 hours instead", async () => {
    const { client, tables } = seed();
    tables.policies!.push({ household_id: "h1", category: "ai_autonomy", name: "Apply a question's default after a day", active: true, rule: { on: false } });
    await runNeedsYouDeadlines(client, { now: NOW, householdIds: ["h1"], sweep: false });
    expect(tables.homesend_changes!.find((row) => row.id === "c2")!.confirmation_state).toBe("unconfirmed");
    expect(tables.home_send_items!.find((row) => row.id === "notice")!.status).toBe("classified");
    expect(tables.needs_you_items!.find((row) => row.subject_id === "notice")).toMatchObject({ status: "expired" });
  });

  it("updates a matched bill by default, marked Checking, and keeps a called-off one (owner, 2026-11-20)", async () => {
    const { client, tables } = memoryDatabase({
      households: [{ id: "h1", timezone: "Asia/Kolkata", owner_member_id: "m1" }],
      household_members: [{ id: "m1", household_id: "h1", member_type: "adult", status: "active", profile_id: "u1" }],
      household_roles: [{ household_id: "h1", member_id: "m1", role: "head" }],
      policies: [],
      needs_you_items: [],
      conversation_actions: [],
      jobs: [],
      obligations: [
        { id: "b1", household_id: "h1", name: "Electricity bill", kind: "bill", payee: "BESCOM", amount_minor: 214000, currency: "INR", due_on: "2026-11-20", recurrence: null, bill_type: null, responsible_member_id: null, status: "active", requires_review: false, updated_at: OLD },
      ],
      home_send_items: [
        { id: "newer", household_id: "h1", status: "classified", classified_kind: "bill", raw_text: "Electricity bill revised ₹2,380", title: "Electricity bill", due: "2026-11-20", readable: true, extracted: { title: "Electricity bill", amount: 2380, currency: "INR", dueDate: "2026-11-20", payee: "BESCOM" }, change: "update", retry_count: 0, created_by_member_id: "m1", created_at: OLD, updated_at: OLD },
      ],
      homesend_changes: [],
      audit_events: [],
    }, [], HOME_SEND_CHECKS);
    await runNeedsYouDeadlines(client, { now: NOW, householdIds: ["h1"], sweep: false });
    const question = tables.needs_you_items!.find((row) => row.subject_id === "newer");
    expect(question).toMatchObject({ source: "homesend_update", default_answer: "update", recipient_member_id: "m1", status: "defaulted", answer: "update" });
    // The new amount is on the bill on record — not a second bill, nothing paid — marked Checking with what it replaced, for Undo.
    expect(tables.obligations).toHaveLength(1);
    expect(tables.obligations![0]).toMatchObject({ amount_minor: 238000, status: "active" });
    expect(tables.homesend_changes![0]).toMatchObject({ intake_id: "newer", entity_id: "b1", change_type: "updated", confirmation_state: "unconfirmed", previous: { amountMinor: 214000 } });
    expect(tables.home_send_items![0]).toMatchObject({ status: "routed", routed_id: "b1", review_decision: "updated" });
  });

  it("records a waiting bill that matches nothing as Checking where bills are recorded directly", async () => {
    const { client, tables } = memoryDatabase({
      households: [{ id: "h1", timezone: "Asia/Kolkata", owner_member_id: "m1" }],
      household_members: [{ id: "m1", household_id: "h1", member_type: "adult", status: "active", profile_id: "u1" }],
      household_roles: [{ household_id: "h1", member_id: "m1", role: "head" }],
      policies: [],
      needs_you_items: [],
      conversation_actions: [],
      jobs: [],
      obligations: [],
      home_send_items: [
        { id: "water", household_id: "h1", status: "classified", classified_kind: "bill", raw_text: "Water bill ₹640", title: "Water bill", due: "2026-11-09", readable: true, extracted: { title: "Water bill", amount: 640, currency: "INR", dueDate: "2026-11-09", payee: "BWSSB" }, change: "new", retry_count: 0, created_by_member_id: "m1", created_at: OLD, updated_at: OLD },
      ],
      homesend_changes: [],
      audit_events: [],
    }, [], HOME_SEND_CHECKS);
    const result = await runNeedsYouDeadlines(client, { now: NOW, householdIds: ["h1"], sweep: false });
    expect(result.recorded).toBe(1);
    expect(tables.obligations).toHaveLength(1);
    expect(tables.obligations![0]).toMatchObject({ name: "Water bill", amount_minor: 64000, due_on: "2026-11-09" });
    expect(tables.homesend_changes![0]).toMatchObject({ intake_id: "water", domain: "bill", confirmation_state: "unconfirmed" });
    expect(tables.home_send_items![0]).toMatchObject({ status: "routed", routed_table: "obligations", review_decision: "auto_added" });
    // The next pass asks "Looks right?", whose default keeps money Checking.
    await runNeedsYouDeadlines(client, { now: NOW, householdIds: ["h1"], sweep: false });
    expect(tables.needs_you_items!.find((row) => row.subject_id === "water")).toMatchObject({ source: "homesend_check", default_answer: "keep_checking" });
    expect(tables.obligations).toHaveLength(1);
  });
});
