import { describe, expect, it } from "vitest";
import { observeConversation } from "./runners";
import type { HomeTalkCase, Observation } from "./types";
import { whatsappReplyText } from "../whatsapp/hometalk";

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
