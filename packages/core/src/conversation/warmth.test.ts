import { describe, expect, it } from "vitest";

import { protectForTranslation } from "./reply-language";
import { speakable } from "./speech";
import { UNDO_LINE, warmReply, warmUndo } from "./warmth";

describe("a warm emoji on HomeTalk's replies", () => {
  it("leads a confirmation with what was done, and the Undo line closes it", () => {
    const text = `Added **Milk** to the [shopping list](/groceries?view=to-buy). ${UNDO_LINE}`;
    expect(warmReply(text, { action: "add_to_list", proposal: "executed", ok: true })).toBe(`🛒 ${text}`);
    expect(warmReply("Reminder set for **call the plumber**.", { action: "set_reminder", proposal: "executed", ok: true })).toBe("⏰ Reminder set for **call the plumber**.");
    expect(warmReply("Recorded.", { action: "raise_service_request", proposal: "executed", ok: true })).toBe("✅ Recorded.");
  });

  it("closes an ordinary answer warmly and leads a greeting or a place", () => {
    expect(warmReply("Nothing is waiting on you today.", { action: "ask_status", proposal: "answer", ok: true })).toBe("Nothing is waiting on you today. 😊");
    expect(warmReply("Hello Asha.", { action: "greet", proposal: "answer", ok: true })).toBe("👋 Hello Asha.");
    expect(warmReply("Here is what I would do — add milk. Shall I go ahead?", { action: "add_to_list", proposal: "needs_approval", ok: true })).toBe("📝 Here is what I would do — add milk. Shall I go ahead?");
  });

  it("stays plain on questions, refusals, failures, the Why? evidence and money, health or a child", () => {
    const plain = "Which day is it?";
    expect(warmReply(plain, { action: "plan_event", proposal: "clarify", ok: true })).toBe(plain);
    expect(warmReply("You need an Admin for that.", { action: "make_payment", proposal: "refused", ok: true })).toBe("You need an Admin for that.");
    expect(warmReply("I tried, and it did not go through.", { action: "add_to_list", proposal: "executed", ok: false })).toBe("I tried, and it did not go through.");
    expect(warmReply("Because the bill is due Friday.", { action: "unknown", proposal: "answer", ok: true, explained: true })).toBe("Because the bill is due Friday.");
    expect(warmReply("Anya's test is on Friday.", { action: "ask_status", proposal: "answer", ok: true, classes: ["child"] })).toBe("Anya's test is on Friday.");
    expect(warmReply("Here is what I would do — pay the bill. Shall I go ahead?", { action: "make_payment", proposal: "needs_approval", ok: true })).toBe("Here is what I would do — pay the bill. Shall I go ahead?");
    expect(warmReply("Logged the headache.", { action: "log_health_issue", proposal: "answer", ok: true })).toBe("Logged the headache.");
  });

  it("adds one, never a second", () => {
    expect(warmReply("Got it 👍", { action: "ask_status", proposal: "answer", ok: true })).toBe("Got it 👍");
    expect(warmUndo("Took **Milk** off the list.")).toBe("↩️ Took **Milk** off the list.");
  });

  it("is never spoken", () => {
    const text = warmReply(`Added **Milk** to the [shopping list](/groceries). ${UNDO_LINE}`, { action: "add_to_list", proposal: "executed", ok: true });
    expect(speakable(text)).toBe("Added Milk to the shopping list. Say undo to take it back.");
    expect(speakable(warmReply("Nothing is waiting on you today.", { action: "ask_status", proposal: "answer", ok: true }))).toBe("Nothing is waiting on you today.");
  });

  it("is handed to a translator as a token, so it comes back exactly", () => {
    const shown = protectForTranslation("🛒 Added **Milk**. Say **undo** to take it back ↩️", []);
    expect(shown.spans).toContain("🛒");
    expect(shown.spans).toContain("↩️");
    expect(shown.text).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
