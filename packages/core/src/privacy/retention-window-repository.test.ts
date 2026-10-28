import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_RETENTION_WINDOW_DAYS,
  loadRetentionWindow,
  loadRetentionWindows,
  parseRetentionWindow,
  saveRetentionWindow,
} from "./retention-window-repository";

vi.mock("../household/configuration-repository", () => ({
  savePolicy: vi.fn(async () => ({ id: "policy-1", downstream: [] })),
}));
import { savePolicy } from "../household/configuration-repository";

/** A chainable stub whose terminal `.limit()` resolves to a canned answer. */
function policies(answer: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    limit: async () => answer,
  };
  return { from: () => chain } as never;
}

describe("parseRetentionWindow", () => {
  it("reads a sensible day count", () => {
    expect(parseRetentionWindow({ days: 90 })).toBe(90);
    expect(parseRetentionWindow({ days: 30 })).toBe(30);
  });
  it("treats explicit null as off", () => {
    expect(parseRetentionWindow({ days: null })).toBeNull();
  });
  it("treats a missing or malformed value as off (the safe side, keep)", () => {
    expect(parseRetentionWindow({})).toBeNull();
    expect(parseRetentionWindow({ days: "90" })).toBeNull();
    expect(parseRetentionWindow({ days: 2 })).toBeNull(); // below the 7-day floor
    expect(parseRetentionWindow({ days: 99999 })).toBeNull(); // above the max
    expect(parseRetentionWindow(null)).toBeNull();
  });
});

describe("loadRetentionWindow", () => {
  it("defaults to 90 days when no row is stored", async () => {
    expect(await loadRetentionWindow(policies({ data: [], error: null }), "h1")).toEqual({
      days: DEFAULT_RETENTION_WINDOW_DAYS,
      ok: true,
    });
  });
  it("reads a stored window", async () => {
    expect(await loadRetentionWindow(policies({ data: [{ rule: { days: 180 } }], error: null }), "h1")).toEqual({
      days: 180,
      ok: true,
    });
  });
  it("reads an off window", async () => {
    expect(await loadRetentionWindow(policies({ data: [{ rule: { days: null } }], error: null }), "h1")).toEqual({
      days: null,
      ok: true,
    });
  });
  it("fails to ok:false (skip cleanup) on a read error", async () => {
    const result = await loadRetentionWindow(policies({ data: null, error: { code: "oops" } }), "h1");
    expect(result.ok).toBe(false);
  });
});

describe("loadRetentionWindows", () => {
  it("maps each household and reports ok", async () => {
    const { windows, ok } = await loadRetentionWindows(
      policies({
        data: [
          { household_id: "h1", rule: { days: 30 } },
          { household_id: "h2", rule: { days: null } },
        ],
        error: null,
      }),
    );
    expect(ok).toBe(true);
    expect(windows.get("h1")).toBe(30);
    expect(windows.get("h2")).toBeNull();
    expect(windows.has("h3")).toBe(false);
  });
  it("reports ok:false on error so the whole run is skipped", async () => {
    const { ok } = await loadRetentionWindows(policies({ data: null, error: { code: "x" } }));
    expect(ok).toBe(false);
  });
});

describe("saveRetentionWindow", () => {
  it("rejects a window outside the allowed range", async () => {
    await expect(saveRetentionWindow({} as never, { householdId: "h1", actorMemberId: "m1", days: 3 })).rejects.toThrow();
    await expect(saveRetentionWindow({} as never, { householdId: "h1", actorMemberId: "m1", days: 99999 })).rejects.toThrow();
    expect(savePolicy).not.toHaveBeenCalled();
  });
  it("saves a valid window and off (null) through savePolicy", async () => {
    await saveRetentionWindow({} as never, { householdId: "h1", actorMemberId: "m1", days: 90 });
    await saveRetentionWindow({} as never, { householdId: "h1", actorMemberId: "m1", days: null });
    expect(savePolicy).toHaveBeenCalledTimes(2);
    expect(vi.mocked(savePolicy).mock.calls[0]![1]).toMatchObject({ category: "privacy", rule: { days: 90 } });
    expect(vi.mocked(savePolicy).mock.calls[1]![1]).toMatchObject({ rule: { days: null } });
  });
});
