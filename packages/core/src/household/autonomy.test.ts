import { describe, expect, it } from "vitest";

import {
  AUTONOMY_DESCRIPTIONS,
  AUTONOMY_MODES,
  decideAutonomy,
  mayExecuteNow,
  type ProposedAction,
} from "./autonomy";

const action = (over: Partial<ProposedAction> = {}): ProposedAction => ({
  outcomeKey: "groceries.stocked",
  kind: "order",
  reversible: true,
  ...over,
});

describe("autonomy decisions", () => {
  it("lets reading and drafting happen in any mode, including observe", () => {
    for (const mode of AUTONOMY_MODES) {
      expect(decideAutonomy(mode, action({ kind: "read" })).outcome).toBe("execute");
      expect(decideAutonomy(mode, action({ kind: "draft" })).outcome).toBe("execute");
    }
  });

  it("changes nothing in observe mode", () => {
    expect(decideAutonomy("observe", action()).outcome).toBe("observe_only");
    expect(decideAutonomy("observe", action({ kind: "schedule" })).outcome).toBe("observe_only");
  });

  it("gets things ready but stops short in prepare mode", () => {
    expect(decideAutonomy("prepare", action()).outcome).toBe("prepare_only");
  });

  it("waits for a yes in approve mode", () => {
    expect(decideAutonomy("approve", action()).outcome).toBe("needs_approval");
  });

  it("acts in execute mode", () => {
    const decision = decideAutonomy("execute", action());
    expect(decision.outcome).toBe("execute");
    expect(mayExecuteNow(decision)).toBe(true);
  });

  it("never lets a payment run unattended, even on execute", () => {
    for (const mode of ["prepare", "approve", "execute"] as const) {
      const decision = decideAutonomy(mode, action({ kind: "payment", amountMinor: 284_000 }));
      expect(decision.outcome, `payment ran unattended in ${mode}`).toBe("needs_approval");
      expect(mayExecuteNow(decision)).toBe(false);
    }
  });

  it("never lets a permission change or deletion run unattended", () => {
    for (const kind of ["permission_change", "delete"] as const) {
      expect(decideAutonomy("execute", action({ kind })).outcome).toBe("needs_approval");
    }
  });

  it("does not turn observe into an approval prompt the household never invited", () => {
    // A household that asked for nothing to happen gets a proposal, not a
    // steady stream of "approve this?" interruptions.
    expect(decideAutonomy("observe", action({ kind: "payment" })).outcome).toBe("observe_only");
  });

  it("asks a person before anything that cannot be undone", () => {
    expect(decideAutonomy("prepare", action({ reversible: false })).outcome).toBe("needs_approval");
    expect(decideAutonomy("approve", action({ reversible: false })).outcome).toBe("needs_approval");
  });

  it("respects an explicit execute setting for an irreversible action", () => {
    // The household said execute for this outcome specifically; that is a
    // decision they are allowed to make for anything but the three reserved kinds.
    expect(decideAutonomy("execute", action({ reversible: false })).outcome).toBe("execute");
  });

  it("always gives a reason a person could read", () => {
    for (const mode of AUTONOMY_MODES) {
      const decision = decideAutonomy(mode, action());
      expect(decision.reason.length).toBeGreaterThan(10);
      expect(decision.reason).toMatch(/[.!]$/);
    }
  });

  it("describes every mode in the household's own terms", () => {
    for (const mode of AUTONOMY_MODES) {
      expect(AUTONOMY_DESCRIPTIONS[mode], `${mode} needs a description`).toBeTruthy();
    }
  });
});
