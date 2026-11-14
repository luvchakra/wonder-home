import { describe, expect, it } from "vitest";

import { decideConfirmation, type ConfirmationInput } from "./confirmation";
import { FROM_A_FILE } from "./verify";

const CLEAR: ConfirmationInput = {
  kind: "grocery_item",
  extracted: { title: "Milk", needs: [], confidence: "high" },
  // Checked against what was sent: every detail found there (verify.ts).
  understanding: { readable: true, confidence: "high", score: 0.97, check: { verified: true, unverified: [] }, safety: { instructionsIgnored: false, signals: [] } },
  reconciliation: null,
  subject: null,
  memberInitiated: true,
  autonomy: "execute",
};

function decide(over: Partial<ConfirmationInput>) {
  return decideConfirmation({ ...CLEAR, ...over });
}

describe("HomeSend confirmation strategy (Wave 3 §12)", () => {
  it("applies a clear, safe, reversible item on its own only when the household set that outcome to execute", () => {
    expect(decide({}).mode).toBe("auto_apply");
    expect(decide({}).reason).toMatch(/lets WonderHome handle groceries on its own/);
    for (const autonomy of ["prepare"] as const) {
      const decision = decide({ autonomy });
      expect(decision.mode).toBe("prepare");
      expect(decision.reason).toContain("“Wait for Approval”");
    }
  });

  it("allows a new school item under the school outcome's own setting, once it is clear which child it is for", () => {
    const worksheet = { kind: "school_item" as const, extracted: { title: "Science worksheet", dueDate: "2026-11-02", needs: [], confidence: "high" as const } };
    const asmi = { memberId: "asmi", displayName: "Asmi", memberType: "child" as const };
    expect(decide({ ...worksheet, subject: { question: null, selected: asmi } }).mode).toBe("auto_apply");
    // A school item can't be added without its due date: it is asked, never guessed (the owner, 2026-10-26).
    expect(decide({ ...worksheet, extracted: { ...worksheet.extracted, dueDate: null }, subject: { question: null, selected: asmi } })).toMatchObject({ mode: "ask", question: null, reason: "It doesn't say the due date.", stillNeeded: ["due date"] });
    expect(decide({ ...worksheet, subject: null })).toMatchObject({ mode: "ask", question: "Who is this for?" });
  });

  it("adds directly, marked Checking, when it is not more than 95% sure (the owner, 2026-11-03)", () => {
    const unchecked = { readable: true, confidence: "high" as const, score: 0.9, check: { verified: false, unverified: ["the name"] }, safety: { instructionsIgnored: false, signals: [] } };
    expect(decide({ understanding: unchecked })).toMatchObject({ mode: "auto_apply", unconfirmed: true });
    expect(decide({ understanding: unchecked }).reason).toContain("marked Checking");
    // A photo or file has no words of its own to check against: added, but always Checking.
    const photo = { ...unchecked, score: 0.99, check: { verified: false, unverified: ["the original, which can't be checked word by word"] } };
    expect(decide({ understanding: photo })).toMatchObject({ mode: "auto_apply", unconfirmed: true });
    // Exactly 95% is not more than 95%.
    expect(decide({ understanding: { ...unchecked, score: 0.95, check: { verified: true, unverified: [] } } })).toMatchObject({ mode: "auto_apply", unconfirmed: true });
    // An item read before the check existed has no score: added, and checked.
    const { score: _score, check: _check, ...old } = unchecked;
    expect(decide({ understanding: old })).toMatchObject({ mode: "auto_apply", unconfirmed: true });
    // Above the bar: simply added, nothing to check.
    const above = decide({ understanding: { ...unchecked, score: 0.96, check: { verified: true, unverified: [] } } });
    expect(above.mode).toBe("auto_apply");
    expect(above.unconfirmed).toBeUndefined();
  });

  it("adds nothing, not even as Checking, when the reading names something that isn't in what was sent (the owner, 2026-11-03, decision 3)", () => {
    const invented = { readable: true, confidence: "high" as const, score: 0.9, check: { verified: false, unverified: ["the name"], untraced: ["the name"] }, safety: { instructionsIgnored: false, signals: [] } };
    const decision = decide({ understanding: invented });
    expect(decision).toMatchObject({ mode: "prepare", wait: { reason: "untraced" } });
    expect(decision.unconfirmed).toBeUndefined();
    expect(decision.reason).toBe("What WonderHome read as the name isn't in what was sent, so nothing was added: a person looks first.");
    // However sure the model and the bar: still nothing added.
    expect(decide({ understanding: { ...invented, score: 0.99 }, autoAddPercent: 50 }).mode).toBe("prepare");
    const twice = decide({ understanding: { ...invented, check: { verified: false, unverified: ["the amount", "the date"], untraced: ["the amount", "the date"] } } });
    expect(twice.reason).toContain("the amount and the date");
    // A reading stored before the field existed is decided as before.
    expect(decide({ understanding: { ...invented, check: { verified: false, unverified: ["the name"] } } })).toMatchObject({ mode: "auto_apply", unconfirmed: true });
  });

  it("never applies a bill or a health document on its own, whatever the confidence or setting (consequential)", () => {
    expect(decide({ kind: "bill" })).toMatchObject({ mode: "govern" });
    expect(decide({ kind: "health_document" })).toMatchObject({ mode: "govern" });
  });

  it("adds a medium reading marked Checking, never as if it were sure", () => {
    expect(decide({ understanding: { readable: true, confidence: "medium", safety: { instructionsIgnored: false, signals: [] } } })).toMatchObject({ mode: "auto_apply", unconfirmed: true });
  });

  it("asks one targeted question at low confidence", () => {
    const decision = decide({ understanding: { readable: true, confidence: "low", safety: { instructionsIgnored: false, signals: [] } } });
    expect(decision).toMatchObject({ mode: "ask", question: "Is this something to buy: “Milk”?" });
  });

  it("asks who it is for, rather than guessing, even when everything else is clear", () => {
    const decision = decide({ kind: "school_item", subject: { question: "Who is this for — Asmi or Manan?", selected: null } });
    expect(decision).toMatchObject({ mode: "ask", question: "Who is this for — Asmi or Manan?" });
  });

  it("asks what it is when nothing could tell", () => {
    expect(decide({ kind: "unknown" }).mode).toBe("ask");
    expect(decide({ understanding: { readable: false, confidence: "low", safety: { instructionsIgnored: false, signals: [] } } }).mode).toBe("ask");
    expect(decide({ extracted: { title: null, needs: [], confidence: "high" } })).toMatchObject({ mode: "ask", question: "What is it?" });
  });

  it("never applies on its own when the item matches a record already on file", () => {
    const decision = decide({ reconciliation: { message: "I found the existing Milk.", proposal: { type: "duplicate" } } });
    expect(decision).toMatchObject({ mode: "prepare", reason: "I found the existing Milk." });
  });

  it("never applies on its own when the content tried to instruct WonderHome", () => {
    expect(decide({ understanding: { readable: true, confidence: "high", safety: { instructionsIgnored: true, signals: ["ignore previous instructions"] } } }).mode).toBe("prepare");
  });

  it("leaves several needs for a person to confirm one by one", () => {
    const asmi = { memberId: "asmi", displayName: "Asmi", memberType: "child" as const };
    expect(decide({ kind: "school_item", subject: { question: null, selected: asmi }, extracted: { title: "Sports Day", dueDate: "2026-11-02", needs: [{ title: "White T-shirt", reason: "asked for" }], confidence: "high" } }).mode).toBe("prepare");
  });

  it("never applies an email on its own — nobody in the household was acting", () => {
    expect(decide({ memberInitiated: false }).mode).toBe("prepare");
  });
});

describe("the household's bar for adding on its own (the owner, 2026-10-26)", () => {
  const unchecked = { readable: true, confidence: "high" as const, score: 0.9, check: { verified: false, unverified: ["the name"] }, safety: { instructionsIgnored: false, signals: [] } };
  const unsure = { readable: true, confidence: "medium" as const, score: 0.7, check: { verified: false, unverified: ["the name"] }, safety: { instructionsIgnored: false, signals: [] } };

  it("is 95% until an Admin picks another, and is strictly above", () => {
    expect(decide({}).unconfirmed).toBeUndefined();
    expect(decide({ understanding: unchecked }).unconfirmed).toBe(true);
    expect(decide({ autoAddPercent: 97 })).toMatchObject({ mode: "auto_apply", unconfirmed: true });
  });

  it("follows a lower bar the Admin picked, for a clear or even a medium reading", () => {
    expect(decide({ understanding: unchecked, autoAddPercent: 85 })).toMatchObject({ mode: "auto_apply" });
    expect(decide({ understanding: unchecked, autoAddPercent: 85 }).unconfirmed).toBeUndefined();
    expect(decide({ understanding: unsure, autoAddPercent: 60 }).unconfirmed).toBeUndefined();
    expect(decide({ understanding: unsure, autoAddPercent: 70 })).toMatchObject({ mode: "auto_apply", unconfirmed: true });
  });

  it("names the household's own bar when it is still checking", () => {
    const sureButUnnamed = { ...unchecked, check: { verified: false, unverified: [] } };
    expect(decide({ understanding: sureButUnnamed, autoAddPercent: 90 }).reason).toContain("wasn't more than 90% sure");
  });

  it("never lets any bar add a bill with the money switch off, or anything under Wait for Approval", () => {
    expect(decide({ kind: "bill", autoAddPercent: 60 }).mode).toBe("govern");
    expect(decide({ kind: "health_document", autoAddPercent: 60 }).mode).toBe("govern");
    expect(decide({ understanding: unchecked, autoAddPercent: 60, autonomy: "prepare" }).mode).toBe("prepare");
  });
});

describe("what an entry can't be added without (the owner, 2026-10-26)", () => {
  it("reports what is missing and never words the question itself — HomeTalk asks", () => {
    expect(decide({ kind: "event", extracted: { title: "Diwali dinner", needs: [], confidence: "high" } })).toMatchObject({ mode: "ask", question: null, stillNeeded: ["day"], reason: "It doesn't say the day." });
    expect(decide({ kind: "bill", extracted: { title: "Electricity", payee: "BESCOM", amount: 2140, needs: [], confidence: "high" } })).toMatchObject({ mode: "govern", question: null, stillNeeded: ["due date"] });
  });

  it("never holds a grocery item back for a quantity, which is only useful", () => {
    expect(decide({ extracted: { title: "Coconut oil", quantity: null, needs: [], confidence: "high" } }).mode).toBe("auto_apply");
  });
});

describe("a clear move updates the record on file instead of asking (14-066, part 3)", () => {
  const reading = { readable: true, confidence: "high" as const, score: 0.98, check: { verified: true, unverified: [] }, safety: { signals: [], instructionsIgnored: false } };
  const move = {
    message: "I found Asmi's existing Science Exhibition for 28 Sep. This message says it moved to 29 Sep. Update the existing event?",
    existingId: "s-sci",
    existing: { title: "Science Exhibition", date: "2026-09-28", status: "pending", subjectMemberId: "asmi", subjectName: "Asmi", amountMinor: null },
    proposal: { type: "update" as const, changes: [{ field: "date" as const, from: "2026-09-28", to: "2026-09-29" }], clear: true as const },
  };
  const base: ConfirmationInput = {
    kind: "school_item",
    extracted: { title: "Science Exhibition", dueDate: "2026-09-29", needs: [], confidence: "high" } as never,
    understanding: reading,
    reconciliation: move,
    subject: { question: null, selected: { memberId: "asmi" } } as never,
    memberInitiated: true,
    autonomy: "execute",
  };

  it("Pre Approved and over the bar: moved, with Undo, never a second copy", () => {
    const decision = decideConfirmation(base);
    expect(decision.mode).toBe("auto_apply");
    expect(decision.update).toEqual({ existingId: "s-sci", title: "Science Exhibition", from: "2026-09-28", to: "2026-09-29" });
    expect(decision.unconfirmed).toBeUndefined();
  });

  it("everything that holds an add holds a move", () => {
    expect(decideConfirmation({ ...base, autonomy: "prepare" }).mode).toBe("prepare");
    expect(decideConfirmation({ ...base, memberInitiated: false }).mode).toBe("prepare");
    expect(decideConfirmation({ ...base, understanding: { ...reading, score: 0.9 } }).update).toBeUndefined();
    expect(decideConfirmation({ ...base, understanding: { ...reading, check: { verified: false, unverified: [FROM_A_FILE] } } as never }).mode).toBe("prepare");
    expect(decideConfirmation({ ...base, understanding: { ...reading, safety: { signals: ["instruction"], instructionsIgnored: true } } as never }).mode).toBe("prepare");
    // A bill waits unless an Admin lets money entries in directly.
    expect(decideConfirmation({ ...base, kind: "bill", extracted: { title: "Electricity", payee: "BESCOM", amount: 2140, dueDate: "2026-11-12", needs: [], confidence: "high" } as never }).mode).toBe("govern");
  });

  it("a move that isn't clear is offered, as before", () => {
    const offered = decideConfirmation({ ...base, reconciliation: { ...move, proposal: { type: "update", changes: move.proposal.changes } } });
    expect(offered.mode).toBe("prepare");
    expect(offered.reason).toBe(move.message);
  });
});

describe("record first (the owner, 2026-11-14; decisions 1, 2 and 5)", () => {
  const bill = { kind: "bill" as const, extracted: { title: "Electricity", payee: "BESCOM", amount: 2140, dueDate: "2026-11-20", needs: [], confidence: "high" as const } };
  const checkingMoney = { money: true, health: true, checking: { money: true, health: true } };

  it("decision 1: an area on Wait for Approval still records what is sent, since recording is reversible", () => {
    const decision = decide({ autonomy: "prepare", approvalScope: "actions" });
    expect(decision.mode).toBe("auto_apply");
    expect(decision.reason).toContain("holds actions like paying or ordering");
    // Switched back to "Everything": the 3 Nov behaviour.
    expect(decide({ autonomy: "prepare", approvalScope: "everything" }).mode).toBe("prepare");
    // A move of a record already on file is a change, not a new record: it still waits.
    const move = { message: "moved", existingId: "s-1", existing: { title: "Milk", date: "2026-11-01" }, proposal: { type: "update" as const, changes: [{ field: "date" as const, from: "2026-11-01", to: "2026-11-02" }], clear: true as const } };
    expect(decide({ autonomy: "prepare", approvalScope: "actions", reconciliation: move as never }).mode).toBe("prepare");
  });

  it("decision 2: a bill on Record as Checking is recorded, always Checking, never paid", () => {
    const decision = decide({ ...bill, directAdd: checkingMoney });
    expect(decision).toMatchObject({ mode: "auto_apply", unconfirmed: true });
    expect(decision.reason).toContain("Money entries are marked Checking");
    // Record as confirmed: over the bar, simply recorded.
    expect(decide({ ...bill, directAdd: { money: true, health: true } }).unconfirmed).toBeUndefined();
    // Wait for review: the 3 Nov behaviour.
    expect(decide({ ...bill, directAdd: { money: false, health: false } }).mode).toBe("govern");
    // With Wait for Approval on bills and decision 1, still recorded as Checking.
    expect(decide({ ...bill, directAdd: checkingMoney, autonomy: "prepare", approvalScope: "actions" })).toMatchObject({ mode: "auto_apply", unconfirmed: true });
  });

  it("decision 2: a health document needs the person it is for before it is filed", () => {
    const health = { kind: "health_document" as const, extracted: { title: "Blood test", documentDate: "2026-11-10", healthRecordType: "lab_report", subjectMemberName: "Meera", needs: [], confidence: "high" as const } as never, directAdd: checkingMoney };
    expect(decide(health)).toMatchObject({ mode: "ask", question: "Who is this for?" });
    expect(decide({ ...health, subject: { question: null, selected: { memberId: "meera" } } as never })).toMatchObject({ mode: "auto_apply", unconfirmed: true });
  });

  it("decision 5: an email from a trusted sender flows like a member's item; an untrusted one waits", () => {
    expect(decide({ memberInitiated: false }).mode).toBe("prepare");
    expect(decide({ memberInitiated: false, trustedSender: true }).mode).toBe("auto_apply");
    // Its content is still untrusted: instructions inside it hold it.
    expect(decide({ memberInitiated: false, trustedSender: true, understanding: { ...CLEAR.understanding!, safety: { instructionsIgnored: true, signals: ["instruction"] } } }).mode).toBe("prepare");
  });
});
