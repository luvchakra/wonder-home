/**
 * A suspected scam (owner, 2026-11-22: "Flag as scam"): a message that asks the
 * household for a secret — a UPI PIN, an OTP, a password, a CVV — or that pairs
 * a link with a demand to pay at once under a threat. No real biller, bank or
 * school asks for either. Such an item is never recorded as a bill: HomeSend
 * sets it aside (`suspected_scam`) and warns its sender not to pay or share a
 * PIN, never repeating the amount or the link. Rules only; no model decides it.
 */
const ASKS_FOR_SECRET = /\b(enter|share|send|type|provide|confirm|tell us)\b[^.!?\n]{0,30}\b(upi\s+)?(pin|otp|one[-\s]time\s+password|password|cvv|card\s+number)\b/gi;
/** "Never share your OTP": the usual bank warning, not a request. */
const WARNS_AGAINST = /\b(never|not|don't|dont|do not|no one|nobody)\b[^.!?\n]{0,12}$/i;
const LINK = /(https?:\/\/|www\.|\bbit\.ly\b|\bclick\b|\btap\b[^.!?\n]{0,15}\blink\b|\bthe link\b)/i;
const PAY_AT_ONCE = /\bpay\b[^.!?\n]{0,30}\b(now|immediately|right away|within\s+\d+\s*(minutes?|mins?|hours?|hrs?)|today|tonight)\b/i;
const THREAT = /\b(will be|shall be|is being|to be)\s+(disconnected|blocked|suspended|cut|deactivated|terminated|closed)\b|\b(disconnection|suspension|deactivation)\b/i;

export function suspectedScam(...texts: (string | null | undefined)[]): boolean {
  const text = texts.filter(Boolean).join("\n");
  if (!text) return false;
  for (const match of text.matchAll(ASKS_FOR_SECRET)) {
    if (!WARNS_AGAINST.test(text.slice(Math.max(0, match.index - 25), match.index))) return true;
  }
  return LINK.test(text) && PAY_AT_ONCE.test(text) && THREAT.test(text);
}
