import type { SupabaseClient } from "@supabase/supabase-js";

import { auditChange } from "../api/audit";
import { ApiError } from "../api/errors";
import type { HomeSendAddress, HomeSendAddressStatus } from "./items";

/**
 * The household's own HomeSend email address (Phase 2).
 *
 * Reading the address is open to every member (they need to copy/share it);
 * creating, rotating or revoking it is admin-only, the same shape as the
 * household's own AI key. Resolving a household FROM an address
 * (`resolveHouseholdIdByAddress`) is the one function in this file the
 * inbound webhook calls — always with the admin client, since a webhook
 * request carries no household session and must never be trusted to name
 * its own household.
 */

type Row = Record<string, unknown>;

function fromRow(row: Row): HomeSendAddress {
  return {
    id: row.id as string,
    householdId: row.household_id as string,
    address: row.address as string,
    status: row.status as HomeSendAddressStatus,
    createdAt: row.created_at as string,
    rotatedAt: (row.rotated_at as string | null) ?? null,
    revokedAt: (row.revoked_at as string | null) ?? null,
  };
}

const SELECT_COLUMNS = "id, household_id, address, status, created_at, rotated_at, revoked_at";

/** The domain HomeSend addresses are minted under, from the deployment's own environment. Unset means the feature is not configured. */
export function platformHomeSendEmailDomain(env: Record<string, string | undefined> = process.env): string | null {
  const domain = env.WONDERHOME_HOMESEND_EMAIL_DOMAIN?.trim();
  return domain ? domain : null;
}

/** A cryptographically random local-part — unguessable is the whole of its defense against unsolicited mail, since the address itself never authorizes anything (the provider's webhook signature does). */
export function generateHomeSendAddress(domain: string): string {
  const bytes = new Uint8Array(15);
  crypto.getRandomValues(bytes);
  const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `hs-${token}@${domain.trim().toLowerCase()}`;
}

export async function getHomeSendAddress(supabase: SupabaseClient, householdId: string): Promise<HomeSendAddress | null> {
  const { data, error } = await supabase
    .from("homesend_addresses")
    .select(SELECT_COLUMNS)
    .eq("household_id", householdId)
    .maybeSingle();

  if (error) throw new Error(`getHomeSendAddress failed: ${error.code ?? "unknown"}`);
  return data ? fromRow(data as Row) : null;
}

export async function createHomeSendAddress(
  supabase: SupabaseClient,
  input: { householdId: string; actorMemberId: string; domain: string },
): Promise<HomeSendAddress> {
  const address = generateHomeSendAddress(input.domain);

  const { data, error } = await supabase
    .from("homesend_addresses")
    .insert({ household_id: input.householdId, address })
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only a household administrator can set up HomeSend email.");
    throw new Error(`createHomeSendAddress failed: ${error.code ?? "unknown"}`);
  }

  await auditChange({
    householdId: input.householdId,
    actorMemberId: input.actorMemberId,
    eventType: "homesend.address_created",
    targetTable: "homesend_addresses",
    targetId: data.id as string,
  });

  return fromRow(data as Row);
}

export async function rotateHomeSendAddress(
  supabase: SupabaseClient,
  input: { householdId: string; actorMemberId: string; domain: string },
): Promise<HomeSendAddress> {
  const address = generateHomeSendAddress(input.domain);

  const { data, error } = await supabase
    .from("homesend_addresses")
    .update({ address, rotated_at: new Date().toISOString(), status: "active", revoked_at: null })
    .eq("household_id", input.householdId)
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only a household administrator can rotate the HomeSend address.");
    throw new Error(`rotateHomeSendAddress failed: ${error.code ?? "unknown"}`);
  }

  await auditChange({
    householdId: input.householdId,
    actorMemberId: input.actorMemberId,
    eventType: "homesend.address_rotated",
    targetTable: "homesend_addresses",
    targetId: data.id as string,
  });

  return fromRow(data as Row);
}

export async function revokeHomeSendAddress(
  supabase: SupabaseClient,
  householdId: string,
  actorMemberId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("homesend_addresses")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("household_id", householdId)
    .select("id")
    .single();

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only a household administrator can turn off HomeSend email.");
    throw new Error(`revokeHomeSendAddress failed: ${error.code ?? "unknown"}`);
  }

  await auditChange({
    householdId,
    actorMemberId,
    eventType: "homesend.address_revoked",
    targetTable: "homesend_addresses",
    targetId: data.id as string,
  });
}

/**
 * The webhook's own lookup: given the address an inbound email was sent to,
 * which household is it for? Always the admin client — a provider webhook
 * carries no household session, and the household id in an inbound payload
 * is never trusted (architecture doc: "never accept household ID from
 * inbound payload"). Only an `active` address resolves; a revoked one is
 * silently unroutable, same as one that was never created.
 */
export async function resolveHouseholdIdByAddress(adminClient: SupabaseClient, address: string): Promise<string | null> {
  const { data, error } = await adminClient
    .from("homesend_addresses")
    .select("household_id")
    .eq("address", address.trim().toLowerCase())
    .eq("status", "active")
    .maybeSingle();

  if (error) throw new Error(`resolveHouseholdIdByAddress failed: ${error.code ?? "unknown"}`);
  return data ? (data.household_id as string) : null;
}
