import { describe, expect, it } from "vitest";

import { createNotification, type NotifyInput } from "./create";

/** The open row createNotification finds, and every update it then tries, with its filters. */
function fakeAdmin(existing: { id: string; title: string; body: string; status: string }, updatedRows = 1) {
  const updates: { patch: Record<string, unknown>; filters: string[] }[] = [];
  const admin = {
    from() {
      let update: (typeof updates)[number] | null = null;
      const chain: Record<string, unknown> = {
        select: () => (update ? Promise.resolve({ data: Array.from({ length: updatedRows }, () => ({ id: existing.id })), error: null }) : chain),
        eq: (column: string, value: unknown) => (update?.filters.push(`${column}=${String(value)}`), chain),
        in: () => chain,
        maybeSingle: async () => ({ data: existing, error: null }),
        update: (patch: Record<string, unknown>) => ((update = { patch, filters: [] }), updates.push(update), chain),
      };
      return chain;
    },
  };
  return { admin: admin as never, updates };
}

const notice = (title: string, body: string): NotifyInput =>
  ({
    householdId: "h1",
    decision: {
      kind: "notify",
      recipientMemberId: "m1",
      type: "action",
      threadKey: "chat:t1",
      updatesExistingThread: true,
      deliverAt: new Date("2026-10-22T10:00:00Z"),
      impact: body,
      action: { action: "open", target: "/chat/t1" },
      factors: { riskLevel: "low", source: "chat_thread" },
    },
    title,
    body,
    category: "family",
    source: { type: "chat_thread", id: "t1" },
    refreshUnread: true,
  }) as NotifyInput;

describe("rewriting an open notice (the owner's review, 2026-10-22: one chat message rewrote its notice three times)", () => {
  const open = { id: "n1", title: "New in Family chat", body: "1 new message from Asmi", status: "delivered" };

  it("leaves a notice alone when it already says this", async () => {
    const { admin, updates } = fakeAdmin(open);
    expect(await createNotification(admin, notice(open.title, open.body))).toEqual({ id: "n1" });
    expect(updates).toHaveLength(0);
  });

  it("rewrites it only over the words it read, and brings it back unread", async () => {
    const { admin, updates } = fakeAdmin(open);
    expect(await createNotification(admin, notice(open.title, "2 new messages from Asmi"))).toEqual({ id: "n1" });
    expect(updates).toHaveLength(1);
    expect(updates[0]!.filters).toEqual(["id=n1", `title=${open.title}`, `body=${open.body}`]);
    expect(updates[0]!.patch).toMatchObject({ body: "2 new messages from Asmi", status: "delivered", seen_at: null });
  });

  it("changes nothing when a concurrent writer got there first", async () => {
    const { admin } = fakeAdmin(open, 0);
    expect(await createNotification(admin, notice(open.title, "2 new messages from Asmi"))).toBeNull();
  });
});
