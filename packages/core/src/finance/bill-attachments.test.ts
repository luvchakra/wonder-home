import { describe, expect, it, vi } from "vitest";

vi.mock("../api/audit", () => ({ auditChange: vi.fn(async () => undefined) }));

import { auditChange } from "../api/audit";
import { addBillAttachment, billFilePath, checkBillFile, listBillAttachments, removeBillAttachment } from "./bill-attachments";

/** A bill's files (11-021): checked like every HomeSend upload, kept in the household's folder, never deleted. */

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const PDF = new TextEncoder().encode("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF");

function fake(opts: { insertError?: { code: string } | null; bill?: boolean; listError?: { code: string } | null } = {}) {
  const calls: { op: string; table: string; values?: unknown }[] = [];
  const removed: string[][] = [];
  const builder = (table: string) => {
    let op = "select";
    let values: unknown;
    const result = () => {
      calls.push({ op, table, values });
      if (table === "obligations") return { data: opts.bill === false ? null : { id: "b1" }, error: null };
      if (op === "insert") return { data: null, error: opts.insertError ?? null };
      if (op === "update") return { data: [{ id: "a1" }], error: null };
      if (opts.listError) return { data: null, error: opts.listError };
      return { data: [{ id: "a1", file_path: "h1/bills/b1/a1", filename: "bill.pdf", content_type: "application/pdf", byte_size: 10, uploaded_by_member_id: "m1", created_at: "2026-11-21T10:00:00Z" }], error: null };
    };
    const chain: Record<string, unknown> = {};
    for (const name of ["eq", "is", "order", "limit", "select"]) chain[name] = () => chain;
    chain.insert = (row: unknown) => ((op = "insert"), (values = row), chain);
    chain.update = (row: unknown) => ((op = "update"), (values = row), chain);
    chain.maybeSingle = async () => result();
    chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve);
    return chain;
  };
  const storage = {
    from: () => ({
      upload: async () => ({ error: null }),
      remove: async (paths: string[]) => (removed.push(paths), { error: null }),
      createSignedUrls: async (paths: string[]) => ({ data: paths.map((path) => ({ path, signedUrl: `https://signed/${path}` })) }),
    }),
  };
  return { supabase: { from: builder, storage } as never, calls, removed };
}

const clean = async () => ({ scanned: true as const, clean: true });

describe("a bill's files (11-021)", () => {
  it("takes a photo or PDF and refuses anything else, or a renamed file", () => {
    expect(checkBillFile(PNG, "image/png", "bill.png")).toEqual({ ok: true, type: "image/png" });
    expect(checkBillFile(PDF, "application/pdf", "bill.pdf")).toEqual({ ok: true, type: "application/pdf" });
    expect(checkBillFile(new TextEncoder().encode("hello"), "text/plain", "a.txt").ok).toBe(false);
    expect(checkBillFile(PDF, "image/png", "bill.png").ok).toBe(false);
    expect(checkBillFile(new Uint8Array(5 * 1024 * 1024), "image/png", "big.png").ok).toBe(false);
  });

  it("stores the file in the household's folder, records it, and audits who attached it", async () => {
    const { supabase, calls } = fake();
    await addBillAttachment(supabase, { householdId: "h1", memberId: "m1", obligationId: "b1", bytes: PDF, claimedType: "application/pdf", filename: "bill.pdf" }, { scan: clean, id: "a1" });
    expect(calls.find((c) => c.op === "insert")!.values).toMatchObject({ file_path: billFilePath("h1", "b1", "a1"), content_type: "application/pdf", uploaded_by_member_id: "m1" });
    expect(billFilePath("h1", "b1", "a1").startsWith("h1/")).toBe(true);
    expect(auditChange).toHaveBeenCalledWith(expect.objectContaining({ eventType: "finance.bill_file_added", targetId: "b1" }));
  });

  it("refuses a file the scan flags, before storing anything", async () => {
    const { supabase, calls } = fake();
    await expect(addBillAttachment(supabase, { householdId: "h1", memberId: "m1", obligationId: "b1", bytes: PDF, claimedType: "application/pdf", filename: null }, { scan: async () => ({ scanned: true, clean: false }) })).rejects.toThrow(/safety check/);
    expect(calls).toEqual([]);
  });

  it("before the migration, says so and leaves no orphan file", async () => {
    const { supabase, removed } = fake({ insertError: { code: "PGRST205" } });
    await expect(addBillAttachment(supabase, { householdId: "h1", memberId: "m1", obligationId: "b1", bytes: PNG, claimedType: "image/png", filename: null }, { scan: clean, id: "a2" })).rejects.toThrow(/switched on/);
    expect(removed).toEqual([["h1/bills/b1/a2"]]);
  });

  it("lists files with a short-lived link, and none before the migration", async () => {
    expect((await listBillAttachments(fake().supabase, "h1", "b1"))[0]).toMatchObject({ id: "a1", url: "https://signed/h1/bills/b1/a1" });
    expect(await listBillAttachments(fake({ listError: { code: "42P01" } }).supabase, "h1", "b1")).toEqual([]);
  });

  it("takes a file off by marking it removed, never deleting it", async () => {
    const { supabase, calls } = fake();
    await removeBillAttachment(supabase, { householdId: "h1", memberId: "m1", obligationId: "b1", attachmentId: "a1" });
    expect(calls.find((c) => c.op === "update")!.values).toMatchObject({ removed_by_member_id: "m1" });
    expect(calls.some((c) => c.op === "delete")).toBe(false);
  });
});
