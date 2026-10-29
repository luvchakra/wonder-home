import { describe, expect, it, vi } from "vitest";

import { removeBySwipe } from "./swipe-remove";

const ok = () => Promise.resolve({ ok: true });
describe("removeBySwipe", () => {
  it("takes an item off To buy with the remove action", async () => {
    const takeOffList = vi.fn(ok), stopTracking = vi.fn(ok);
    expect(await removeBySwipe({ view: "to-buy", itemId: "a", onList: 2, takeOffList, stopTracking })).toBe(true);
    expect(takeOffList).toHaveBeenCalledOnce();
    expect(stopTracking).not.toHaveBeenCalled();
  });
  it("removes the entry on All, taking it off the list first when it is on it", async () => {
    const takeOffList = vi.fn(ok), stopTracking = vi.fn(ok);
    expect(await removeBySwipe({ view: "all", itemId: "a", onList: 1, takeOffList, stopTracking })).toBe(true);
    expect(takeOffList).toHaveBeenCalledOnce();
    expect(stopTracking).toHaveBeenCalledOnce();
  });
  it("removes an item that is not on the list straight from All", async () => {
    const takeOffList = vi.fn(ok), stopTracking = vi.fn(ok);
    expect(await removeBySwipe({ view: "all", itemId: "a", onList: 0, takeOffList, stopTracking })).toBe(true);
    expect(takeOffList).not.toHaveBeenCalled();
    expect(stopTracking).toHaveBeenCalledOnce();
  });
  it("brings the row back when nothing saved", async () => {
    const fail = vi.fn(() => Promise.resolve({ ok: false }));
    expect(await removeBySwipe({ view: "to-buy", itemId: "a", onList: 1, takeOffList: fail, stopTracking: fail })).toBeNull();
    expect(await removeBySwipe({ view: "all", itemId: "a", onList: 0, takeOffList: fail, stopTracking: fail })).toBeNull();
  });
});
