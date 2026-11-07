import { describe, expect, it, vi } from "vitest";

import { deleteArchivedHomeSendItems, removeHomeSendItems, restoreHomeSendItems } from "./repository";

vi.mock("../api/audit", () => ({ auditChange: vi.fn(async () => undefined) }));

type Call = { table: string; op: string; payload?: unknown };

/** A tiny chainable stand-in: every table answers with the rows given, and records what was written or removed. */
function fake(rows: Record<string, Record<string, unknown>[]>) {
  const calls: Call[] = [];
  const removedFiles: string[][] = [];
  const builder = (table: string, op = "select", payload?: unknown) => {
    const chain: Record<string, unknown> = {};
    const done = () => {
      calls.push({ table, op, payload });
      return { data: rows[table] ?? [], error: null };
    };
    for (const name of ["select", "eq", "neq", "in", "is", "order", "limit"]) chain[name] = () => (name === "select" && op !== "select" ? Object.assign(Promise.resolve(done()), chain) : chain);
    chain.update = (value: unknown) => builder(table, "update", value);
    chain.delete = () => builder(table, "delete");
    chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(done()).then(resolve);
    return chain;
  };
  const supabase = {
    from: (table: string) => builder(table),
    storage: { from: () => ({ remove: async (paths: string[]) => (removedFiles.push(paths), { error: null }) }) },
  };
  return { supabase: supabase as never, calls, removedFiles };
}

const adult = { memberId: "m2", memberType: "adult", isAdmin: false };
const admin = { memberId: "m9", memberType: "adult", isAdmin: true };

describe("removing a HomeSend item", () => {
  const rows = { home_send_items: [{ id: "a", status: "classified", routed_table: null, created_by_member_id: "m1" }] };

  it("archives it with the reason removed_by_person, remembering where it was", async () => {
    const { supabase, calls } = fake(rows);
    const result = await removeHomeSendItems(supabase, "h", ["a"], admin);
    expect(result.moved).toEqual(["a"]);
    const update = calls.find((call) => call.op === "update")!.payload as Record<string, unknown>;
    expect(update).toMatchObject({ status: "archived", archived_from: "classified", archive_reason: "removed_by_person" });
  });

  it("refuses an adult who is neither the sender nor an Admin, and writes nothing", async () => {
    const { supabase, calls } = fake(rows);
    const result = await removeHomeSendItems(supabase, "h", ["a"], adult);
    expect(result).toEqual({ moved: [], refused: 1 });
    expect(calls.some((call) => call.op === "update")).toBe(false);
  });

  it("keeps an added (routed) item as 'routed' so Restore can put it back", async () => {
    const { supabase, calls } = fake({ home_send_items: [{ id: "r", status: "undone", routed_table: "obligations", created_by_member_id: "m2" }] });
    await removeHomeSendItems(supabase, "h", ["r"], adult);
    expect((calls.find((call) => call.op === "update")!.payload as Record<string, unknown>).archived_from).toBe("routed");
  });

  it("restores a removed added-item as undone, and leaves a tidy-archived routed one alone", async () => {
    const removed = fake({ home_send_items: [{ id: "r", archived_from: "routed", archive_reason: "removed_by_person" }] });
    expect(await restoreHomeSendItems(removed.supabase, "h", ["r"])).toEqual(["r"]);
    expect((removed.calls.find((call) => call.op === "update")!.payload as Record<string, unknown>).status).toBe("undone");
    const tidied = fake({ home_send_items: [{ id: "t", archived_from: "routed", archive_reason: "already_recorded" }] });
    expect(await restoreHomeSendItems(tidied.supabase, "h", ["t"])).toEqual([]);
  });
});

describe("deleting archived HomeSend items for good", () => {
  it("deletes the row and its stored file, and an attachment's file", async () => {
    const { supabase, calls, removedFiles } = fake({
      home_send_items: [{ id: "a", file_path: "h/a.pdf", created_by_member_id: "m2", parent_item_id: "a" }],
      homesend_changes: [],
    });
    const result = await deleteArchivedHomeSendItems(supabase, "h", { ids: ["a"], actor: adult });
    expect(result.deleted).toEqual(["a"]);
    expect(removedFiles[0]).toContain("h/a.pdf");
    expect(calls.some((call) => call.table === "home_send_items" && call.op === "delete")).toBe(true);
  });

  it("keeps an item that still has a live entry on record", async () => {
    const { supabase, calls, removedFiles } = fake({
      home_send_items: [{ id: "a", file_path: "h/a.pdf", created_by_member_id: "m2" }],
      homesend_changes: [{ intake_id: "a" }],
    });
    const result = await deleteArchivedHomeSendItems(supabase, "h", { ids: ["a"], actor: adult });
    expect(result).toEqual({ deleted: [], kept: 1 });
    expect(removedFiles).toEqual([]);
    expect(calls.some((call) => call.op === "delete")).toBe(false);
  });

  it("touches nothing of another member's when the actor is not an Admin", async () => {
    const { supabase, calls, removedFiles } = fake({ home_send_items: [{ id: "a", file_path: "h/a.pdf", created_by_member_id: "m1" }], homesend_changes: [] });
    const result = await deleteArchivedHomeSendItems(supabase, "h", { ids: ["a"], actor: adult });
    expect(result).toEqual({ deleted: [], kept: 0 });
    expect(removedFiles).toEqual([]);
    expect(calls.some((call) => call.op === "delete")).toBe(false);
  });
});
