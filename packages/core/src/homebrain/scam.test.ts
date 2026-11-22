import { describe, expect, it } from "vitest";
import { suspectedScam } from "./scam";

describe("suspectedScam", () => {
  it("flags a message that asks for a PIN, OTP or password", () => {
    expect(suspectedScam("Your electricity will be disconnected tonight. Pay Rs 1,240 now: click the link and enter your UPI PIN.")).toBe(true);
    expect(suspectedScam("Share the OTP sent to your phone to receive your refund")).toBe(true);
  });
  it("flags a link with an urgent demand to pay under a threat", () => {
    expect(suspectedScam("Your account will be blocked. Pay now at http://bit.ly/x")).toBe(true);
  });
  it("leaves real bills, receipts and notices alone", () => {
    expect(suspectedScam("BESCOM bill for October: Rs 1,240 due on 5 December 2026. Pay online at bescom.co.in.")).toBe(false);
    expect(suspectedScam("Rs 1,240.00 debited from A/c XX1234 on 18-11-26 to BESCOM via UPI. Ref 6321.")).toBe(false);
    expect(suspectedScam("Never share your OTP or PIN with anyone. Your bill of Rs 900 is due on 3 Dec.")).toBe(false);
    expect(suspectedScam("Dear Parents, PTM is on 28 November 2026 from 9 am.")).toBe(false);
  });
});
