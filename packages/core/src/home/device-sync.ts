import {
  toConnectorError,
  type ConnectionState,
  type ConnectorError,
  type ProviderRecord,
} from "../integrations/connector";
import type { Connection } from "../integrations/repository";
import {
  planDeviceSync,
  translateDeviceReadings,
  type DeviceConnector,
  type DeviceLink,
  type DeviceSyncPlan,
  type TranslatedReading,
} from "./device-connector";

/**
 * One device sync, end to end (story 17-008).
 *
 * The same order as every other connector sync: the provider is asked first,
 * and if it fails only the connection's health changes — an outage can make
 * WonderHome less current about a machine, never wrong about it. If it
 * answers, readings are translated, reconciled against the household's own
 * links and what was already recorded, written, and only then logged.
 *
 * Only a reading that was written is logged, because the log exists to make
 * a re-sync idempotent. A reading from a device nobody has linked yet, or one
 * the household ignores, is deliberately not logged: once an Admin says which
 * appliance it is, or stops ignoring it, the next sync still records whatever
 * of it is fresh.
 */

export type DeviceSyncPorts = {
  existingLinks(): Promise<DeviceLink[]>;
  seenKeys(records: readonly ProviderRecord<unknown>[]): Promise<Set<string>>;
  apply(plan: DeviceSyncPlan): Promise<void>;
  recordEvents(entries: readonly { record: ProviderRecord<unknown>; status: "processed" }[]): Promise<void>;
  recordOutcome(
    outcome: { ok: true; partialFailures: readonly ConnectorError[] } | { ok: false; error: ConnectorError },
  ): Promise<ConnectionState>;
};

export type DeviceSyncReport = {
  ok: boolean;
  state: ConnectionState;
  /** Readings written as evidence. */
  recorded: number;
  unchanged: number;
  /** Devices reported for the first time, waiting for an Admin to say which appliance each is. */
  newDevices: number;
  /** Readings from devices nobody has linked yet. */
  waiting: number;
  /** Readings from devices the household ignores. */
  ignored: number;
  /** Records that could not become a reading at all. */
  skipped: number;
  partialFailures: number;
  error?: ConnectorError;
};

/** A translated reading as the event log keys it. */
function asRecord(reading: TranslatedReading): ProviderRecord<unknown> {
  return {
    externalId: reading.externalId,
    contentHash: reading.contentHash,
    type: `device.${reading.kind}`,
    observedAt: reading.observedAt,
    payload: null,
  };
}

export async function syncDevices(input: {
  connector: DeviceConnector;
  connection: Connection;
  ports: DeviceSyncPorts;
  now?: Date;
}): Promise<DeviceSyncReport> {
  const { connector, connection, ports } = input;
  const now = input.now ?? new Date();

  if (connector.kind !== "smart_home") {
    throw new Error(`syncDevices was given a ${connector.kind} connector.`);
  }

  const empty = { recorded: 0, unchanged: 0, newDevices: 0, waiting: 0, ignored: 0, skipped: 0 };

  let result;
  try {
    result = await connector.sync({
      householdId: connection.householdId,
      credentialRef: connection.credentialRef,
      scopes: connection.scopes,
    });
  } catch (thrown) {
    // The provider failed. Health changes; no reading and no link does.
    const error = toConnectorError(thrown);
    const state = await ports.recordOutcome({ ok: false, error });
    return { ok: false, state, ...empty, partialFailures: 0, error };
  }

  const translation = translateDeviceReadings(result.records, now);
  const [links, seen] = await Promise.all([
    ports.existingLinks(),
    ports.seenKeys(translation.readings.map(asRecord)),
  ]);
  const plan = planDeviceSync({ provider: connection.provider, links, seen, readings: translation.readings });

  await ports.apply(plan);

  const written = new Set(plan.signals.map((signal) => signal.externalId));
  const entries = translation.readings
    .filter((reading) => written.has(reading.externalId))
    .map((reading) => ({ record: asRecord(reading), status: "processed" as const }));
  await ports.recordEvents(entries);

  const state = await ports.recordOutcome({ ok: true, partialFailures: result.partialFailures });

  return {
    ok: true,
    state,
    recorded: plan.signals.length,
    unchanged: plan.unchanged,
    newDevices: plan.newDevices.length,
    waiting: plan.waiting,
    ignored: plan.ignored,
    skipped: translation.skipped.length,
    partialFailures: result.partialFailures.length,
  };
}
