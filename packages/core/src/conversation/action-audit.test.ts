import { describe, expect, it, vi } from "vitest";

const audited: unknown[] = [];
vi.mock("../api/audit", () => ({ auditChange: async (entry: unknown) => void audited.push(entry) }));

const { markActionResult } = await import("./repository");

/** Test spec DATA-005: a change HomeTalk made is on the household's audit trail, with where it came from. */

function admin() {
  const updates: unknown[] = [];
  const client = { from: () => ({ update: (value: unknown) => ({ eq: async () => (updates.push(value), { error: null }) }) }) };
  return { client: client as never, updates };
}

describe("DATA-005 — what HomeTalk changed is audited with its channel", () => {
  it("an executed action is recorded with the action, the member, the channel and whether it was spoken", async () => {
    audited.length = 0;
    const db = admin();
    await markActionResult(db.client, {
      actionId: "act-1", status: "executed", result: { added: "Milk" },
      audit: { householdId: "h-1", actorMemberId: "m-1", actionType: "add_to_list", source: "alexa", modality: "voice" },
    });
    expect(db.updates).toHaveLength(1);
    expect(audited).toEqual([
      { householdId: "h-1", actorMemberId: "m-1", eventType: "hometalk.executed", targetTable: "conversation_actions", targetId: "act-1", metadata: { action: "add_to_list", source: "alexa", modality: "voice" } },
    ]);
  });

  it("an add that found it already there changed nothing, so it is not audited as a change (live E2E-003)", async () => {
    audited.length = 0;
    await markActionResult(admin().client, {
      actionId: "act-3", status: "executed", result: { alreadyTracked: true },
      audit: { householdId: "h-1", actorMemberId: "m-1", actionType: "add_to_list", source: "web", modality: "text" },
    });
    expect(audited).toEqual([]);
  });

  it("a failed action changed nothing, so there is nothing to audit", async () => {
    audited.length = 0;
    await markActionResult(admin().client, {
      actionId: "act-2", status: "failed", result: { reason: "no list" },
      audit: { householdId: "h-1", actorMemberId: "m-1", actionType: "add_to_list", source: "web", modality: "text" },
    });
    expect(audited).toEqual([]);
  });
});
