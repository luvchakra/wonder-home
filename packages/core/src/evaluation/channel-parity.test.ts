import { describe, expect, it } from "vitest";
import { observeConversation } from "./runners";
import type { HomeTalkCase, Observation } from "./types";
import { MAX_WHATSAPP_REPLY, whatsappReplyText } from "../whatsapp/hometalk";
import { plainText } from "../conversation/reply-format";

/**
 * The same message, the same decision and the same answer, whether it is typed on WhatsApp or in HomeTalk in the
 * app (the owner, 2026-11-22: "experience on HomeBrain or HomeTalk should be similar"). Both doors ask HomeBrain's
 * one decision (`homebrain/intake/channel-decide.ts`); only the formatting differs (`whatsappReplyText`). Run here
 * with no model: the rules are the fallback both doors share.
 */
const MESSAGES = [
  "hello",
  "hi there!",
  "thanks",
  "👍",
  "good morning",
  "whats the plan",
  "whats are the upcoming stuff",
  "what's coming up",
  "anything due this week",
  "what's on tomorrow",
  "kal ka plan kya hai",
  "milk?",
  "add 2 litres milk to the list",
  "remind me tomorrow at 1 to call the bank",
  "add a reminder for tomorrow doctor appointment at 1 o'clock",
  "we prefer dinner at 8",
  "Sunita is off tomorrow",
  "what's for dinner?",
  "help",
  "Dear parents,\nSports Day is on Saturday 26 Sep at 9am.\nPlease send a water bottle and a cap.",
  "Electricity bill from City Power: Rs 2,840 due 25 Sep. Pay at https://citypower.example/pay",
];

const caseFor = (utterance: string, channel: "whatsapp" | "app", index: number): HomeTalkCase => ({
  id: `PAR-${channel}-${index}`, surface: "hometalk", household: "A", category: "cross_domain", actor: "a-kunal",
  description: "parity", utterance, door: { channel }, expected: {},
});

/** What a person gets: the decision (kept through HomeSend, or the HomeTalk reading) and the answer's words. */
function outcome(observed: Observation): { decision: string; action: string | null; answer: string } {
  const filed = observed.interpretation === "homesend" || observed.interpretation === "file_with_homesend";
  return { decision: filed ? "kept in HomeSend" : (observed.interpretation ?? "none"), action: filed ? null : observed.action, answer: filed ? "" : whatsappReplyText({ displayText: observed.answer }) };
}

describe("one decision, one answer, on WhatsApp and in the app", () => {
  it.each(MESSAGES.map((message, index) => [message, index] as const))("%s", async (message, index) => {
    const [onWhatsApp] = await observeConversation(caseFor(message, "whatsapp", index));
    const [inTheApp] = await observeConversation(caseFor(message, "app", index));
    expect(outcome(onWhatsApp!)).toEqual(outcome(inTheApp!));
  });

  it("is about real answers, not two empty ones", async () => {
    const [hello] = await observeConversation(caseFor("hello", "app", 0));
    expect(hello!.answer).toMatch(/Send me anything/);
  });
});

/** The owner's "so what's cooking", 22 Nov 9:54 PM IST, as HomeTalk composed it in the app. */
const WHATS_COOKING =
  "🍽️ Nothing is planned: no meals are on the plan from today onwards.\n" +
  "- **Meal plan** — empty from today; the weekly template lists Idli for Saturday breakfast and Kanda poha for Monday breakfast → [Meals](/meals)\n" +
  "- **Idli batter** — on the grocery list, but no purchase is recorded, so I can't say if there is any at home → [Groceries](/groceries)\n" +
  "- **Eggs, Brown** and **Bread, White** — on the list too, with no purchase recorded → [Groceries](/groceries)\n" +
  "I can't see who is cooking or what is for dinner tonight.";

/** The words a person reads, without either door's markup or the link footer. */
const words = (text: string) =>
  text
    .split("\n")
    .filter((line) => !/^[A-Za-z &]+: https:\/\//.test(line))
    .join(" ")
    .replace(/[*•]/g, "")
    .replace(/\s+/g, " ")
    .trim();

describe("the same reply, laid out for WhatsApp (the owner, 2026-11-22: \"make it same as HomeTalk message formatting\")", () => {
  it("says the app's words, item for item, closing line included", () => {
    expect(words(whatsappReplyText({ displayText: WHATS_COOKING }))).toBe(words(plainText(WHATS_COOKING)));
  });

  it("puts a blank line between items, keeps the short labels and writes each screen once at the end", () => {
    expect(whatsappReplyText({ displayText: WHATS_COOKING })).toBe(
      "🍽️ Nothing is planned: no meals are on the plan from today onwards.\n\n" +
        "• *Meal plan* — empty from today; the weekly template lists Idli for Saturday breakfast and Kanda poha for Monday breakfast → Meals\n\n" +
        "• *Idli batter* — on the grocery list, but no purchase is recorded, so I can't say if there is any at home → Groceries\n\n" +
        "• *Eggs, Brown* and *Bread, White* — on the list too, with no purchase recorded → Groceries\n\n" +
        "I can't see who is cooking or what is for dinner tonight.\n\n" +
        "Meals: https://home.wonderapps.biz/meals\nGroceries: https://home.wonderapps.biz/groceries",
    );
  });

  it("folds a wrapped line back into its item, as the app does", () => {
    const wrapped = "🍽️ Nothing is planned.\n- **Meal plan** — empty from today.\nThe weekly template lists Idli → [Meals](/meals)\n- **Groceries** — Idli batter is on the list → [Groceries](/groceries)";
    const text = whatsappReplyText({ displayText: wrapped });
    expect(text).toContain("• *Meal plan* — empty from today. The weekly template lists Idli → Meals\n\n• *Groceries*");
    expect(words(text)).toBe(words(plainText(wrapped)));
  });

  it("keeps a short list compact, one item a line", () => {
    expect(whatsappReplyText({ displayText: "🛒 On the list:\n- **Milk**\n- **Eggs**" })).toBe("🛒 On the list:\n\n• *Milk*\n• *Eggs*");
  });

  it("writes a link out of the app in full where it stands", () => {
    expect(whatsappReplyText({ displayText: "📍 **Riverside Park** · [Map](https://www.google.com/maps/place/x)" })).toBe("📍 *Riverside Park* · Map (https://www.google.com/maps/place/x)");
  });

  it("drops whole items when too long, and keeps the opening and closing lines", () => {
    const items = Array.from({ length: 30 }, (_, index) => `- **Item ${index + 1}** — something on the list with a little more said about it → [Groceries](/groceries)`);
    const text = whatsappReplyText({ displayText: ["🛒 Thirty things on the list.", ...items, "Nothing else is due today."].join("\n") });
    expect(text.length).toBeLessThanOrEqual(MAX_WHATSAPP_REPLY);
    expect(text.startsWith("🛒 Thirty things on the list.\n\n• *Item 1*")).toBe(true);
    expect(text).toMatch(/→ Groceries\n\nNothing else is due today\.\nThe rest is in the WonderHome app\.\n\nGroceries: https:\/\/home\.wonderapps\.biz\/groceries$/);
    expect(text).not.toContain("Item 30");
  });
});
