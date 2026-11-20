import { describe, expect, it } from "vitest";

import { matchPaymentToBill, paymentDay, paymentTitle, readPaymentProof, samePayee, type OpenBill } from "./payment-proof";

const UPI = "Rs.1,240.00 debited from A/c XX1234 on 18-11-26 to VPA bescom.billdesk@hdfcbank BESCOM. UPI Ref No 432198765. Not you? Call 18002586161";
const CARD = "INR 649.00 spent on HDFC Bank Card xx4321 at NETFLIX on 2026-11-19. Avl bal INR 12,000";
const BANK = "Your a/c no. XXXXXX7788 is debited for Rs 18,500.00 on 01-Nov-26 and transferred to Ramesh Kumar via IMPS.";

describe("reading a payment proof", () => {
  it("reads a UPI, a card and a bank message: amount, payee, day, how", () => {
    expect(readPaymentProof(UPI)).toEqual({ proof: { amount: 1240, currency: "INR", payee: "BESCOM", paidOn: "2026-11-18", method: "upi" } });
    expect(readPaymentProof(CARD)).toEqual({ proof: { amount: 649, currency: "INR", payee: "NETFLIX", paidOn: "2026-11-19", method: "card" } });
    expect(readPaymentProof(BANK)).toEqual({ proof: { amount: 18500, currency: "INR", payee: "Ramesh Kumar", paidOn: "2026-11-01", method: "bank" } });
  });

  it("takes the payee from a UPI handle when the message names nobody", () => {
    const read = readPaymentProof("Paid Rs 300 to ravi.dairy@okaxis on 20/11/2026. UPI Ref 1122");
    expect(read.proof?.payee).toBe("ravi dairy");
  });

  it("never takes a request for money as proof: pay now, approve, a PIN, a link, a due date", () => {
    for (const text of [
      "URGENT: Your electricity will be disconnected. Pay now Rs 1240 via UPI at http://bit.ly/x",
      "Rs 5000 debited? Click here to approve the UPI collect request from refunds@ybl",
      "Approve this payment of Rs 2,000 to Amazon on your UPI app. Enter UPI PIN to complete.",
      "Your BESCOM bill of Rs 1,240 is due on 25-11-26. Pay using UPI.",
      "Rs 999 will be debited from your a/c XX12 on 01-12-26 for your Netflix mandate.",
    ]) {
      expect(readPaymentProof(text)).toEqual({ proof: null, reason: "asks_to_pay" });
    }
  });

  it("knows money coming in is not a payment the household made", () => {
    expect(readPaymentProof("Rs 2,000 credited to your a/c XX1234 from ANITA via UPI on 19-11-26")).toEqual({ proof: null, reason: "credit" });
  });

  it("leaves ordinary messages alone", () => {
    expect(readPaymentProof("Annual Day on 6 Dec, costumes by Monday")).toEqual({ proof: null, reason: "not_payment" });
    expect(readPaymentProof("Paid the maid today")).toEqual({ proof: null, reason: "not_payment" });
    expect(readPaymentProof(null, "")).toEqual({ proof: null, reason: "not_payment" });
  });

  it("reads days the way Indian banks write them", () => {
    expect(paymentDay("on 05-11-26")).toBe("2026-11-05");
    expect(paymentDay("on 5 Nov 2026")).toBe("2026-11-05");
    expect(paymentDay("on 31-02-26")).toBeNull();
  });

  it("titles a payment by who was paid", () => {
    expect(paymentTitle({ amount: 1, currency: "INR", payee: "BESCOM", paidOn: null, method: "upi" })).toBe("Paid to BESCOM");
    expect(paymentTitle({ amount: 1, currency: "INR", payee: null, paidOn: null, method: "card" })).toBe("Card payment");
  });
});

const bill = (over: Partial<OpenBill>): OpenBill => ({ id: "b1", name: "Electricity", payee: "BESCOM", amountMinor: 124000, currency: "INR", dueOn: "2026-11-25", status: "expected", ...over });
const proof = { amount: 1240, currency: "INR", payee: "BESCOM", paidOn: "2026-11-18", method: "upi" as const };

describe("matching a payment to the bill it paid", () => {
  it("marks the one bill whose payee, amount and day agree", () => {
    expect(matchPaymentToBill(proof, [bill({})], "2026-11-20")).toEqual({ type: "paid", billId: "b1", amountConfirmed: true });
  });

  it("pays a bill whose amount isn't in yet, and confirms it", () => {
    expect(matchPaymentToBill(proof, [bill({ amountMinor: null, currency: null })], "2026-11-20")).toEqual({ type: "paid", billId: "b1", amountConfirmed: false });
  });

  it("never marks a bill paid when the amount disagrees: a conflict, asked at night", () => {
    expect(matchPaymentToBill({ ...proof, amount: 4500 }, [bill({})], "2026-11-20")).toEqual({ type: "amount_conflict", billId: "b1" });
  });

  it("matches nothing outside the date window, for another payee, or already paid", () => {
    expect(matchPaymentToBill(proof, [bill({ dueOn: "2027-01-25" })], "2026-11-20")).toEqual({ type: "none" });
    expect(matchPaymentToBill(proof, [bill({ dueOn: "2026-10-01" })], "2026-11-20")).toEqual({ type: "none" });
    expect(matchPaymentToBill(proof, [bill({ payee: "Airtel", name: "Broadband" })], "2026-11-20")).toEqual({ type: "none" });
    expect(matchPaymentToBill(proof, [bill({ status: "paid" })], "2026-11-20")).toEqual({ type: "none" });
  });

  it("never guesses between two equally close bills", () => {
    expect(matchPaymentToBill(proof, [bill({ id: "b1" }), bill({ id: "b2" })], "2026-11-20")).toEqual({ type: "none" });
    // The nearer one is the one it paid.
    expect(matchPaymentToBill(proof, [bill({ id: "b1", dueOn: "2026-12-05" }), bill({ id: "b2", dueOn: "2026-11-20" })], "2026-11-20")).toEqual({ type: "paid", billId: "b2", amountConfirmed: true });
  });

  it("knows a payee by its words, its handle or the bill's own name", () => {
    expect(samePayee("BESCOM Bangalore", { name: "Electricity", payee: "BESCOM" })).toBe(true);
    expect(samePayee("airtel", { name: "Airtel broadband", payee: null })).toBe(true);
    expect(samePayee("Ramesh Kumar", { name: "Electricity", payee: "BESCOM" })).toBe(false);
    expect(samePayee(null, { name: "Electricity", payee: "BESCOM" })).toBe(false);
  });
});
