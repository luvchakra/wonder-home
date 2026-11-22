import { describe, expect, it } from "vitest";

import { measureLearning, REPLAY_CASES, runReplay, runUnseen } from "./learning";

describe("HomeSend unseen kinds and learning (14-085)", () => {
  it("decides every unseen kind as expected, with no unsafe action", async () => {
    const results = await runUnseen();
    expect(results.filter((r) => !r.pass)).toEqual([]);
    expect(results.reduce((sum, r) => sum + r.unsafe, 0)).toBe(0);
  });

  it("never learns money or health as a rule", async () => {
    const results = await runUnseen();
    for (const id of ["HS-L07", "HS-L11"]) expect(results.find((r) => r.id === id)?.learnable).toBe(false);
  });

  it("replays decide, correct, then decided right", () => {
    const [r01, r02, r03] = REPLAY_CASES.map(runReplay);
    expect(r01!.before).toEqual([true, true, true, false, false]);
    expect(r01!.after).toEqual([true, true, true, true, true]);
    expect(r01!.ruleApplied).toEqual([false, false, false, true, true]);
    expect(r02!.after.at(-1)).toBe(true);
    expect(r02!.ruleApplied.at(-1)).toBe(true);
    expect(r03!.ruleApplied.at(-1)).toBe(false);
  });

  it("measures before and after", async () => {
    const m = await measureLearning();
    expect(m.unseen.pass).toBe(m.unseen.of);
    expect(m.replay.pass).toBe(m.replay.of);
    expect(m.rightAfter).toBeGreaterThan(m.rightBefore);
    expect(m.unsafe).toBe(0);
  });
});
