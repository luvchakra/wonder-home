import { describe, expect, it } from "vitest";

import { mayRemoveHomeSendItem } from "./remove";

describe("who may remove a HomeSend item", () => {
  const item = { createdByMemberId: "m1" };
  it("lets its adult sender", () => expect(mayRemoveHomeSendItem({ memberId: "m1", memberType: "adult", isAdmin: false }, item)).toBe(true));
  it("lets any Admin", () => expect(mayRemoveHomeSendItem({ memberId: "m2", memberType: "adult", isAdmin: true }, item)).toBe(true));
  it("refuses another adult", () => expect(mayRemoveHomeSendItem({ memberId: "m2", memberType: "adult", isAdmin: false }, item)).toBe(false));
  it("refuses a child and a helper, even the sender", () => {
    expect(mayRemoveHomeSendItem({ memberId: "m1", memberType: "child", isAdmin: false }, item)).toBe(false);
    expect(mayRemoveHomeSendItem({ memberId: "m1", memberType: "helper", isAdmin: false }, item)).toBe(false);
  });
  it("leaves an item with no household sender to Admins", () => {
    expect(mayRemoveHomeSendItem({ memberId: "m1", memberType: "adult", isAdmin: false }, { createdByMemberId: null })).toBe(false);
    expect(mayRemoveHomeSendItem({ memberId: "m1", memberType: "adult", isAdmin: true }, { createdByMemberId: null })).toBe(true);
  });
});
