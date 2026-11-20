import { describe, expect, it } from "vitest";

import { memoryDatabase } from "../notifications/test-support";
import { applyHomeSendAnswer } from "./needs-you";

/**
 * "Who is this for?" (2026-11-20): a waiting health document that isn't
 * clearly its sender's is filed for them only by their own "It's mine" tap;
 * no default — "Add"'s included — ever files it under them.
 */
const OLD = "2026-11-12T09:00:00Z";
const NOW = new Date("2026-11-14T09:00:00Z");

function seed(extracted: Record<string, unknown>) {
  return memoryDatabase({
    households: [{ id: "h1", timezone: "Asia/Kolkata", owner_member_id: "m1" }],
    household_members: [
      { id: "m1", household_id: "h1", member_type: "adult", status: "active", profile_id: "u1", display_name: "Kunal Mehta" },
      { id: "m2", household_id: "h1", member_type: "adult", status: "active", profile_id: "u2", display_name: "Upasana Mehta" },
    ],
    health_provenance: [],
    health_records: [],
    home_send_items: [{ id: "lab", household_id: "h1", status: "classified", classified_kind: "health_document", raw_text: "Blood test", title: "Blood test", readable: true, extracted: { title: "Blood test", healthRecordType: "lab_result", documentDate: "2026-11-02", ...extracted }, change: "new", retry_count: 0, created_by_member_id: "m1", created_at: OLD, updated_at: OLD }],
    homesend_changes: [],
    audit_events: [],
  });
}

describe("Who is this for? (2026-11-20)", () => {
  const item = { householdId: "h1", subjectId: "lab" };

  it("files it privately for the sender on their own \"It's mine\"", async () => {
    const { client, tables } = seed({ subjectMemberName: "Upasana", people: ["Upasana"] });
    expect(await applyHomeSendAnswer(client, { ...item, source: "homesend_health_for" }, "for_me", { byDefault: false, memberId: "m1", now: NOW })).toBe("done");
    expect(tables.health_records![0]).toMatchObject({ member_id: "m1", privacy_scope: "private" });
    expect(tables.homesend_changes!.map((row) => row.confirmation_state)).toEqual(["unconfirmed"]);
  });

  it("never files it on someone else's tap, or by any default", async () => {
    const { client, tables } = seed({ subjectMemberName: "Upasana", people: ["Upasana"] });
    expect(await applyHomeSendAnswer(client, { ...item, source: "homesend_health_for" }, "for_me", { byDefault: false, memberId: "m2", now: NOW })).toBe("settled");
    expect(await applyHomeSendAnswer(client, { ...item, source: "homesend_health_for" }, "for_me", { byDefault: true, memberId: null, now: NOW })).toBe("settled");
    // An "Add this health document?" asked before this change: its default no longer files it under the sender.
    expect(await applyHomeSendAnswer(client, { ...item, source: "homesend_add" }, "add", { byDefault: true, memberId: null, now: NOW })).toBe("settled");
    expect(tables.health_records).toEqual([]);
    expect(tables.home_send_items![0]!.status).toBe("classified");
  });

  it("sets it aside by default, restorable, with its reason", async () => {
    const { client, tables } = seed({});
    expect(await applyHomeSendAnswer(client, { ...item, source: "homesend_health_for" }, "set_aside", { byDefault: true, memberId: null, now: NOW })).toBe("done");
    expect(tables.home_send_items![0]).toMatchObject({ status: "archived", archive_reason: "health_not_claimed", archived_from: "classified" });
    expect(tables.health_records).toEqual([]);
  });

  it("still files one whose own words name the sender, as \"Add\" always did", async () => {
    const { client, tables } = seed({ subjectMemberName: "Kunal" });
    expect(await applyHomeSendAnswer(client, { ...item, source: "homesend_add" }, "add", { byDefault: true, memberId: null, now: NOW })).toBe("done");
    expect(tables.health_records![0]).toMatchObject({ member_id: "m1" });
  });
});
