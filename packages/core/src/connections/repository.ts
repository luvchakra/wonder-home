import type { SupabaseClient } from "@supabase/supabase-js";

import { getConnectorType, publicParamKeys, secretParamKeys } from "../connectors/registry";

/**
 * Reading and writing a household's connections (the Connections framework).
 *
 * A connection's non-secret params live on the row (member-readable); its secret
 * params go to connection_secrets, which only the service role can read. Writing
 * splits a supplied params object into the two by what the connector type marks
 * secret, so a caller just passes "the parameters" and never decides where each
 * one is stored.
 */

export type ConnectionStatus = "created" | "connected" | "reconnect_needed" | "error" | "disconnected";

export type Connection = {
  id: string;
  householdId: string;
  name: string;
  connectorType: string;
  status: ConnectionStatus;
  /** Non-secret params only (url, username, …) — never a password. */
  params: Record<string, string>;
  createdAt: Date;
};

type Row = Record<string, unknown>;

const SELECT = "id, household_id, name, connector_type, status, params, created_at";

function toConnection(row: Row): Connection {
  return {
    id: row.id as string,
    householdId: row.household_id as string,
    name: row.name as string,
    connectorType: row.connector_type as string,
    status: (row.status as ConnectionStatus) ?? "created",
    params: (row.params as Record<string, string> | null) ?? {},
    createdAt: new Date(row.created_at as string),
  };
}

/** Split a supplied params object into the non-secret ones (stored on the row) and the secret ones. */
function splitParams(connectorType: string, params: Record<string, string>): { publicParams: Record<string, string>; secrets: Record<string, string> } {
  const type = getConnectorType(connectorType);
  const publicParams: Record<string, string> = {};
  const secrets: Record<string, string> = {};
  if (!type) return { publicParams, secrets };
  const secretKeys = new Set(secretParamKeys(type));
  const publicKeys = new Set(publicParamKeys(type));
  for (const [key, value] of Object.entries(params)) {
    if (secretKeys.has(key)) {
      if (value !== "") secrets[key] = value; // a blank secret keeps the stored one
    } else if (publicKeys.has(key)) {
      publicParams[key] = value;
    }
  }
  return { publicParams, secrets };
}

/** A household's connections, newest first; non-secret params only. */
export async function listConnections(supabase: SupabaseClient, householdId: string, opts?: { connectorType?: string }): Promise<Connection[]> {
  let query = supabase.from("connections").select(SELECT).eq("household_id", householdId).order("created_at", { ascending: false });
  if (opts?.connectorType) query = query.eq("connector_type", opts.connectorType);
  const { data, error } = await query;
  if (error) throw new Error(`listConnections failed: ${error.code ?? "unknown"}`);
  return ((data as Row[] | null) ?? []).map(toConnection);
}

export async function getConnection(supabase: SupabaseClient, householdId: string, id: string): Promise<Connection | null> {
  const { data, error } = await supabase.from("connections").select(SELECT).eq("household_id", householdId).eq("id", id).maybeSingle();
  if (error) throw new Error(`getConnection failed: ${error.code ?? "unknown"}`);
  return data ? toConnection(data as Row) : null;
}

/** Create a connection and store its secrets. Returns the new connection id. */
export async function createConnection(
  supabase: SupabaseClient,
  input: { householdId: string; name: string; connectorType: string; params: Record<string, string>; actorMemberId: string },
): Promise<string> {
  const { publicParams, secrets } = splitParams(input.connectorType, input.params);
  const { data, error } = await supabase
    .from("connections")
    .insert({
      household_id: input.householdId,
      name: input.name,
      connector_type: input.connectorType,
      params: publicParams,
      created_by_member_id: input.actorMemberId,
    })
    .select("id")
    .single();
  if (error) throw new Error(`createConnection failed: ${error.code ?? "unknown"}`);
  const id = (data as Row).id as string;
  if (Object.keys(secrets).length > 0) {
    const { error: secretError } = await supabase
      .from("connection_secrets")
      .insert({ connection_id: id, household_id: input.householdId, secret: secrets });
    if (secretError) throw new Error(`createConnection secret failed: ${secretError.code ?? "unknown"}`);
  }
  return id;
}

/** Update a connection's name and/or params; a blank secret keeps the stored one. */
export async function updateConnection(
  supabase: SupabaseClient,
  input: { householdId: string; id: string; name?: string; connectorType: string; params?: Record<string, string> },
): Promise<void> {
  const patch: Row = {};
  if (input.name !== undefined) patch.name = input.name;
  let secrets: Record<string, string> = {};
  if (input.params) {
    const split = splitParams(input.connectorType, input.params);
    patch.params = split.publicParams;
    secrets = split.secrets;
  }
  if (Object.keys(patch).length > 0) {
    const { error } = await supabase.from("connections").update(patch).eq("household_id", input.householdId).eq("id", input.id);
    if (error) throw new Error(`updateConnection failed: ${error.code ?? "unknown"}`);
  }
  if (Object.keys(secrets).length > 0) {
    const { error } = await supabase
      .from("connection_secrets")
      .upsert({ connection_id: input.id, household_id: input.householdId, secret: secrets }, { onConflict: "connection_id" });
    if (error) throw new Error(`updateConnection secret failed: ${error.code ?? "unknown"}`);
  }
}

export async function deleteConnection(supabase: SupabaseClient, householdId: string, id: string): Promise<void> {
  const { error } = await supabase.from("connections").delete().eq("household_id", householdId).eq("id", id);
  if (error) throw new Error(`deleteConnection failed: ${error.code ?? "unknown"}`);
}

export async function setConnectionStatus(
  adminClient: SupabaseClient,
  input: { householdId: string; id: string; status: ConnectionStatus },
): Promise<void> {
  const { error } = await adminClient.from("connections").update({ status: input.status }).eq("household_id", input.householdId).eq("id", input.id);
  if (error) throw new Error(`setConnectionStatus failed: ${error.code ?? "unknown"}`);
}

/**
 * Read a connection's secret params with the service role (the worker/connector
 * runtime only). Never call this from anything that renders to a browser.
 */
export async function readConnectionSecrets(adminClient: SupabaseClient, connectionId: string): Promise<Record<string, string> | null> {
  const { data, error } = await adminClient.from("connection_secrets").select("secret").eq("connection_id", connectionId).maybeSingle();
  if (error) throw new Error(`readConnectionSecrets failed: ${error.code ?? "unknown"}`);
  const secret = (data as Row | null)?.secret;
  return secret ? (secret as Record<string, string>) : null;
}
