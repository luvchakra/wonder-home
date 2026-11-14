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

  it("applies no default when an Admin switched decision 4 off, and closes the question at 48 hours instead", async () => {
    const { client, tables } = seed();
    tables.policies!.push({ household_id: "h1", category: "ai_autonomy", name: "Apply a question's default after a day", active: true, rule: { on: false } });
    await runNeedsYouDeadlines(client, { now: NOW, householdIds: ["h1"], sweep: false });
    expect(tables.homesend_changes!.find((row) => row.id === "c2")!.confirmation_state).toBe("unconfirmed");
    expect(tables.home_send_items!.find((row) => row.id === "notice")!.status).toBe("classified");
    expect(tables.needs_you_items!.find((row) => row.subject_id === "notice")).toMatchObject({ status: "expired" });
  });
});
