import { describe, expect, it } from "vitest";

import { protectForTranslation } from "./reply-language";
import { speakable } from "./speech";
import { unfold, UNDO_LINE, warmReply, warmUndo } from "./warmth";

describe("HomeTalk's replies, warm and laid out", () => {
  it("leads a confirmation with what was done, and the Undo line closes it", () => {
    const text = `Added **Milk** to the [shopping list](/groceries?view=to-buy). ${UNDO_LINE}`;
    expect(warmReply(text, { action: "add_to_list", proposal: "executed", ok: true })).toBe(`🛒 Added **Milk** to the [shopping list](/groceries?view=to-buy).\n${UNDO_LINE}`);
    expect(warmReply("Reminder set for **call the plumber**.", { action: "set_reminder", proposal: "executed", ok: true })).toBe("⏰ Reminder set for **call the plumber**.");
    expect(warmReply("Recorded.", { action: "raise_service_request", proposal: "executed", ok: true })).toBe("🔧 Recorded.");
    expect(warmReply("Recorded.", { action: "complete_school_item", proposal: "executed", ok: true })).toBe("🎒 Recorded.");
    expect(warmReply("Recorded.", { action: "check_agents", proposal: "executed", ok: true })).toBe("✅ Recorded.");
  });

  it("closes an ordinary answer warmly and leads a greeting or a place", () => {
    expect(warmReply("Nothing is waiting on you today.", { action: "ask_status", proposal: "answer", ok: true })).toBe("Nothing is waiting on you today. 😊");
    expect(warmReply("Hello Asha.", { action: "greet", proposal: "answer", ok: true })).toBe("👋 Hello Asha.");
    expect(warmReply("Here is what I would do — add milk. Shall I go ahead?", { action: "add_to_list", proposal: "needs_approval", ok: true })).toBe("📝 Here is what I would do — add milk. Shall I go ahead?");
  });

  it("leads a question with what it is about, and puts each hint on its own line", () => {
    expect(warmReply("Which day is it?", { action: "plan_event", proposal: "clarify", ok: true })).toBe("📅 Which day is it?");
    expect(warmReply("Who did you mean?", { action: "unknown", proposal: "clarify", ok: true })).toBe("🤔 Who did you mean?");
    // The owner's screenshot, 2026-10-26: one block of text, now a list with its hints below.
    const asked = 'How much of each should I add?\n- **Milk** — 2.5 L already on the list\n- **Eggs, Brown** — 32 pcs already on the list\nFor example "2 of each" or "1 litre milk and 6 eggs, brown".\nOr say "that\'s enough" to leave them.';
    expect(warmReply(asked, { action: "add_to_list", proposal: "clarify", ok: true })).toBe(
      '🛒 How much of each should I add?\n- **Milk** — 2.5 L already on the list\n- **Eggs, Brown** — 32 pcs already on the list\n💡 For example "2 of each" or "1 litre milk and 6 eggs, brown".\nOr say "that\'s enough" to leave them.',
    );
    expect(warmReply('Which day do you mean? For example "tomorrow". Or say "skip".', { action: "plan_event", proposal: "clarify", ok: true })).toBe(
      '📅 Which day do you mean?\n💡 For example "tomorrow".\nOr say "skip".',
    );
  });

  it("leads a longer answer rather than closing it", () => {
    expect(warmReply("Two things today.\n- **Milk** is low\n- **Bread** is low", { action: "ask_status", proposal: "answer", ok: true })).toBe("📋 Two things today.\n- **Milk** is low\n- **Bread** is low");
  });

  it("stays plain on refusals, failures and the Why? evidence", () => {
    expect(warmReply("I could not reach my model just now. Try again in a moment.", { action: "unknown", proposal: "clarify", ok: false })).toBe("I could not reach my model just now. Try again in a moment.");
    expect(warmReply("You need an Admin for that.", { action: "make_payment", proposal: "refused", ok: true })).toBe("You need an Admin for that.");
    expect(warmReply("I tried, and it did not go through.", { action: "add_to_list", proposal: "executed", ok: false })).toBe("I tried, and it did not go through.");
    expect(warmReply("Because the bill is due Friday.", { action: "unknown", proposal: "answer", ok: true, explained: true })).toBe("Because the bill is due Friday.");
  });

  it("leads money, health or a child with a neutral mark for the topic, never a smile", () => {
    expect(warmReply('How much is the bill? For example "2400".', { action: "add_bill", proposal: "clarify", ok: true })).toBe('🧾 How much is the bill?\n💡 For example "2400".');
    expect(warmReply("Anya's test is on Friday.", { action: "ask_status", proposal: "answer", ok: true, classes: ["child"] })).toBe("📋 Anya's test is on Friday.");
    expect(warmReply("Here is what I would do — pay the bill. Shall I go ahead?", { action: "make_payment", proposal: "needs_approval", ok: true })).toBe("📝 Here is what I would do — pay the bill. Shall I go ahead?");
    expect(warmReply("Logged the headache.", { action: "log_health_issue", proposal: "executed", ok: true })).toBe("🩺 Logged the headache.");
  });

  // The owner's screenshots, 2026-10-26: neither reply carried an emoji.
  it("leads a place answer with 📍 though its ratings carry ★, and puts the closing tip on its own line", () => {
    const places = "Here are 2 places for somewhere to hang out near home, open now:\n\n- **Red Wolf Game Cafe** — Video arcade · 150 m · ★4.8\n- **The Walk** — Shopping mall · 4.4 km · ★4.5\n\nSave the ones you like and I'll suggest them first next time.";
    expect(warmReply(places, { action: "find_places", proposal: "answer", ok: true, classes: ["location"] })).toBe(
      "📍 Here are 2 places for somewhere to hang out near home, open now:\n\n- **Red Wolf Game Cafe** — Video arcade · 150 m · ★4.8\n- **The Walk** — Shopping mall · 4.4 km · ★4.5\n\n💡 Save the ones you like and I'll suggest them first next time.",
    );
  });

  it("leads a status answer with its topic though the family on record includes a child", () => {
    const free = "Long weekends from public holidays, with nothing on the family calendar:\n- **Sat 21 Nov to Tue 24 Nov** — Guru Nanak's Birthday (Tue 24 Nov), if Mon 23 Nov is taken off";
    expect(warmReply(free, { action: "ask_status", proposal: "answer", ok: true, classes: ["general", "child", "financial"] })).toBe(`📅 ${free}`);
    expect(warmReply("Here is what is on record:\n- **Milk** is low → [Groceries](/groceries)", { action: "ask_status", proposal: "answer", ok: true })).toBe("🛒 Here is what is on record:\n- **Milk** is low → [Groceries](/groceries)");
  });

  it("adds one, never a second", () => {
    expect(warmReply("Got it 👍", { action: "ask_status", proposal: "answer", ok: true })).toBe("Got it 👍");
    expect(warmUndo("Took **Milk** off the list.")).toBe("↩️ Took **Milk** off the list.");
  });

  it("unfolds three or more things joined by semicolons into a line each", () => {
    expect(unfold("- Party is on Sun 22 Nov. Guests: Riya said yes; Dev said yes; Meera said maybe — 5 coming so far → [Calendar](/calendar)")).toEqual([
      "- Party is on Sun 22 Nov. Guests:",
      "◦ Riya said yes",
      "◦ Dev said yes",
      "◦ Meera said maybe — 5 coming so far → [Calendar](/calendar)",
    ]);
    expect(unfold("Milk is low; buy it; soon")).toEqual(["Milk is low; buy it; soon"]);
    expect(unfold("Milk is low; buy it")).toEqual(["Milk is low; buy it"]);
  });

  it("is never spoken", () => {
    expect(speakable("- Party at 5pm. Guests:\n◦ Riya said yes\n◦ Dev said yes")).toBe("Party at 5pm. Guests. Riya said yes. Dev said yes.");
    const text = warmReply(`Added **Milk** to the [shopping list](/groceries). ${UNDO_LINE}`, { action: "add_to_list", proposal: "executed", ok: true });
    expect(speakable(text)).toBe("Added Milk to the shopping list. Say undo to take it back.");
    const asked = warmReply('How much of each should I add?\n- **Milk**\n- **Eggs**\nFor example "2 of each".', { action: "add_to_list", proposal: "clarify", ok: true });
    expect(speakable(asked)).toBe("How much of each should I add? Milk. Eggs. For example 2 of each.");
    expect(speakable(warmReply("Nothing is waiting on you today.", { action: "ask_status", proposal: "answer", ok: true }))).toBe("Nothing is waiting on you today.");
  });

  it("is handed to a translator as a token, so it comes back exactly", () => {
    const shown = protectForTranslation("🛒 Added **Milk**. Say **undo** to take it back ↩️", []);
    expect(shown.spans).toContain("🛒");
    expect(shown.spans).toContain("↩️");
    expect(shown.text).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
