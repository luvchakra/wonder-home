import type { SupabaseClient } from "@supabase/supabase-js";

import type { ConnectionState, ConnectorError, ProviderRecord } from "../integrations/connector";
import {
  listImportedEvents as readImportedEvents,
  applyCalendarPlan,
} from "./repository";
import {
  recordEvent,
  recordSyncOutcome,
  seenKeys,
  type Connection,
  type IdentityMapping,
} from "../integrations/repository";
import {
  planReconciliation,
  translateCalendar,
  type CalendarConnector,
  type CalendarPayload,
  type ExistingImport,
  type ReconciliationPlan,
} from "./calendar-connector";

/**
 * One calendar sync, end to end (story 17-002).
 *
 * The order is the guarantee. The provider is asked first; if it fails, the
 * connection's health is updated and nothing else is touched, so an outage
 * can make the calendar less current but never wrong. If it answers, the
 * records are translated, reconciled against what is already there, written,
 * and only then recorded as received — so a write that fails halfway is
 * retried by the next sync rather than remembered as done.
 *
 * The database is behind a small set of ports so the whole sequence is
 * testable without one: every outcome the contract defines is exercised in
 * calendar-sync.test.ts against a fixture connector and in-memory ports.
 */

export type CalendarSyncPorts = {
  existingImports(): Promise<ExistingImport[]>;
  seenKeys(records: readonly ProviderRecord<CalendarPayload>[]): Promise<Set<string>>;
  apply(plan: ReconciliationPlan): Promise<void>;
  recordEvents(
    entries: readonly { record: ProviderRecord<CalendarPayload>; status: "processed" | "ignored" }[],
  ): Promise<void>;
  recordOutcome(
    outcome: { ok: true; partialFailures: readonly ConnectorError[] } | { ok: false; error: ConnectorError },
  ): Promise<ConnectionState>;
};

export type CalendarSyncReport = {
  ok: boolean;
  /** Where the connection stands now, in the same terms the integrations screen uses. */
  state: ConnectionState;
  inserted: number;
  updated: number;
  cancelled: number;
  unchanged: number;
  /** Records from calendars nobody has mapped. Waiting for a person, not lost. */
  unmatched: number;
  /** Records that could not become events. */
  skipped: number;
  partialFailures: number;
  /** Present only when the provider could not be synced at all. Safe to show. */
  error?: ConnectorError;
};

export async function syncCalendar(input: {
  connector: CalendarConnector;
  connection: Connection;
  mappings: readonly IdentityMapping[];
  ports: CalendarSyncPorts;
}): Promise<CalendarSyncReport> {
  const { connector, connection, mappings, ports } = input;

  if (connector.kind !== "calendar") {
    throw new Error(`syncCalendar was given a ${connector.kind} connector.`);
  }

  const empty = { inserted: 0, updated: 0, cancelled: 0, unchanged: 0, unmatched: 0, skipped: 0 };

  let result;
  try {
    result = await connector.sync({
      householdId: connection.householdId,
      credentialRef: connection.credentialRef,
      scopes: connection.scopes,
    });
  } catch (thrown) {
    // The provider failed. Health changes; canonical state does not.
    const error = toConnectorError(thrown);
    const state = await ports.recordOutcome({ ok: false, error });
    return { ok: false, state, ...empty, partialFailures: 0, error };
  }

  const translation = translateCalendar(result.records, mappings, connector.provider);
  const [existing, seen] = await Promise.all([ports.existingImports(), ports.seenKeys(result.records)]);

  const plan = planReconciliation(existing, seen, translation.events, {
    complete: result.partialFailures.length === 0,
  });

  await ports.apply(plan);

  const processed = new Set(translation.events.map((event) => event.externalId));
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
    cancelled: plan.cancel.length,
    unchanged: plan.unchanged,
    unmatched: translation.unmatched.length,
    skipped: translation.skipped.length,
    partialFailures: result.partialFailures.length,
  };
}

const KNOWN_CODES = new Set<ConnectorError["code"]>([
  "unauthorized",
  "revoked",
  "rate_limited",
  "unavailable",
  "timeout",
  "malformed",
  "not_configured",
]);

/**
 * Anything a connector throws becomes a contract error.
 *
 * An adapter that throws its SDK's exception has not told us anything safe to
 * show a household, so it is treated as the provider being unavailable — and
 * its message is not passed on, because provider prose can carry a token.
 */
export function toConnectorError(thrown: unknown): ConnectorError {
  if (
    typeof thrown === "object" &&
    thrown !== null &&
    "code" in thrown &&
    KNOWN_CODES.has((thrown as { code: ConnectorError["code"] }).code) &&
    typeof (thrown as { retryable?: unknown }).retryable === "boolean" &&
    typeof (thrown as { message?: unknown }).message === "string"
  ) {
    return thrown as ConnectorError;
  }

  return { code: "unavailable", retryable: true, message: "The calendar provider did not answer." };
}

/** The real ports, over the household's own RLS-scoped client. */
export function calendarSyncPorts(supabase: SupabaseClient, connection: Connection): CalendarSyncPorts {
  return {
    existingImports: () => readImportedEvents(supabase, connection.id),
    seenKeys: (records) => seenKeys(supabase, connection.id, records),
    apply: (plan) => applyCalendarPlan(supabase, { householdId: connection.householdId, integrationId: connection.id, plan }),
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
