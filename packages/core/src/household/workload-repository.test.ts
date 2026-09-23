import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const saved: unknown[] = [];
let rows: { outcomeKey: string; primaryMemberId: string | null; backupMemberId: string | null; aiMode: string; priority: number }[] = [];

vi.mock("./configuration-repository", () => ({
  listResponsibilities: async () => rows,
  saveResponsibility: async (_supabase: unknown, input: unknown) => {
    saved.push(input);
    return { id: "r1", downstream: [] };
  },
}));
vi.mock("../identity/households", () => ({ listMembers: async () => [] }));

const { acceptRebalance } = await import("./workload-repository");

const base = { householdId: "h1", actorMemberId: "admin", members: [], outcomeKey: "school.run", fromMemberId: "priya", toMemberId: "kunal" };
const supabase = {} as SupabaseClient;

describe("accepting a suggested swap (story 03-008)", () => {
  beforeEach(() => {
    saved.length = 0;
    rows = [{ outcomeKey: "school.run", primaryMemberId: "priya", backupMemberId: "kunal", aiMode: "approve", priority: 2 }];
  });

  it("makes the backup the owner and the owner the backup, keeping everything else", async () => {
    await expect(acceptRebalance(supabase, base)).resolves.toEqual({ changed: true });
    expect(saved).toEqual([
      expect.objectContaining({
        actorMemberId: "admin",
        responsibility: { outcomeKey: "school.run", primaryMemberId: "kunal", backupMemberId: "priya", aiMode: "approve", priority: 2 },
      }),
    ]);
  });

  it("changes nothing when the swap is already in place", async () => {
    rows = [{ ...rows[0]!, primaryMemberId: "kunal", backupMemberId: "priya" }];
    await expect(acceptRebalance(supabase, base)).resolves.toEqual({ changed: false });
    expect(saved).toEqual([]);
  });

  it("refuses a suggestion the household has moved on from, rather than applying it to what is there now", async () => {
    rows = [{ ...rows[0]!, primaryMemberId: "priya", backupMemberId: "anya" }];
    await expect(acceptRebalance(supabase, base)).rejects.toMatchObject({ code: "conflict" });
    expect(saved).toEqual([]);
  });

  it("says when the outcome is not the household's", async () => {
    rows = [];
    await expect(acceptRebalance(supabase, base)).rejects.toMatchObject({ code: "not_found" });
  });
});
