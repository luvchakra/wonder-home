import { createHash } from "node:crypto";

import type { Connector, ProviderRecord } from "../integrations/connector";
import { SIGNAL_FRESHNESS_HOURS, SIGNAL_KINDS, type SignalKind } from "./signals";

/**
 * Optional device connectors (story 17-008).
 *
 * A smart-home provider — a hub, a plug, a washing machine's own cloud —
 * reports readings. Every adapter produces this one canonical payload, so
 * the maintenance and laundry logic that reads `home_device_signals` never
 * learns which provider a reading came from, and swapping one is a
 * registration change.
 *
 * Three rules keep devices optional and honest:
 *
 * **A device is stated, never inferred.** The first time a provider reports a
 * device it becomes a link to nothing. An Admin says which appliance it is,
 * or that it should be ignored. Until then its readings are counted as
 * waiting and recorded nowhere: a reading filed against the wrong machine
 * would move the wrong service date.
 *
 * **Only a reading that could still change a decision is kept.** A door
 * sensor's report from yesterday says nothing about now (`signals.ts`'s
 * freshness windows), so a backlog a provider replays after an outage is
 * read and dropped, not written as if it were current.
 *
 * **A device reports; it never confirms.** Whatever confidence a provider
 * claims is capped below certainty, so a device can settle something only
 * alongside `signals.ts`'s own floor and never stand in for a person's word.
 *
 * `CLAUDE.md` governs whether any of this is live: no provider is, until
 * credentials, consent, authentication and integration tests exist.
 */

export const DEVICE_SCOPES = { readings: "devices.read" } as const;

/** What every device adapter must produce, in WonderHome's words. */
export type DevicePayload = {
  /** The provider's identifier for the device. */
  deviceId: string;
  /** What the provider calls it, so an Admin can recognise it. */
  deviceName: string;
  /** One of `SIGNAL_KINDS`. Anything else is not a reading WonderHome uses. */
  kind: string;
  value: number;
  /** ISO 8601. */
  observedAt: string;
  /** How much the provider trusts its own reading, 0..1. */
  confidence?: number | null;
};

export type DeviceConnector = Connector<DevicePayload>;

/** A provider's confidence is never taken as certainty. */
export const DEVICE_CONFIDENCE_CEILING = 0.95;
/** When a provider says nothing about confidence: the database's own default. */
export const DEVICE_DEFAULT_CONFIDENCE = 0.5;
/** A clock a little ahead is ordinary; a reading from tomorrow is not. */
const FUTURE_TOLERANCE_MS = 5 * 60_000;

export type TranslatedReading = {
  /** Identity of the reading itself, for the event log. */
  externalId: string;
  contentHash: string;
  externalDeviceId: string;
  deviceName: string;
  kind: SignalKind;
  value: number;
  observedAt: Date;
  confidence: number;
};

export type DeviceTranslation = {
  readings: TranslatedReading[];
  /** Records that could not become a reading, with why. Never silently dropped. */
  skipped: { record: ProviderRecord<DevicePayload>; because: string }[];
};

const KINDS: ReadonlySet<string> = new Set(SIGNAL_KINDS);

export function translateDeviceReadings(
  records: readonly ProviderRecord<DevicePayload>[],
  now: Date,
): DeviceTranslation {
  const readings: TranslatedReading[] = [];
  const skipped: DeviceTranslation["skipped"] = [];
  const inBatch = new Set<string>();

  for (const record of records) {
    const payload = record.payload;
    const deviceId = typeof payload.deviceId === "string" ? payload.deviceId.trim() : "";
    if (!deviceId || deviceId.length > 200) {
      skipped.push({ record, because: "The provider did not say which device this was." });
      continue;
    }
    if (!KINDS.has(payload.kind)) {
      skipped.push({ record, because: "WonderHome does not use this kind of reading." });
      continue;
    }
    if (typeof payload.value !== "number" || !Number.isFinite(payload.value)) {
      skipped.push({ record, because: "The reading had no usable value." });
      continue;
    }
    const observedAt = new Date(payload.observedAt);
    if (Number.isNaN(observedAt.getTime()) || observedAt.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
      skipped.push({ record, because: "The reading had no believable time." });
      continue;
    }
    const kind = payload.kind as SignalKind;
    const ageHours = (now.getTime() - observedAt.getTime()) / 3_600_000;
    if (ageHours > SIGNAL_FRESHNESS_HOURS[kind]) {
      skipped.push({ record, because: "Too old to change anything now." });
      continue;
    }

    const externalId = `${deviceId}@${observedAt.toISOString()}#${kind}`;
    if (inBatch.has(externalId)) {
      skipped.push({ record, because: "The provider sent the same reading twice." });
      continue;
    }
    inBatch.add(externalId);

    const name = typeof payload.deviceName === "string" ? payload.deviceName.trim().slice(0, 120) : "";
    readings.push({
      externalId,
      contentHash: hashOf(payload),
      externalDeviceId: deviceId,
      deviceName: name || "Unnamed device",
      kind,
      value: payload.value,
      observedAt,
      confidence: boundedConfidence(payload.confidence),
    });
  }

  return { readings, skipped };
}

function boundedConfidence(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEVICE_DEFAULT_CONFIDENCE;
  const clamped = Math.min(Math.max(value, 0), DEVICE_CONFIDENCE_CEILING);
  return Math.round(clamped * 100) / 100;
}

function hashOf(payload: DevicePayload): string {
  return createHash("sha256")
    .update(JSON.stringify([payload.deviceId, payload.kind, payload.value, payload.observedAt, payload.confidence ?? null]))
    .digest("hex");
}

/**
 * The key a device's readings are recorded under: stable per provider and
 * device, and within the 80 characters `home_device_signals` allows. A long
 * provider identifier is hashed rather than cut, so two long ids that share
 * a prefix never collapse into one device.
 */
export function deviceKeyFor(provider: string, externalDeviceId: string): string {
  const key = `${provider}:${externalDeviceId}`;
  if (key.length <= 80) return key;
  const digest = createHash("sha256").update(externalDeviceId).digest("hex").slice(0, 40);
  return `${provider.slice(0, 38)}:${digest}`;
}

export type DeviceLink = {
  id: string;
  externalDeviceId: string;
  deviceKey: string;
  label: string;
  assetId: string | null;
  ignored: boolean;
};

export type SignalToRecord = {
  externalId: string;
  deviceKey: string;
  assetId: string;
  kind: SignalKind;
  value: number;
  observedAt: Date;
  confidence: number;
};

export type DeviceSyncPlan = {
  /** Devices reported for the first time: linked to nothing until an Admin says. */
  newDevices: { externalDeviceId: string; deviceKey: string; label: string }[];
  signals: SignalToRecord[];
  /** Readings already recorded on an earlier sync. */
  unchanged: number;
  /** Readings from a device nobody has said is which appliance yet. */
  waiting: number;
  /** Readings from a device the household chose to ignore. */
  ignored: number;
};

/**
 * What a sync writes. Reconciliation is by provider identity within this
 * connection: a device already linked keeps its link and the household's
 * decision about it, whatever name the provider now gives it.
 */
export function planDeviceSync(input: {
  provider: string;
  links: readonly DeviceLink[];
  seen: ReadonlySet<string>;
  readings: readonly TranslatedReading[];
}): DeviceSyncPlan {
  const byDevice = new Map(input.links.map((link) => [link.externalDeviceId, link]));
  const plan: DeviceSyncPlan = { newDevices: [], signals: [], unchanged: 0, waiting: 0, ignored: 0 };

  for (const reading of input.readings) {
    const link = byDevice.get(reading.externalDeviceId);
    if (!link) {
      const created: DeviceLink = {
        id: "",
        externalDeviceId: reading.externalDeviceId,
        deviceKey: deviceKeyFor(input.provider, reading.externalDeviceId),
        label: reading.deviceName,
        assetId: null,
        ignored: false,
      };
      byDevice.set(reading.externalDeviceId, created);
      plan.newDevices.push({ externalDeviceId: created.externalDeviceId, deviceKey: created.deviceKey, label: created.label });
      plan.waiting += 1;
      continue;
    }
    if (input.seen.has(`${reading.externalId}:${reading.contentHash}`)) {
      plan.unchanged += 1;
      continue;
    }
    if (link.ignored) {
      plan.ignored += 1;
      continue;
    }
    if (!link.assetId) {
      plan.waiting += 1;
      continue;
    }
    plan.signals.push({
      externalId: reading.externalId,
      deviceKey: link.deviceKey,
      assetId: link.assetId,
      kind: reading.kind,
      value: reading.value,
      observedAt: reading.observedAt,
      confidence: reading.confidence,
    });
  }

  return plan;
}

/** How a device's state is said to a household. */
export function describeDeviceLink(link: Pick<DeviceLink, "assetId" | "ignored">, assetName: string | null): string {
  if (link.ignored) return "Ignored — its readings are not used.";
  if (!link.assetId) return "Not linked to an appliance yet, so its readings are not used.";
  return `Readings count towards ${assetName ?? "its appliance"}.`;
}
