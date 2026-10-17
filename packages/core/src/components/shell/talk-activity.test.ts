import { describe, expect, it } from "vitest";

import { setTalkActivity, useTalkActivity } from "./talk-activity";

describe("talk activity", () => {
  it("is a plain store the composer writes and the tab bar reads", () => {
    expect(typeof useTalkActivity).toBe("function");
    setTalkActivity("live");
    setTalkActivity("idle");
  });
});
