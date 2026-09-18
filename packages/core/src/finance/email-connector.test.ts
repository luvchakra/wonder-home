import { describe, expect, it } from "vitest";

import type { ProviderRecord } from "../integrations/connector";
import {
  createFixtureEmailConnector,
  describeEmailHealth,
  planObligationSync,
  translateEmail,
  type EmailPayload,
  type ExistingObligationImport,
  type ImportedObligation,
} from "./email-connector";

const NOW = new Date("2026-09-19T09:00:00.000Z");

const billRecord = (
  over: Partial<EmailPayload> = {},
  externalId = "msg-1",
  contentHash = "a".repeat(64),
): ProviderRecord<EmailPayload> => ({
  externalId,
  contentHash,
  type: "message",
  observedAt: NOW,
  payload: {
    category: "bill",
    subject: "Your electricity bill is ready",
    receivedAt: "2026-09-19T08:00:00.000Z",
    payee: "State Electricity Board",
    amountMinor: 284000,
    currency: "INR",
    dueOn: "2026-09-25",
    kind: "utility",
    ...over,
  },
});

describe("translating household mail", () => {
  it("turns a recognised bill into an obligation carrying the provider's identity", () => {
    const { obligations } = translateEmail([billRecord()], "example_mail");

    expect(obligations).toHaveLength(1);
    expect(obligations[0]).toMatchObject({
      externalId: "msg-1",
      name: "Your electricity bill is ready",
      payee: "State Electricity Board",
      amountMinor: 284000,
      currency: "INR",
      dueOn: "2026-09-25",
      kind: "utility",
      provider: "example_mail",
    });
  });

  it("never produces a status — an email cannot mark a bill paid", () => {
    const { obligations } = translateEmail([billRecord()], "example_mail");

    expect(obligations[0]).not.toHaveProperty("status");
  });

  it("leaves mail the adapter did not classify as a bill unmatched, not invented into one", () => {
    const { obligations, skipped } = translateEmail(
      [billRecord({ category: "other", subject: "Weekend farmers market" })],
      "example_mail",
    );

    expect(obligations).toEqual([]);
    expect(skipped).toHaveLength(1);
  });

  it("accepts a bill with no amount yet — the normal case for a bill that has only just arrived", () => {
    const { obligations } = translateEmail(
      [billRecord({ amountMinor: null, currency: null })],
      "example_mail",
    );

    expect(obligations).toHaveLength(1);
    expect(obligations[0]).toMatchObject({ amountMinor: null, currency: null });
  });

  it("refuses an amount with no currency or a currency with no amount, rather than recording half a fact", () => {
    const { obligations, skipped } = translateEmail(
      [billRecord({ amountMinor: 1000, currency: null })],
      "example_mail",
    );

    expect(obligations).toEqual([]);
    expect(skipped[0]?.reason).toContain("amount with no currency");
  });

  it("falls back to utility for a kind the adapter did not send or got wrong", () => {
    const { obligations } = translateEmail(
      [billRecord({ kind: "not_a_real_kind" as never })],
      "example_mail",
    );

    expect(obligations[0]?.kind).toBe("utility");
  });

  it("drops a due date that could not be read rather than inventing a deadline", () => {
    const { obligations, skipped } = translateEmail(
      [billRecord({ dueOn: "not a date" })],
      "example_mail",
    );

    expect(obligations).toEqual([]);
    expect(skipped[0]?.reason).toContain("due date");
  });

  it("skips a bill with no readable subject", () => {
    const { obligations } = translateEmail([billRecord({ subject: "   " })], "example_mail");

    expect(obligations).toEqual([]);
  });
});

describe("the fixture email connector", () => {
  it("does not claim to be live", () => {
    expect(createFixtureEmailConnector({ provider: "example_mail" }).live).toBe(false);
  });

  it("is an email connector", () => {
    expect(createFixtureEmailConnector({ provider: "example_mail" }).kind).toBe("email");
  });
});

const imported = (externalId: string, contentHash = "a".repeat(64)): ImportedObligation => ({
  externalId,
  contentHash,
  name: "Electricity bill",
  kind: "utility",
  payee: "State Electricity Board",
  amountMinor: 284000,
  currency: "INR",
  dueOn: "2026-09-25",
  recurrence: "monthly",
  provider: "example_mail",
});

const existing: ExistingObligationImport[] = [
  { id: "row-1", externalId: "msg-1" },
  { id: "row-2", externalId: "msg-2" },
];

describe("planning what a mail sync should change", () => {
  it("skips a message already seen with the same content, without a write", () => {
    const seen = new Set(["msg-1:" + "a".repeat(64)]);
    const plan = planObligationSync(existing, seen, [imported("msg-1")]);

    expect(plan.unchanged).toBe(1);
    expect(plan.insert).toEqual([]);
    expect(plan.update).toEqual([]);
  });

  it("updates the row it already has when a corrected copy of the same email arrives", () => {
    const plan = planObligationSync(existing, new Set(), [imported("msg-1", "b".repeat(64))]);

    expect(plan.update).toEqual([{ id: "row-1", obligation: expect.objectContaining({ externalId: "msg-1" }) }]);
    expect(plan.insert).toEqual([]);
  });

  it("inserts a bill it has never seen", () => {
    const plan = planObligationSync(existing, new Set(), [imported("msg-9")]);

    expect(plan.insert.map((o) => o.externalId)).toEqual(["msg-9"]);
  });

  it("never proposes cancelling anything — an inbox only ever grows", () => {
    const plan = planObligationSync(existing, new Set(), [imported("msg-1")]);

    expect(plan).not.toHaveProperty("cancel");
  });
});

describe("telling a household about a broken mail connection", () => {
  it("says nothing while it is working", () => {
    expect(describeEmailHealth({ status: "connected", lastSuccessAt: NOW }).tone).toBe("silent");
  });

  it("warns that a bill may be missing rather than letting an incomplete list look complete", () => {
    const health = describeEmailHealth({
      status: "degraded",
      lastSuccessAt: new Date("2026-09-18T09:00:00.000Z"),
      now: NOW,
    });

    expect(health.tone).toBe("informational");
    expect(health.message).toContain("24 hours ago");
    expect(health.message).toContain("may be missing");
  });

  it("asks for a person when only a person can fix it", () => {
    expect(describeEmailHealth({ status: "revoked", lastSuccessAt: null }).tone).toBe("needs_action");
    expect(describeEmailHealth({ status: "error", lastSuccessAt: null }).tone).toBe("needs_action");
  });

  it("does not nag a household that never connected a mailbox", () => {
    expect(describeEmailHealth({ status: "not_connected", lastSuccessAt: null }).tone).toBe("silent");
  });
});
