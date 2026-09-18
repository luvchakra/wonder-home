import type { SupabaseClient } from "@supabase/supabase-js";

import { toConnectorError, type ConnectionState, type ConnectorError, type ProviderRecord } from "../integrations/connector";
import { recordEvent, recordSyncOutcome, seenKeys, type Connection, type IdentityMapping } from "../integrations/repository";
import { translate, type ChildMapping, type SchoolConnector, type SchoolPayload, type TranslatedSchoolItem } from "./connector";
import { applySchoolItemsSyncPlan, listImportedSchoolItems as readImportedSchoolItems } from "./repository";

/**
 * One school sync, end to end (story 17-004).
 *
 * The same order as the calendar and email syncs: the provider is asked
 * first, and a failure changes only the connection's health, never canonical
 * state. If it answers, records are translated, reconciled by provider
 * identity and content hash, written, and only then recorded as received.
 */

export type SchoolSyncPorts = {
  existingImports(): Promise<ExistingSchoolItemImport[]>;
  seenKeys(records: readonly ProviderRecord<SchoolPayload>[]): Promise<Set<string>>;
  apply(plan: SchoolItemsSyncPlan): Promise<void>;
  recordEvents(
    entries: readonly { record: ProviderRecord<SchoolPayload>; status: "processed" | "ignored" }[],
  ): Promise<void>;
  recordOutcome(
    outcome: { ok: true; partialFailures: readonly ConnectorError[] } | { ok: false; error: ConnectorError },
  ): Promise<ConnectionState>;
};

export type SchoolSyncReport = {
  ok: boolean;
  state: ConnectionState;
  inserted: number;
  updated: number;
  cancelled: number;
  unchanged: number;
  /** Records naming a child this household has not mapped. Waiting, not lost. */
  unmatched: number;
  partialFailures: number;
  error?: ConnectorError;
};

export async function syncSchool(input: {
  connector: SchoolConnector;
  connection: Connection;
  mappings: readonly IdentityMapping[];
  ports: SchoolSyncPorts;
}): Promise<SchoolSyncReport> {
  const { connector, connection, mappings, ports } = input;

  if (connector.kind !== "school") {
    throw new Error(`syncSchool was given a ${connector.kind} connector.`);
  }

  const empty = { inserted: 0, updated: 0, cancelled: 0, unchanged: 0, unmatched: 0 };

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

  // The shared identity table maps a provider id to a member for any
  // connector; school's own translate() speaks of children by its own field
  // names, so the mapping is adapted at this one boundary rather than in two
  // places knowing the same fact under two names.
  const childMappings: ChildMapping[] = mappings.map((mapping) => ({
    externalChildId: mapping.externalId,
    childMemberId: mapping.memberId,
  }));

  const translation = translate(result.records, childMappings, connector.provider);
  const [existing, seen] = await Promise.all([ports.existingImports(), ports.seenKeys(result.records)]);

  const plan = planSchoolItemsSync(existing, seen, translation.items);
  await ports.apply(plan);

  const processed = new Set(translation.items.map((item) => item.externalId));
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
    cancelled: plan.update.filter((entry) => entry.cancel).length,
    unchanged: plan.unchanged,
    unmatched: translation.unmatched.length,
    partialFailures: result.partialFailures.length,
  };
}

/** A school item already imported from this connection, as reconciliation needs it. */
export type ExistingSchoolItemImport = {
  id: string;
  externalId: string;
  status: "pending" | "in_progress" | "submitted" | "done" | "missed" | "cancelled";
};

export type SchoolItemsSyncPlan = {
  insert: TranslatedSchoolItem[];
  update: { id: string; item: TranslatedSchoolItem; cancel: boolean }[];
  unchanged: number;
};

/**
 * What a school sync should change, by provider identity and content hash.
 *
 * A provider's own cancellation signal is honoured — an assignment the
 * school withdrew should not go on haunting a family's plan — but never onto
 * an item the child has already submitted or marked done. The rule is
 * symmetric with the connector's own promise that a portal can never report
 * work *done*: it also can never un-report it by cancelling out from under a
 * child's own completion.
 */
export function planSchoolItemsSync(
  existing: readonly ExistingSchoolItemImport[],
  seen: ReadonlySet<string>,
  incoming: readonly TranslatedSchoolItem[],
): SchoolItemsSyncPlan {
  const byExternalId = new Map(existing.map((row) => [row.externalId, row]));
  const plan: SchoolItemsSyncPlan = { insert: [], update: [], unchanged: 0 };

  for (const item of incoming) {
    if (seen.has(`${item.externalId}:${item.contentHash}`)) {
      plan.unchanged += 1;
      continue;
    }

    const current = byExternalId.get(item.externalId);
    if (!current) {
      plan.insert.push(item);
      continue;
    }

    const settled = current.status === "done" || current.status === "submitted";
    plan.update.push({ id: current.id, item, cancel: item.providerCancelled && !settled });
  }

  return plan;
}
