import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { ApiError } from "../api/errors";
import type { Connection } from "../integrations/repository";
import { recordEvent, recordSyncOutcome, seenKeys } from "../integrations/repository";
import { describeDeviceLink, type DeviceLink, type DeviceSyncPlan } from "./device-connector";
import type { DeviceSyncPorts } from "./device-sync";

/**
 * Reading and writing device links (story 17-008).
 *
 * Two clients, on purpose. What a household decides — which appliance a
 * device is, whether to ignore it — goes through the Admin's own session, so
 * RLS and the column grants decide. What a sync writes — a device the
 * provider reported, a reading — goes through the service role, because
 * evidence a member could write is not evidence; the route that calls it has
 * already checked the caller is an Admin of this household.
 */

type Row = Record<string, unknown>;

/** Changing one device, as the API and the screen take it. */
export const updateDeviceLinkSchema = z
  .object({
    assetId: z.uuid().nullable().optional(),
    ignored: z.boolean().optional(),
  })
  .refine((value) => value.assetId !== undefined || value.ignored !== undefined, {
    error: "Say which appliance it is, or whether to ignore it.",
  });

export type HouseholdDevice = DeviceLink & {
  provider: string;
  assetName: string | null;
  /** Newest reading recorded from it, if any. */
  lastReadingAt: Date | null;
  /** In the household's words. */
  status: string;
};

export async function listDevices(supabase: SupabaseClient, householdId: string): Promise<HouseholdDevice[]> {
  const { data, error } = await supabase
    .from("home_device_links")
    .select("id, external_device_id, device_key, label, asset_id, ignored, integrations(provider), home_assets(name)")
    .eq("household_id", householdId)
    .order("label", { ascending: true });

  if (error) throw new Error(`listDevices failed: ${error.code ?? "unknown"}`);
  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return [];

  const keys = rows.map((row) => row.device_key as string);
  const { data: readings, error: readingsError } = await supabase
    .from("home_device_signals")
    .select("device_key, observed_at")
    .eq("household_id", householdId)
    .in("device_key", keys)
    .order("observed_at", { ascending: false })
    .limit(500);
  if (readingsError) throw new Error(`listDevices failed: ${readingsError.code ?? "unknown"}`);

  const latest = new Map<string, Date>();
  for (const reading of (readings ?? []) as Row[]) {
    const key = reading.device_key as string;
    if (!latest.has(key)) latest.set(key, new Date(reading.observed_at as string));
  }

  return rows.map((row) => {
    const link: DeviceLink = {
      id: row.id as string,
      externalDeviceId: row.external_device_id as string,
      deviceKey: row.device_key as string,
      label: row.label as string,
      assetId: (row.asset_id as string | null) ?? null,
      ignored: Boolean(row.ignored),
    };
    const assetName = ((row.home_assets as Row | null)?.name as string | undefined) ?? null;
    return {
      ...link,
      provider: ((row.integrations as Row | null)?.provider as string | undefined) ?? "",
      assetName,
      lastReadingAt: latest.get(link.deviceKey) ?? null,
      status: describeDeviceLink(link, assetName),
    };
  });
}

/**
 * The household's decision about one device: which appliance it is (or none),
 * and whether to ignore it. Admin only — RLS and the column grants refuse
 * anyone else, and anything but these two columns.
 */
export async function updateDeviceLink(
  supabase: SupabaseClient,
  input: { householdId: string; linkId: string; assetId?: string | null; ignored?: boolean },
): Promise<void> {
  const patch: Row = {};
  if (input.assetId !== undefined) patch.asset_id = input.assetId;
  if (input.ignored !== undefined) patch.ignored = input.ignored;

  const { data, error } = await supabase
    .from("home_device_links")
    .update(patch)
    .eq("id", input.linkId)
    .eq("household_id", input.householdId)
    .select("id");

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only a household administrator can say which appliance a device is.");
    if (error.code === "23503") throw ApiError.badRequest("That appliance is not part of this household.");
    throw new Error(`updateDeviceLink failed: ${error.code ?? "unknown"}`);
  }
  if ((data ?? []).length === 0) throw ApiError.notFound("That device could not be found.");
}

async function existingLinks(admin: SupabaseClient, integrationId: string): Promise<DeviceLink[]> {
  const { data, error } = await admin
    .from("home_device_links")
    .select("id, external_device_id, device_key, label, asset_id, ignored")
    .eq("integration_id", integrationId);
  if (error) throw new Error(`existingLinks failed: ${error.code ?? "unknown"}`);
  return ((data ?? []) as Row[]).map((row) => ({
    id: row.id as string,
    externalDeviceId: row.external_device_id as string,
    deviceKey: row.device_key as string,
    label: row.label as string,
    assetId: (row.asset_id as string | null) ?? null,
    ignored: Boolean(row.ignored),
  }));
}

/** Writes a sync's plan. Service role: see the module comment. */
export async function applyDeviceSyncPlan(
  admin: SupabaseClient,
  input: { householdId: string; integrationId: string; plan: DeviceSyncPlan },
): Promise<void> {
  const { householdId, integrationId, plan } = input;

  if (plan.newDevices.length > 0) {
    const { error } = await admin.from("home_device_links").upsert(
      plan.newDevices.map((device) => ({
        household_id: householdId,
        integration_id: integrationId,
        external_device_id: device.externalDeviceId,
        device_key: device.deviceKey,
        label: device.label,
      })),
      // A concurrent sync that got there first has already made the link, and
      // the household's decision on it must not be reset.
      { onConflict: "integration_id,external_device_id", ignoreDuplicates: true },
    );
    if (error) throw new Error(`applyDeviceSyncPlan links failed: ${error.code ?? "unknown"}`);
  }

  if (plan.signals.length > 0) {
    const { error } = await admin.from("home_device_signals").upsert(
      plan.signals.map((signal) => ({
        household_id: householdId,
        asset_id: signal.assetId,
        device_key: signal.deviceKey,
        kind: signal.kind,
        observed_at: signal.observedAt.toISOString(),
        value: signal.value,
        confidence: signal.confidence,
      })),
      { onConflict: "household_id,device_key,kind,observed_at", ignoreDuplicates: true },
    );
    if (error) throw new Error(`applyDeviceSyncPlan signals failed: ${error.code ?? "unknown"}`);
  }
}

/**
 * The real ports for a device sync. The connection's own health and event log
 * go through the Admin's session like every other connector; the links and
 * readings go through the service role.
 */
export function deviceSyncPorts(supabase: SupabaseClient, admin: SupabaseClient, connection: Connection): DeviceSyncPorts {
  return {
    existingLinks: () => existingLinks(admin, connection.id),
    seenKeys: (records) => seenKeys(supabase, connection.id, records),
    apply: (plan) => applyDeviceSyncPlan(admin, { householdId: connection.householdId, integrationId: connection.id, plan }),
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
