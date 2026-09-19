import type { SupabaseClient } from "@supabase/supabase-js";

import {
  toConnectorError,
  type ConnectionState,
  type ConnectorError,
  type ProviderRecord,
} from "../integrations/connector";
import { recordEvent, recordSyncOutcome, seenKeys, type Connection } from "../integrations/repository";
import {
  planOrderSync,
  translateCommerce,
  type ExistingOrder,
  type OrderSyncPlan,
} from "./commerce-connector";
import type { CommerceConnector, CommercePayload } from "./orders";

/**
 * One commerce sync, end to end (story 17-005).
 *
 * Same order as the calendar, mail and school syncs, for the same reason: the
 * provider is asked first, and if it fails only the connection's health
 * changes — an outage can make an order's status less current but never wrong.
 * If it answers, records are translated, reconciled by provider identity and
 * content hash, written, and only then recorded as received.
 *
 * What differs is what the report has to carry. The other three can say
 * "inserted, updated, unchanged" and be done. A merchant sync can also produce
 * two things a household needs told about rather than counted: an update the
 * lifecycle refused, and an order whose price no longer matches what was
 * agreed. Both are in the report, because a number that quietly absorbed them
 * would be a sync that looked healthier than it was.
 */

export type CommerceSyncPorts = {
  existingOrders(): Promise<ExistingOrder[]>;
  seenKeys(records: readonly ProviderRecord<CommercePayload>[]): Promise<Set<string>>;
  apply(plan: OrderSyncPlan): Promise<void>;
  recordEvents(
    entries: readonly { record: ProviderRecord<CommercePayload>; status: "processed" | "ignored" }[],
  ): Promise<void>;
  recordOutcome(
    outcome: { ok: true; partialFailures: readonly ConnectorError[] } | { ok: false; error: ConnectorError },
  ): Promise<ConnectionState>;
};

export type CommerceSyncReport = {
  ok: boolean;
  state: ConnectionState;
  updated: number;
  unchanged: number;
  /** Records the merchant sent that could not become an update. */
  skipped: number;
  /** Orders this household does not have. Somebody ordered in the merchant's own app. */
  unmatched: number;
  /** Status changes the lifecycle refused, with the reason a person can read. */
  refused: OrderSyncPlan["refused"];
  /** Orders whose total no longer matches what the household agreed to. */
  repriced: OrderSyncPlan["repriced"];
  partialFailures: number;
  error?: ConnectorError;
};

export async function syncCommerce(input: {
  connector: CommerceConnector;
  connection: Connection;
  ports: CommerceSyncPorts;
}): Promise<CommerceSyncReport> {
  const { connector, connection, ports } = input;

  if (connector.kind !== "commerce") {
    throw new Error(`syncCommerce was given a ${connector.kind} connector.`);
  }

  const empty = { updated: 0, unchanged: 0, skipped: 0, unmatched: 0, refused: [], repriced: [] };

  let result;
  try {
    result = await connector.sync({
      householdId: connection.householdId,
      credentialRef: connection.credentialRef,
      scopes: connection.scopes,
    });
  } catch (thrown) {
    // The merchant failed. Health changes; no order's status does.
    const error = toConnectorError(thrown);
    const state = await ports.recordOutcome({ ok: false, error });
    return { ok: false, state, ...empty, partialFailures: 0, error };
  }

  const translation = translateCommerce(result.records);
  const [existing, seen] = await Promise.all([ports.existingOrders(), ports.seenKeys(result.records)]);

  const plan = planOrderSync(existing, seen, translation.updates);

  await ports.apply(plan);

  // "Processed" means an order actually moved. A record that was refused or
  // named an order we do not have is recorded as ignored — it arrived, it was
  // read, and nothing came of it, which is exactly what the event log is for.
  const applied = new Set(plan.apply.map((entry) => entry.update.externalId));
  await ports.recordEvents(
    result.records.map((record) => ({
      record,
      status: applied.has(record.payload.externalOrderId) ? "processed" : "ignored",
    })),
  );

  const state = await ports.recordOutcome({ ok: true, partialFailures: result.partialFailures });

  return {
    ok: true,
    state,
    updated: plan.apply.length,
    unchanged: plan.unchanged,
    skipped: translation.skipped.length,
    unmatched: plan.unmatched.length,
    refused: plan.refused,
    repriced: plan.repriced,
    partialFailures: result.partialFailures.length,
  };
}

/** The real ports, over the household's own RLS-scoped client. */
export function commerceSyncPorts(
  supabase: SupabaseClient,
  connection: Connection,
): CommerceSyncPorts {
  return {
    existingOrders: () => readExistingOrders(supabase, connection),
    seenKeys: (records) => seenKeys(supabase, connection.id, records),
    apply: (plan) => applyOrderPlan(supabase, connection, plan),
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

type Row = Record<string, unknown>;

async function readExistingOrders(
  supabase: SupabaseClient,
  connection: Connection,
): Promise<ExistingOrder[]> {
  const { data, error } = await supabase
    .from("orders")
    .select("id, external_id, status, total_minor, currency")
    .eq("household_id", connection.householdId)
    .eq("integration_id", connection.id)
    .not("external_id", "is", null);

  if (error) throw new Error(`readExistingOrders failed: ${error.code ?? "unknown"}`);

  return ((data as Row[] | null) ?? []).map((row) => ({
    id: row.id as string,
    externalId: row.external_id as string,
    status: row.status as ExistingOrder["status"],
    totalMinor: Number(row.total_minor),
    currency: row.currency as string,
  }));
}

/**
 * Writes what the plan allows, and nothing else.
 *
 * `total_minor` is never written here. A merchant reporting a different amount
 * is in `plan.repriced` for a person to look at; overwriting the approved
 * figure would make the household's record agree with the merchant's, which is
 * the one outcome that makes the disagreement impossible to notice.
 */
async function applyOrderPlan(
  supabase: SupabaseClient,
  connection: Connection,
  plan: OrderSyncPlan,
): Promise<void> {
  for (const { id, update } of plan.apply) {
    const { error } = await supabase
      .from("orders")
      .update({
        status: update.status,
        ...(update.expectedAt ? { expected_at: update.expectedAt.toISOString() } : {}),
        ...(update.status === "delivered" ? { delivered_at: new Date().toISOString() } : {}),
      })
      .eq("id", id)
      .eq("household_id", connection.householdId);

    if (error) throw new Error(`applyOrderPlan failed: ${error.code ?? "unknown"}`);
  }
}
