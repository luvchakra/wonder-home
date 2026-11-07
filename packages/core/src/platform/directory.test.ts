import { describe, expect, it, vi } from "vitest";

import type { PlatformAdmin } from "./admin";
import { householdDetail, listGrants, listHouseholds, listPeople, PAGE_SIZE, planBreakdown, PlatformOwnerRequired } from "./directory";

const asRole = (role: PlatformAdmin["role"]): PlatformAdmin => ({ profileId: "p1", role });
const fakeAdmin = () => {
  const rpc = vi.fn(async () => ({ data: { total: 0, rows: [] }, error: null }));
  return { admin: { rpc } as never, rpc };
};

describe("platform directory", () => {
  it("refuses every role but owner, before any database call", async () => {
    for (const role of ["support", "operator"] as const) {
      const { admin, rpc } = fakeAdmin();
      const a = asRole(role);
      expect(() => listHouseholds(admin, a, { page: 1 })).toThrow(PlatformOwnerRequired);
      expect(() => listPeople(admin, a, { page: 1 })).toThrow(PlatformOwnerRequired);
      expect(() => listGrants(admin, a)).toThrow(PlatformOwnerRequired);
      expect(() => householdDetail(admin, a, "x")).toThrow(PlatformOwnerRequired);
      expect(() => planBreakdown(admin, a)).toThrow(PlatformOwnerRequired);
      expect(rpc).not.toHaveBeenCalled();
    }
  });

  it("asks the database for one bounded page, naming the actor", async () => {
    const { admin, rpc } = fakeAdmin();
    await listHouseholds(admin, asRole("owner"), { plan: "pro", search: "mehta", page: 3 });
    expect(rpc).toHaveBeenCalledWith("platform_directory_households", { p_actor: "p1", p_plan: "pro", p_search: "mehta", p_limit: PAGE_SIZE, p_offset: 2 * PAGE_SIZE });
  });

  it("raises a database refusal instead of returning empty lists", async () => {
    const admin = { rpc: async () => ({ data: null, error: { code: "42501" } }) } as never;
    await expect(listPeople(admin, asRole("owner"), { page: 1 })).rejects.toThrow("42501");
  });
});
