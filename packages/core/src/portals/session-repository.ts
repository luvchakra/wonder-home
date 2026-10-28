import type { SupabaseClient } from "@supabase/supabase-js";

import type { SessionState } from "./adapter";
import type { ConnectionState, ReconnectReason, SessionStore } from "./ensure-session";

/**
 * The persisted browser session for a connected portal (story 08-033).
 *
 * The session blob is a credential: `portal_sessions` has no select policy and
 * no grant for anyone reachable from a browser, so only the worker — with the
 * service role (the admin client) — can read or write it. That is why every
 * function here takes the admin client, never a member's session. A household
 * learns only the connection *state* (connected / reconnect_needed), through the
 * Admin-only `portal_session_status` RPC, never the blob itself.
 */

export type PortalSessionStatus = {
  integrationId: string;
  state: ConnectionState | "never";
  reason: string | null;
  lastOkAt: Date | null;
};

type Row = Record<string, unknown>;

/** A `SessionStore` (for `ensureSession`) backed by `portal_sessions`, read/written with the service role. */
export function portalSessionStore(adminClient: SupabaseClient, input: { householdId: string; integrationId: string }): SessionStore {
  return {
    async load(): Promise<SessionState | null> {
      const { data, error } = await adminClient
        .from("portal_sessions")
        .select("session")
        .eq("integration_id", input.integrationId)
        .maybeSingle();
      if (error) throw new Error(`portalSessionStore.load failed: ${error.code ?? "unknown"}`);
      const storage = (data as Row | null)?.session;
      return typeof storage === "string" && storage.length > 0 ? { storage } : null;
    },

    async save(session: SessionState): Promise<void> {
      const { error } = await adminClient.from("portal_sessions").upsert(
        {
          household_id: input.householdId,
          integration_id: input.integrationId,
          session: session.storage,
          state: "connected",
          reason: null,
          last_ok_at: new Date().toISOString(),
        },
        { onConflict: "integration_id" },
      );
      if (error) throw new Error(`portalSessionStore.save failed: ${error.code ?? "unknown"}`);
    },
  };
}

/** Record a connection state without touching the stored session (e.g. moving to reconnect_needed). */
export async function setPortalSessionState(
  adminClient: SupabaseClient,
  input: { householdId: string; integrationId: string; state: ConnectionState | "never"; reason?: ReconnectReason | null },
): Promise<void> {
  const { error } = await adminClient.from("portal_sessions").upsert(
    {
      household_id: input.householdId,
      integration_id: input.integrationId,
      state: input.state,
      reason: input.reason ?? null,
    },
    { onConflict: "integration_id" },
  );
  if (error) throw new Error(`setPortalSessionState failed: ${error.code ?? "unknown"}`);
}

// --- Connection-keyed variants (Connections framework). Same table, keyed by connection_id. ---

export type ConnectionSessionStatus = {
  connectionId: string;
  state: ConnectionState | "never";
  reason: string | null;
  lastOkAt: Date | null;
};

/** A `SessionStore` backed by `portal_sessions`, keyed by connection_id; service-role only. */
export function connectionSessionStore(adminClient: SupabaseClient, input: { householdId: string; connectionId: string }): SessionStore {
  return {
    async load(): Promise<SessionState | null> {
      const { data, error } = await adminClient
        .from("portal_sessions")
        .select("session")
        .eq("connection_id", input.connectionId)
        .maybeSingle();
      if (error) throw new Error(`connectionSessionStore.load failed: ${error.code ?? "unknown"}`);
      const storage = (data as Row | null)?.session;
      return typeof storage === "string" && storage.length > 0 ? { storage } : null;
    },
    async save(session: SessionState): Promise<void> {
      const { error } = await adminClient.from("portal_sessions").upsert(
        { household_id: input.householdId, connection_id: input.connectionId, session: session.storage, state: "connected", reason: null, last_ok_at: new Date().toISOString() },
        { onConflict: "connection_id" },
      );
      if (error) throw new Error(`connectionSessionStore.save failed: ${error.code ?? "unknown"}`);
    },
  };
}

/** Record a connection's state without touching the stored session. */
export async function setConnectionSessionState(
  adminClient: SupabaseClient,
  input: { householdId: string; connectionId: string; state: ConnectionState | "never"; reason?: ReconnectReason | null },
): Promise<void> {
  const { error } = await adminClient.from("portal_sessions").upsert(
    { household_id: input.householdId, connection_id: input.connectionId, state: input.state, reason: input.reason ?? null },
    { onConflict: "connection_id" },
  );
  if (error) throw new Error(`setConnectionSessionState failed: ${error.code ?? "unknown"}`);
}

/** The fetch states of a household's connections, for the Connections screen. Member-readable; never the session. */
export async function connectionSessionStatus(supabase: SupabaseClient, householdId: string): Promise<ConnectionSessionStatus[]> {
  const { data, error } = await supabase.rpc("portal_connection_status", { p_household_id: householdId });
  if (error) throw new Error(`connectionSessionStatus failed: ${error.code ?? "unknown"}`);
  return ((data as Row[] | null) ?? []).map((row) => ({
    connectionId: row.connection_id as string,
    state: row.state as ConnectionState | "never",
    reason: (row.reason as string | null) ?? null,
    lastOkAt: row.last_ok_at ? new Date(row.last_ok_at as string) : null,
  }));
}

/** The connection states of a household's portals, for the Connect-school screen. Admin-only; never the session. */
export async function portalSessionStatus(supabase: SupabaseClient, householdId: string): Promise<PortalSessionStatus[]> {
  const { data, error } = await supabase.rpc("portal_session_status", { p_household_id: householdId });
  if (error) throw new Error(`portalSessionStatus failed: ${error.code ?? "unknown"}`);
  return ((data as Row[] | null) ?? []).map((row) => ({
    integrationId: row.integration_id as string,
    state: row.state as ConnectionState | "never",
    reason: (row.reason as string | null) ?? null,
    lastOkAt: row.last_ok_at ? new Date(row.last_ok_at as string) : null,
  }));
}
