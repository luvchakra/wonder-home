import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import { auditChange } from "../api/audit";
import { ApiError } from "../api/errors";

/**
 * A connected school portal's sign-in (story 08-032).
 *
 * Note which client each function takes, because that is the whole design.
 * Setting and clearing go through the caller's own session, so RLS decides
 * whether they are an Admin, and the password is written but never read back
 * (its column has no select grant). Reading the sign-in to run the connector
 * goes through the admin (service-role) client, because that is the only thing
 * that can read the password at all — and it never reaches a browser.
 *
 * The same bargain household_ai_credentials strikes, for the same reason: a
 * portal with no API has nowhere else to keep a parent's username and password.
 */

export type SchoolPortalCredential = {
  integrationId: string;
  portalUrl: string;
  username: string;
  password: string;
};

export type SchoolPortalConnectionStatus = {
  integrationId: string;
  portalUrl: string;
  username: string;
  updatedAt: Date | null;
};

type Row = Record<string, unknown>;

/**
 * Write a sign-in without ever reading the password back.
 *
 * An upsert cannot work: Postgres needs select on the columns `ON CONFLICT DO
 * UPDATE` sets, and the password has no select grant. So the row is inserted,
 * and when one already exists for the connection it is updated by integration
 * id instead. Neither statement reads the password.
 */
async function writeCredentialRow(
  supabase: SupabaseClient,
  row: { household_id: string; integration_id: string; portal_url: string; username: string; password: string; set_by_member_id: string },
): Promise<PostgrestError | null> {
  const { error } = await supabase.from("school_portal_credentials").insert(row);
  if (error?.code !== "23505") return error;
  const { integration_id, household_id: _household, ...changes } = row;
  void _household;
  const { error: updateError } = await supabase.from("school_portal_credentials").update(changes).eq("integration_id", integration_id);
  return updateError;
}

/** Store or replace a connection's sign-in. The caller's session must be an Admin's. */
export async function setSchoolPortalCredentials(
  supabase: SupabaseClient,
  input: { householdId: string; integrationId: string; portalUrl: string; username: string; password: string; setByMemberId: string },
): Promise<void> {
  const error = await writeCredentialRow(supabase, {
    household_id: input.householdId,
    integration_id: input.integrationId,
    portal_url: input.portalUrl,
    username: input.username,
    password: input.password,
    set_by_member_id: input.setByMemberId,
  });

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only an Admin can connect a school portal.");
    throw new Error(`setSchoolPortalCredentials failed: ${error.code ?? "unknown"}`);
  }

  // The provider and who connected it are worth a trail entry; the password is
  // the one thing in this file that must never appear anywhere else, and the
  // audit never carries it.
  await auditChange({
    householdId: input.householdId,
    actorMemberId: input.setByMemberId,
    eventType: "school.portal_connected",
    targetTable: "school_portal_credentials",
    targetId: input.integrationId,
    metadata: { username: input.username },
  });
}

/**
 * Change a stored sign-in: the URL, the username, and the password when a new
 * one is given. A blank password keeps the current one — the password column
 * has no select grant, so "keep" means simply not writing it, never reading it
 * to compare. The caller's session must be an Admin's.
 */
export async function updateSchoolPortalCredentials(
  supabase: SupabaseClient,
  input: { householdId: string; integrationId: string; portalUrl: string; username: string; password?: string | null; actorMemberId: string },
): Promise<void> {
  const changes: Record<string, string> = { portal_url: input.portalUrl, username: input.username };
  if (input.password) changes.password = input.password;

  const { error } = await supabase
    .from("school_portal_credentials")
    .update(changes)
    .eq("household_id", input.householdId)
    .eq("integration_id", input.integrationId);
  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only an Admin can change a school portal's sign-in.");
    throw new Error(`updateSchoolPortalCredentials failed: ${error.code ?? "unknown"}`);
  }

  await auditChange({
    householdId: input.householdId,
    actorMemberId: input.actorMemberId,
    eventType: "school.portal_connected",
    targetTable: "school_portal_credentials",
    targetId: input.integrationId,
    metadata: { username: input.username, changed: input.password ? "url_username_password" : "url_username" },
  });
}

/** Forget a connection's sign-in. */
export async function clearSchoolPortalCredentials(
  supabase: SupabaseClient,
  input: { householdId: string; integrationId: string; actorMemberId?: string | null },
): Promise<void> {
  const { error } = await supabase
    .from("school_portal_credentials")
    .delete()
    .eq("household_id", input.householdId)
    .eq("integration_id", input.integrationId);
  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only an Admin can disconnect a school portal.");
    throw new Error(`clearSchoolPortalCredentials failed: ${error.code ?? "unknown"}`);
  }
  await auditChange({
    householdId: input.householdId,
    actorMemberId: input.actorMemberId ?? null,
    eventType: "school.portal_disconnected",
    targetTable: "school_portal_credentials",
    targetId: input.integrationId,
  });
}

/** Which of a household's school portals have a stored sign-in, and as whom. Never the password. */
export async function schoolPortalCredentialStatus(
  supabase: SupabaseClient,
  householdId: string,
): Promise<SchoolPortalConnectionStatus[]> {
  const { data, error } = await supabase.rpc("school_portal_credential_status", { p_household_id: householdId });
  if (error) throw new Error(`schoolPortalCredentialStatus failed: ${error.code ?? "unknown"}`);
  return ((data as Row[] | null) ?? []).map((row) => ({
    integrationId: row.integration_id as string,
    portalUrl: row.portal_url as string,
    username: row.username as string,
    updatedAt: row.updated_at ? new Date(row.updated_at as string) : null,
  }));
}

/**
 * Read a connection's full sign-in to run the connector.
 *
 * Server only: pass the admin (service-role) client, the one thing that can read
 * the password. Never call this from anything that renders to a browser, and
 * never return the result to one.
 */
export async function readSchoolPortalCredentials(
  adminClient: SupabaseClient,
  integrationId: string,
): Promise<SchoolPortalCredential | null> {
  const { data, error } = await adminClient
    .from("school_portal_credentials")
    .select("integration_id, portal_url, username, password")
    .eq("integration_id", integrationId)
    .maybeSingle();
  if (error) throw new Error(`readSchoolPortalCredentials failed: ${error.code ?? "unknown"}`);
  if (!data) return null;
  const row = data as Row;
  return {
    integrationId: row.integration_id as string,
    portalUrl: row.portal_url as string,
    username: row.username as string,
    password: row.password as string,
  };
}
