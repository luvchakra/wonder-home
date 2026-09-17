import { describe, expect, it } from "vitest";

import {
  approvalFingerprint,
  assessObligation,
  auditMetadata,
  budgetView,
  detectAnomaly,
  format,
  mayExecute,
  shouldRetry,
  type Attempt,
  type Obligation,
  type PaymentIntent,
} from "./payments";

const NOW = new Date("2026-09-17T09:00:00.000Z");

const obligation = (over: Partial<Obligation> = {}): Obligation => ({
  id: "electricity",
  name: "Electricity",
  kind: "utility",
  payee: "MSEDCL",
  amountMinor: 284_000,
  currency: "INR",
  dueOn: "2026-09-18",
  responsibleMemberId: "kunal",
  status: "received",
  requiresReview: false,
  ...over,
});

const intent = (over: Partial<PaymentIntent> = {}): PaymentIntent => ({
  id: "intent-1",
  obligationId: "electricity",
  amountMinor: 284_000,
  currency: "INR",
  status: "approved",
  approvedByMemberId: "kunal",
  approvedAt: new Date("2026-09-17T08:58:00.000Z"),
  stepUpVerifiedAt: new Date("2026-09-17T08:58:00.000Z"),
  idempotencyKey: "household:electricity:284000",
  ...over,
});

const current = { amountMinor: 284_000, currency: "INR", obligationId: "electricity" };

describe("whether a bill needs somebody", () => {
  it("speaks up as the date approaches", () => {
    const assessment = assessObligation(obligation(), { now: NOW });

    expect(assessment.status).toBe("at_risk");
    expect(assessment.action).toEqual({ action: "pay_bill", target: "electricity" });
    expect(assessment.reason).toContain("₹2,840");
  });

  it("stays quiet about something not due for weeks", () => {
    expect(assessObligation(obligation({ dueOn: "2026-10-30" }), { now: NOW }).notable).toBe(false);
  });

  it("says nothing once it is paid", () => {
    expect(assessObligation(obligation({ status: "paid" }), { now: NOW }).notable).toBe(false);
  });

  it("says nothing once a payment is already arranged", () => {
    // Suppressed when delegated, which is what the criterion asks for.
    expect(assessObligation(obligation({ status: "scheduled" }), { now: NOW }).notable).toBe(false);
    expect(assessObligation(obligation(), { now: NOW, hasApprovedIntent: true }).notable).toBe(false);
  });

  it("gives rent more notice than a subscription", () => {
    const dueIn5 = { dueOn: "2026-09-22" };

    expect(assessObligation(obligation({ ...dueIn5, kind: "rent" }), { now: NOW }).notable).toBe(true);
    expect(assessObligation(obligation({ ...dueIn5, kind: "subscription" }), { now: NOW }).notable).toBe(false);
  });

  it("raises an overdue bill as missed", () => {
    expect(assessObligation(obligation({ dueOn: "2026-09-10" }), { now: NOW }).status).toBe("missed");
  });

  it("still raises a bill whose amount has not arrived", () => {
    const assessment = assessObligation(obligation({ amountMinor: null, currency: null }), { now: NOW });

    expect(assessment.notable).toBe(true);
    expect(assessment.reason).toContain("amount has not arrived");
  });
});

describe("whether an approved payment may execute", () => {
  it("allows one approved, stepped up and unchanged", () => {
    expect(mayExecute(intent(), current, NOW)).toMatchObject({ mayExecute: true });
  });

  it("refuses one nobody approved", () => {
    expect(mayExecute(intent({ status: "draft", approvedAt: null, approvedByMemberId: null }), current, NOW)).toMatchObject(
      { mayExecute: false, code: "not_approved" },
    );
  });

  it("refuses without a step-up, because a live session is not a live decision", () => {
    expect(mayExecute(intent({ stepUpVerifiedAt: null }), current, NOW)).toMatchObject({
      code: "step_up_missing",
    });
  });

  it("refuses a step-up that has gone stale", () => {
    const old = intent({ stepUpVerifiedAt: new Date("2026-09-17T08:30:00.000Z") });

    expect(mayExecute(old, current, NOW)).toMatchObject({ code: "step_up_stale" });
  });

  it("refuses when the amount changed after approval", () => {
    // ₹2,840 approved is not ₹8,420 approved.
    expect(mayExecute(intent(), { ...current, amountMinor: 842_000 }, NOW)).toMatchObject({
      code: "amount_changed",
    });
  });

  it("refuses to execute something already settled", () => {
    expect(mayExecute(intent({ status: "succeeded" }), current, NOW)).toMatchObject({
      code: "already_settled",
    });
  });

  it("carries the intent's own idempotency key through, so a retry is the same payment", () => {
    const check = mayExecute(intent(), current, NOW);

    expect(check).toMatchObject({ mayExecute: true, idempotencyKey: "household:electricity:284000" });
  });

  it("fingerprints the bill, the amount and the currency together", () => {
    expect(approvalFingerprint(current)).toBe("electricity:284000:INR");
    expect(approvalFingerprint({ ...current, currency: "USD" })).not.toBe(approvalFingerprint(current));
  });
});

describe("retrying a payment", () => {
  const attempt = (over: Partial<Attempt> = {}): Attempt => ({
    attemptNumber: 1,
    status: "failed",
    failureCode: "timeout",
    ...over,
  });

  it("tries again after a transient failure", () => {
    expect(shouldRetry([attempt()])).toMatchObject({ retry: true, attemptNumber: 2 });
  });

  it("does not retry a failure that trying again will not fix", () => {
    expect(shouldRetry([attempt({ failureCode: "insufficient_funds" })])).toMatchObject({ retry: false });
  });

  it("never retries an unknown outcome", () => {
    // Not knowing whether money moved is the one case where retrying can
    // genuinely pay twice.
    const decision = shouldRetry([attempt({ status: "unknown", failureCode: null })]);

    expect(decision.retry).toBe(false);
    expect(decision.because).toContain("unknown");
  });

  it("does not retry while an attempt is still in flight", () => {
    expect(shouldRetry([attempt({ status: "sent", failureCode: null })])).toMatchObject({ retry: false });
  });

  it("stops after enough tries and asks for a person", () => {
    const three = [attempt({ attemptNumber: 1 }), attempt({ attemptNumber: 2 }), attempt({ attemptNumber: 3 })];

    expect(shouldRetry(three)).toMatchObject({ retry: false });
  });

  it("does nothing once it has gone through", () => {
    expect(shouldRetry([attempt({ status: "succeeded", failureCode: null })])).toMatchObject({ retry: false });
  });
});

describe("spotting an unusual bill", () => {
  const history = [
    { periodLabel: "2026-06", amountMinor: 280_000 },
    { periodLabel: "2026-07", amountMinor: 290_000 },
    { periodLabel: "2026-08", amountMinor: 285_000 },
  ];

  it("shows what it is comparing against", () => {
    const anomaly = detectAnomaly({ amountMinor: 890_000, currency: "INR", history });

    expect(anomaly).not.toBeNull();
    expect(anomaly?.baselineMinor).toBe(285_000);
    expect(anomaly?.explanation).toContain("against a usual ₹2,850");
    expect(anomaly?.explanation).toContain("periods");
  });

  it("says nothing about an ordinary bill", () => {
    expect(detectAnomaly({ amountMinor: 292_000, currency: "INR", history })).toBeNull();
  });

  it("needs enough history before calling anything unusual", () => {
    expect(
      detectAnomaly({ amountMinor: 890_000, currency: "INR", history: history.slice(0, 2) }),
    ).toBeNull();
  });

  it("ignores a large ratio on a trivial amount", () => {
    const small = [
      { periodLabel: "a", amountMinor: 1000 },
      { periodLabel: "b", amountMinor: 1100 },
      { periodLabel: "c", amountMinor: 1050 },
    ];

    expect(detectAnomaly({ amountMinor: 3000, currency: "INR", history: small })).toBeNull();
  });
});

describe("budgets", () => {
  it("describes what is left", () => {
    expect(budgetView({ category: "groceries", limitMinor: 2_000_000, currency: "INR", spentMinor: 1_500_000 }))
      .toMatchObject({ remainingMinor: 500_000, overBy: null });
  });

  it("reports going over without ever blocking anything", () => {
    // The rent is due regardless. A budget that refused it would be worse than
    // useless.
    const view = budgetView({ category: "rent", limitMinor: 1_000_000, currency: "INR", spentMinor: 1_200_000 });

    expect(view).toMatchObject({ remainingMinor: 0, overBy: 200_000 });
    expect(view).not.toHaveProperty("blocked");
  });
});

describe("what a payment writes to the audit trail", () => {
  it("records the action and nothing more", () => {
    const metadata = auditMetadata({
      intentId: "intent-1",
      obligationId: "electricity",
      amountMinor: 284_000,
      currency: "INR",
      actorMemberId: "kunal",
      outcome: "executed",
      provider: "razorpay",
    });

    expect(Object.keys(metadata).sort()).toEqual([
      "actorMemberId",
      "amountMinor",
      "currency",
      "intentId",
      "obligationId",
      "outcome",
      "provider",
    ]);
  });

  it("cannot be made to carry a secret a caller passes in", () => {
    const metadata = auditMetadata({
      intentId: "intent-1",
      obligationId: "electricity",
      amountMinor: 284_000,
      currency: "INR",
      actorMemberId: "kunal",
      outcome: "executed",
      // A caller trying to smuggle something through. Typed as unknown because
      // TypeScript already rejects this shape — which is itself part of the
      // defence; the runtime check below is the other half.
      ...({ cardNumber: "4111111111111111", methodRef: "tok_live_abc" } as unknown as Record<string, never>),
    });

    expect(metadata).not.toHaveProperty("cardNumber");
    expect(metadata).not.toHaveProperty("methodRef");
  });
});

describe("formatting money", () => {
  it("reads the way the household does", () => {
    expect(format(284_000, "INR")).toBe("₹2,840");
    expect(format(1050, "USD")).toBe("USD 10.5");
  });
});
