import type { SupabaseClient } from "@supabase/supabase-js";

import { toConnectorError, type ConnectionState, type ConnectorError, type ProviderRecord } from "../integrations/connector";
import { recordEvent, recordSyncOutcome, seenKeys, type Connection } from "../integrations/repository";
import {
  applyObligationSyncPlan,
  listImportedObligations as readImportedObligations,
} from "./repository";
import {
  planObligationSync,
  translateEmail,
  type EmailConnector,
  type EmailPayload,
  type ExistingObligationImport,
  type ObligationSyncPlan,
} from "./email-connector";

/**
 * One mail sync, end to end (story 17-003).
 *
 * The same order as the calendar sync, for the same reason: the provider is
 * asked first, and if it fails, only the connection's health changes — an
 * outage can make the bill list less current but never wrong. If it answers,
 * records are translated, reconciled by provider identity and content hash,
 * written, and only then recorded as received.
 */

export type EmailSyncPorts = {
  existingImports(): Promise<ExistingObligationImport[]>;
  seenKeys(records: readonly ProviderRecord<EmailPayload>[]): Promise<Set<string>>;
  apply(plan: ObligationSyncPlan): Promise<void>;
  recordEvents(
    entries: readonly { record: ProviderRecord<EmailPayload>; status: "processed" | "ignored" }[],
  ): Promise<void>;
  recordOutcome(
    outcome: { ok: true; partialFailures: readonly ConnectorError[] } | { ok: false; error: ConnectorError },
  ): Promise<ConnectionState>;
};

export type EmailSyncReport = {
  ok: boolean;
  state: ConnectionState;
  inserted: number;
  updated: number;
  unchanged: number;
  /** Mail that was not a recognised bill. Filed, not lost. */
  skipped: number;
  partialFailures: number;
  error?: ConnectorError;
};

export async function syncEmail(input: {
  connector: EmailConnector;
  connection: Connection;
  ports: EmailSyncPorts;
}): Promise<EmailSyncReport> {
  const { connector, connection, ports } = input;

  if (connector.kind !== "email") {
    throw new Error(`syncEmail was given a ${connector.kind} connector.`);
  }

  const empty = { inserted: 0, updated: 0, unchanged: 0, skipped: 0 };

  let result;
  try {
    result = await connector.sync({
      householdId: connection.householdId,
      credentialRef: connection.credentialRef,
      scopes: connection.scopes,
    });
  } catch (thrown) {
    const error = toConnectorError(thrown);
    const state = await ports.recordOutcome({ ok: false, error });
    return { ok: false, state, ...empty, partialFailures: 0, error };
  }

  const translation = translateEmail(result.records, connector.provider);
  const [existing, seen] = await Promise.all([ports.existingImports(), ports.seenKeys(result.records)]);

  const plan = planObligationSync(existing, seen, translation.obligations);
  await ports.apply(plan);

  const processed = new Set(translation.obligations.map((obligation) => obligation.externalId));
  await ports.recordEvents(
    result.records.map((record) => ({
      record,
      status: processed.has(record.externalId) ? "processed" : "ignored",
    })),
  );

  const state = await ports.recordOutcome({ ok: true, partialFailures: result.partialFailures });

  return {
    ok: true,
    state,
    inserted: plan.insert.length,
    updated: plan.update.length,
    unchanged: plan.unchanged,
    skipped: translation.skipped.length,
    partialFailures: result.partialFailures.length,
  };
}

/** The real ports, over the household's own RLS-scoped client. */
export function emailSyncPorts(supabase: SupabaseClient, connection: Connection): EmailSyncPorts {
  return {
    existingImports: () => readImportedObligations(supabase, connection.id),
    seenKeys: (records) => seenKeys(supabase, connection.id, records),
    apply: (plan) =>
      applyObligationSyncPlan(supabase, { householdId: connection.householdId, integrationId: connection.id, plan }),
    async recordEvents(entries) {
      for (const entry of entries) {
        await recordEvent(supabase, {
          householdId: connection.householdId,
          integrationId: connection.id,
          record: entry.record,
          status: entry.status,
        });
      }
    },
    recordOutcome: (outcome) => recordSyncOutcome(supabase, connection.id, connection.state, outcome),
  };
}
