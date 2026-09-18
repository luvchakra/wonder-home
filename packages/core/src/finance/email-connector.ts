import type { Connector, ProviderRecord } from "../integrations/connector";
import { createFixtureConnector, type FixtureOptions } from "../integrations/registry";
import { OBLIGATION_KINDS, type ObligationKind } from "./payments";

/**
 * The email connector (story 17-003): ingesting household-relevant mail.
 *
 * "Household-relevant mail" is broad, but the only canonical model the schema
 * gives an email an honest home in today is a bill — `obligations.source`
 * already documents "imported from mail" as a first-class origin, with
 * `integration_id`/`external_id` reserved for exactly this. So this connector
 * is deliberately scoped: it recognises bill and fee notices and translates
 * them into obligations; anything else in the inbox is left unmatched rather
 * than invented into a domain that has no place for it yet. A future adapter
 * that also reads receipts or general notices needs its own canonical target
 * before it can translate into one.
 *
 * The one rule that matters most: **an email can never mark a bill paid.**
 * A provider reporting "your payment was received" is not the same fact as
 * this household's own payment succeeding through payment_intents, and this
 * connector's output type does not have a status that could confuse the two.
 * Mirrors the school connector's "a portal cannot report work as done".
 *
 * `CLAUDE.md` governs whether any of this is real: no connector is live until
 * credentials, consent, authentication and integration tests exist. What
 * ships today is the contract and a fixture, and the fixture says so.
 */

/** What every mail adapter must hand back, whatever the mailbox called it. */
export type EmailPayload = {
  /** What the adapter believes this message is. Only "bill" produces anything. */
  category: "bill" | "other";
  subject: string;
  receivedAt: string;
  /** Present only when the adapter recognised this as a bill or fee notice. */
  payee?: string | null;
  amountMinor?: number | null;
  currency?: string | null;
  dueOn?: string | null;
  kind?: ObligationKind | null;
  recurrence?: "monthly" | "quarterly" | "yearly" | "one_off" | null;
};

export type EmailConnector = Connector<EmailPayload>;

export const EMAIL_SCOPES = {
  read: "mail.read",
} as const;

/** An email connector that returns exactly the records it was given. */
export function createFixtureEmailConnector(
  options: Omit<FixtureOptions<EmailPayload>, "kind">,
): EmailConnector {
  return createFixtureConnector<EmailPayload>({ ...options, kind: "email" });
}

/** A bill, ready to become an obligation. Status is never included: see above. */
export type ImportedObligation = {
  externalId: string;
  contentHash: string;
  name: string;
  kind: ObligationKind;
  payee: string | null;
  amountMinor: number | null;
  currency: string | null;
  dueOn: string | null;
  recurrence: "monthly" | "quarterly" | "yearly" | "one_off" | null;
  provider: string;
};

export type EmailTranslation = {
  obligations: ImportedObligation[];
  /** Mail the adapter did not recognise as a bill. Filed, not surfaced. */
  skipped: { record: ProviderRecord<EmailPayload>; reason: string }[];
};

export function translateEmail(
  records: readonly ProviderRecord<EmailPayload>[],
  provider: string,
): EmailTranslation {
  const obligations: ImportedObligation[] = [];
  const skipped: EmailTranslation["skipped"] = [];

  for (const record of records) {
    if (record.payload.category !== "bill") {
      skipped.push({ record, reason: "This email was not recognised as a bill or fee notice." });
      continue;
    }

    const amountMinor = record.payload.amountMinor ?? null;
    const currency = record.payload.currency ?? null;
    // The database requires both or neither — an adapter that gives one
    // without the other has sent something we cannot record honestly.
    if ((amountMinor === null) !== (currency === null)) {
      skipped.push({ record, reason: "The provider sent an amount with no currency, or a currency with no amount." });
      continue;
    }

    const subject = record.payload.subject.trim();
    if (subject.length === 0) {
      skipped.push({ record, reason: "The provider sent a bill with no subject to name it by." });
      continue;
    }

    const dueOn = normaliseDate(record.payload.dueOn);
    if (record.payload.dueOn && !dueOn) {
      skipped.push({ record, reason: "The provider sent a due date that could not be read." });
      continue;
    }

    obligations.push({
      externalId: record.externalId,
      contentHash: record.contentHash,
      name: subject.slice(0, 160),
      kind: record.payload.kind && OBLIGATION_KINDS.includes(record.payload.kind) ? record.payload.kind : "utility",
      payee: record.payload.payee?.trim().slice(0, 160) || null,
      amountMinor,
      currency,
      dueOn,
      recurrence: record.payload.recurrence ?? null,
      provider,
    });
  }

  return { obligations, skipped };
}

function normaliseDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

/** An obligation already imported from this connection, as reconciliation needs it. */
export type ExistingObligationImport = {
  id: string;
  externalId: string;
};

export type ObligationSyncPlan = {
  insert: ImportedObligation[];
  /** Content-only: status is never part of what an update changes. */
  update: { id: string; obligation: ImportedObligation }[];
  unchanged: number;
};

/**
 * What a sync should change, by provider identity and content hash.
 *
 * There is deliberately no "cancel" step here, unlike the calendar connector.
 * A calendar's provider can genuinely withdraw an event; an inbox only ever
 * grows; a bill's absence from today's sync says nothing about yesterday's
 * mail. And an update never touches `status` — a bill a person already
 * marked paid stays paid even if a corrected copy of the same email arrives.
 */
export function planObligationSync(
  existing: readonly ExistingObligationImport[],
  seen: ReadonlySet<string>,
  incoming: readonly ImportedObligation[],
): ObligationSyncPlan {
  const byExternalId = new Map(existing.map((row) => [row.externalId, row]));
  const plan: ObligationSyncPlan = { insert: [], update: [], unchanged: 0 };

  for (const obligation of incoming) {
    if (seen.has(`${obligation.externalId}:${obligation.contentHash}`)) {
      plan.unchanged += 1;
      continue;
    }

    const current = byExternalId.get(obligation.externalId);
    if (current) plan.update.push({ id: current.id, obligation });
    else plan.insert.push(obligation);
  }

  return plan;
}

/** What a household is told when an email connection is unhealthy. */
export function describeEmailHealth(input: {
  status: "connected" | "degraded" | "error" | "revoked" | "not_connected" | "connecting";
  lastSuccessAt: Date | null;
  now?: Date;
}): { tone: "silent" | "informational" | "needs_action"; message: string } {
  const now = input.now ?? new Date();

  switch (input.status) {
    case "connected":
      return { tone: "silent", message: "Mail is connected." };
    case "connecting":
    case "not_connected":
      return { tone: "silent", message: "No mailbox is connected yet." };
    case "degraded": {
      const hours = input.lastSuccessAt
        ? Math.floor((now.getTime() - input.lastSuccessAt.getTime()) / 3_600_000)
        : null;
      return {
        tone: "informational",
        message:
          hours === null
            ? "The mail connection is having trouble, so a bill may be missing from this list."
            : `The mail connection last worked ${hours} hours ago, so a bill may be missing from this list.`,
      };
    }
    case "error":
      return {
        tone: "needs_action",
        message: "The mail connection is not working. Bills sent by email may be missing.",
      };
    case "revoked":
      return {
        tone: "needs_action",
        message: "The mailbox needs connecting again before new bills can arrive.",
      };
  }
}
