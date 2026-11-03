import { describe, expect, it } from "vitest";

import { afterAnswer, askCorrection, checkedScore, MAX_CHECK_QUESTIONS, overTheBar, planCheckQuestions, readCheckingState, splitCheckAnswer, startChecking } from "./checking";
import { FROM_A_FILE } from "./verify";

const NOW = new Date("2026-11-03T10:00:00Z");
const FILE = { unverified: [FROM_A_FILE] };
const TEXT = { unverified: [] };

describe("the questions that raise a Checking entry over the bar (14-061, the owner 2026-11-03)", () => {
  it("confirms each key detail read from a photo or file, at most three", () => {
    const bill = { title: "Electricity", payee: "BESCOM", amount: 2140, dueDate: "2026-11-10" };
    expect(planCheckQuestions({ kind: "bill", extracted: bill, check: FILE })).toEqual([
      { field: "payee", mode: "confirm" },
      { field: "amount", mode: "confirm" },
      { field: "dueDate", mode: "confirm" },
    ]);
    expect(planCheckQuestions({ kind: "health_document", extracted: { title: "Blood test", healthRecordType: "lab_result", documentDate: "2026-11-01" }, check: FILE })).toEqual([
      { field: "recordType", mode: "confirm" },
      { field: "date", mode: "confirm" },
    ]);
  });

  it("confirms the entry by its name when the words were checked but it was heard or read unsurely, then asks a useful detail it lacks", () => {
    expect(planCheckQuestions({ kind: "grocery_item", extracted: { title: "Paneer" }, check: TEXT })).toEqual([
      { field: "name", mode: "confirm" },
      { field: "quantity", mode: "fill" },
    ]);
    // A detail already there is never asked again.
    expect(planCheckQuestions({ kind: "grocery_item", extracted: { title: "Paneer", quantity: 1, unit: "packet" }, check: TEXT })).toEqual([{ field: "name", mode: "confirm" }]);
  });

  it("asks nothing about an unknown kind, and never more than three", () => {
    expect(planCheckQuestions({ kind: "unknown", extracted: { title: "x" }, check: FILE })).toEqual([]);
    const many = planCheckQuestions({ kind: "event", extracted: { title: "Diwali dinner", dueDate: "2026-11-08" }, check: FILE });
    expect(many.length).toBeLessThanOrEqual(MAX_CHECK_QUESTIONS);
  });
});

describe("how sure it is after each answer: arithmetic someone can explain (principle 9)", () => {
  const state = startChecking({ kind: "bill", extracted: { title: "Electricity", payee: "BESCOM", amount: 2140, dueDate: "2026-11-10" }, check: FILE, recipientMemberId: "m1", score: 0.9, percent: 95 })!;

  it("starts at the reading's own score with the first question open", () => {
    expect(state.open).toEqual({ field: "payee", mode: "confirm", ordinal: 1 });
    expect(checkedScore(state)).toBeCloseTo(0.9);
    expect(overTheBar(state)).toBe(false);
  });

  it("closes a share of the gap per settled answer, confirming as soon as it is over the bar", () => {
    const one = afterAnswer(state, "yes", "hometalk", NOW);
    expect(checkedScore(one)).toBeCloseTo(0.9 + 0.1 / 3);
    expect(one.open).toEqual({ field: "amount", mode: "confirm", ordinal: 2 });
    const two = afterAnswer(one, "corrected", "whatsapp", NOW);
    // 90 + 10 × 2⁄3 ≈ 96.7%, above 95%: confirmed, the last question never asked.
    expect(two.done).toBe("confirmed");
    expect(two.open).toBeNull();
    expect(two.answered.map((entry) => entry.via)).toEqual(["hometalk", "whatsapp"]);
  });

  it("a skipped answer settles nothing; the end is one 'please check', never a fourth question", () => {
    let current = state;
    for (let index = 0; index < 3; index += 1) current = afterAnswer(current, "skipped", "hometalk", NOW);
    expect(current.done).toBe("please_check");
    expect(current.open).toBeNull();
    expect(checkedScore(current)).toBeCloseTo(0.9);
    expect(afterAnswer(current, "yes", "hometalk", NOW)).toBe(current);
  });

  it("every question answered reaches 100%, over any bar an Admin can pick", () => {
    const strict = { ...state, percent: 99 };
    const done = ["yes", "yes", "yes"].reduce((current, outcome) => afterAnswer(current, outcome as "yes", "hometalk", NOW), strict);
    expect(checkedScore(done)).toBe(1);
    expect(done.done).toBe("confirmed");
  });

  it("a no asks what it should be, the same question, not a new one", () => {
    const corrected = askCorrection(state);
    expect(corrected.open).toEqual({ field: "payee", mode: "correct", ordinal: 1 });
    expect(corrected.answered).toEqual([]);
  });

  it("reads a stored state back, and nothing from before 14-061", () => {
    expect(readCheckingState(JSON.parse(JSON.stringify(state)))).toEqual(state);
    expect(readCheckingState(null)).toBeNull();
    expect(readCheckingState({ version: 2 })).toBeNull();
  });
});

describe("splitting an answer: yes, no, skip or a value, never a guess", () => {
  it.each([
    ["yes", "yes"],
    ["Yes, that's right", "yes"],
    ["👍", "yes"],
    ["haan", "yes"],
    ["no", "no"],
    ["nope", "no"],
    ["skip", "skip"],
    ["don't know", "skip"],
  ])("%s → %s", (said, kind) => {
    expect(splitCheckAnswer("confirm", said).kind).toBe(kind);
  });

  it("takes the correction after a no", () => {
    expect(splitCheckAnswer("confirm", "No, it's 2,410")).toEqual({ kind: "value", text: "2,410" });
    expect(splitCheckAnswer("confirm", "Tata Power")).toEqual({ kind: "value", text: "Tata Power" });
    expect(splitCheckAnswer("correct", "12 Nov")).toEqual({ kind: "value", text: "12 Nov" });
  });

  it("a yes is not a value for a fill question, and nothing long is read", () => {
    expect(splitCheckAnswer("fill", "yes").kind).toBe("unread");
    expect(splitCheckAnswer("confirm", "x".repeat(200)).kind).toBe("unread");
  });
});
