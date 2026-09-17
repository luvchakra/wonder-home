import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import {
  applySyncOutcome,
  connectionNeedsAttention,
  describeStatus,
  type ConnectionState,
  type ConnectorError,
  type ConnectorKind,
  type ConnectorStatus,
  type ProviderRecord,
} from "./connector";

/**
 * Reading and recording provider connections (story 17-001).
 *
 * The rule this module keeps: a provider's trouble never reaches canonical
 * household state. A failed sync updates the connection's health and nothing
 * else, so an outage can make WonderHome less current but never wrong.
 */

type Row = Record<string, unknown>;

export type Integration = {
  id: string;
  kind: ConnectorKind;
  provider: string;
  status: ConnectorStatus;
  /** In the household's words, with nothing of the provider's internals. */
  statusLabel: string;
  scopes: string[];
  lastSyncAt: Date | null;
  lastSuccessAt: Date | null;
  consecutiveFailures: number;
  /** Whether a person has to do something — granting access again, usually. */
  needsAttention: boolean;
};

export async function listIntegrations(
  supabase: SupabaseClient,
  householdId: string,
): Promise<Integration[]> {
  const { data, error } = await supabase
    .from("integrations")
    // Note what is not selected: credential_ref never leaves the database.
    .select("id, kind, provider, status, scopes, last_sync_at, last_success_at, consecutive_failures, last_error_code")
    .eq("household_id", householdId)
    .order("kind", { ascending: true });

  if (error) throw new Error(`listIntegrations failed: ${error.code ?? "unknown"}`);

  return (data ?? []).map((row: Row) => {
    const status = row.status as ConnectorStatus;
    const state: ConnectionState = {
      status,
      consecutiveFailures: Number(row.consecutive_failures ?? 0),
      lastErrorCode: (row.last_error_code as string | null) ?? null,
    };

    return {
      id: row.id as string,
      kind: row.kind as ConnectorKind,
      provider: row.provider as string,
      status,
      statusLabel: describeStatus(status),
      scopes: (row.scopes as string[] | null) ?? [],
      lastSyncAt: row.last_sync_at ? new Date(row.last_sync_at as string) : null,
      lastSuccessAt: row.last_success_at ? new Date(row.last_success_at as string) : null,
      consecutiveFailures: state.consecutiveFailures,
      needsAttention: connectionNeedsAttention(state),
    };
  });
}

export async function connectIntegration(
  supabase: SupabaseClient,
  input: {
    householdId: string;
    kind: ConnectorKind;
    provider: string;
    scopes: readonly string[];
    credentialRef?: string | null;
  },
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("integrations")
    .upsert(
      {
        household_id: input.householdId,
        kind: input.kind,
        provider: input.provider,
        scopes: input.scopes,
        credential_ref: input.credentialRef ?? null,
        status: "connecting",
      },
      { onConflict: "household_id,kind,provider" },
    )
    .select("id")
    .single();

  if (error) {
    if (error.code === "42501") {
      throw ApiError.forbidden("Only a household administrator can connect an account.");
    }
    throw new Error(`connectIntegration failed: ${error.code ?? "unknown"}`);
  }

  return { id: (data as Row).id as string };
}

/**
 * Records what a sync did to a connection's health.
 *
 * Only the connection row changes here. Whatever the sync imported is written
 * by the domain module that understands it, in its own transaction, so a
 * half-finished import cannot leave a connection claiming success.
 */
export async function recordSyncOutcome(
  supabase: SupabaseClient,
  integrationId: string,
  current: ConnectionState,
  outcome: { ok: true; partialFailures: readonly ConnectorError[] } | { ok: false; error: ConnectorError },
  now: Date = new Date(),
): Promise<ConnectionState> {
  const next = applySyncOutcome(current, outcome);

  const { error } = await supabase
    .from("integrations")
    .update({
      status: next.status,
      consecutive_failures: next.consecutiveFailures,
      last_error_code: next.lastErrorCode,
      last_error_at: outcome.ok ? undefined : now.toISOString(),
      last_sync_at: now.toISOString(),
      last_success_at: outcome.ok ? now.toISOString() : undefined,
    })
    .eq("id", integrationId);

  if (error) throw new Error(`recordSyncOutcome failed: ${error.code ?? "unknown"}`);
  return next;
}

/**
 * Which of these records have already been seen, by provider identity.
 *
 * Asked before an import rather than after, so a re-sync of a thousand
 * unchanged items costs one query instead of a thousand conflicting writes.
 */
export async function seenKeys(
  supabase: SupabaseClient,
  integrationId: string,
  records: readonly ProviderRecord<unknown>[],
): Promise<Set<string>> {
  if (records.length === 0) return new Set();

  const { data, error } = await supabase
    .from("integration_events")
    .select("external_id, payload_hash")
    .eq("integration_id", integrationId)
    .in("external_id", [...new Set(records.map((record) => record.externalId))]);

  if (error) throw new Error(`seenKeys failed: ${error.code ?? "unknown"}`);

  return new Set((data ?? []).map((row: Row) => `${row.external_id as string}:${row.payload_hash as string}`));
}

/** Records that a provider record was received, so the next sync skips it. */
export async function recordEvent(
  supabase: SupabaseClient,
  input: {
    householdId: string;
    integrationId: string;
    record: ProviderRecord<unknown>;
    status?: "received" | "processed" | "ignored" | "failed";
    errorCode?: string | null;
  },
): Promise<void> {
  const { error } = await supabase.from("integration_events").insert({
    household_id: input.householdId,
    integration_id: input.integrationId,
    external_id: input.record.externalId,
    event_type: input.record.type,
    payload_hash: input.record.contentHash,
    status: input.status ?? "received",
    processed_at: input.status === "processed" ? new Date().toISOString() : null,
    error_code: input.errorCode ?? null,
  });

  // A duplicate is the normal case on a re-sync, not a failure: the unique
  // constraint is doing exactly what it exists for.
  if (error && error.code !== "23505") {
    throw new Error(`recordEvent failed: ${error.code ?? "unknown"}`);
  }
}
