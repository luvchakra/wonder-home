import { describe, expect, it } from "vitest";

import { handedBackText } from "../hometalk/intake-questions";
import { addedReply } from "../whatsapp/intake";
import { asAutoAddPercent, AUTO_ADD_PERCENTS, DEFAULT_AUTO_ADD_PERCENT, scorePercent, sureClause, sureWhy } from "./auto-add";
import { FROM_A_FILE } from "./verify";

describe("HomeSend's bar for adding on its own", () => {
  it("offers only the bars WonderHome lists, 95 by default", () => {
    expect(DEFAULT_AUTO_ADD_PERCENT).toBe(95);
    expect(AUTO_ADD_PERCENTS).toContain(95);
    expect(asAutoAddPercent(85)).toBe(85);
    expect(asAutoAddPercent("70")).toBe(70);
    for (const odd of [0, 50, 100, 94, "abc", null, undefined]) expect(asAutoAddPercent(odd)).toBe(95);
  });

  it("shows a reading's score as a whole percent", () => {
    expect(scorePercent(0.97)).toBe(97);
    expect(scorePercent(0.7)).toBe(70);
    expect(scorePercent(undefined)).toBeNull();
  });

  it("says why a reading scored what it did", () => {
    expect(sureWhy({ check: { verified: true, unverified: [] }, confidence: "high" })).toBe("verified");
    expect(sureWhy({ check: { verified: false, unverified: [FROM_A_FILE] }, confidence: "high" })).toBe("file");
    expect(sureWhy({ check: { verified: false, unverified: ["date"] }, confidence: "high" })).toBe("missing");
    expect(sureWhy({ check: null, confidence: "medium" })).toBe("unsure");
    expect(sureWhy({ check: null, confidence: "high" })).toBeNull();
  });

  // Design §7: every "added on its own" message says how sure, and why.
  it("puts how sure, and why, in every added-on-its-own message", () => {
    const added = { title: "Maths worksheet", where: "Kids & School", percent: 97, why: "verified" as const };
    expect(sureClause(added)).toBe(" (97% sure — every detail is in what you sent)");
    expect(sureClause({ percent: null })).toBe("");
    expect(addedReply(added)).toBe("✅ Added *Maths worksheet* to Kids & School (97% sure — every detail is in what you sent) — your household lets WonderHome add these on its own. You can undo it in HomeSend.");
    expect(handedBackText("Got it, thanks.", { added, stillNeeded: [] })).toContain("to Kids & School (97% sure — every detail is in what you sent) —");
  });
});
