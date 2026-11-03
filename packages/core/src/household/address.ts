import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import { invalidatesContext } from "../context/invalidation";
import type { LatLng, Place } from "../places/provider";

/**
 * The household's home address (`household_addresses`).
 *
 * Picked from a place search when one is configured, typed when not. Adults
 * and Admins read it, an Admin sets or removes it (RLS); a helper or a child
 * gets `null`, the same as a household that never gave one. Onboarding and
 * Manage Household both write through `saveHouseholdAddress`, so there is one
 * write path (rule 23).
 */

export type HouseholdAddress = {
  /** The Google Maps (or typed) address, exactly as picked. Maps links and geocoding use this alone. */
  formattedAddress: string;
  /** Flat, house number, wing: one optional line shown before the address. Null when none. */
  unitLine: string | null;
  placeId: string | null;
  location: LatLng | null;
};

export const UNIT_LINE_MAX = 120;

/** The unit line as stored: trimmed, inner whitespace collapsed, bounded; null when empty. */
export function cleanUnitLine(value: unknown): string | null {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim().replace(/^[,\s]+|[,\s]+$/g, "") : "";
  return text ? text.slice(0, UNIT_LINE_MAX).trim() : null;
}

/** The one address people read: "<unit line>, <maps address>", or the maps address alone. */
export function combineAddress(unitLine: string | null | undefined, formattedAddress: string): string {
  const unit = cleanUnitLine(unitLine);
  const rest = formattedAddress.trim();
  return unit && rest ? `${unit}, ${rest}` : unit ?? rest;
}

/** A loaded address as one line for display. */
export function fullAddress(address: Pick<HouseholdAddress, "unitLine" | "formattedAddress">): string {
  return combineAddress(address.unitLine, address.formattedAddress);
}

type Row = { unit_line?: string | null; formatted_address: string; place_id: string | null; latitude: number | string | null; longitude: number | string | null };

export async function loadHouseholdAddress(supabase: SupabaseClient, householdId: string): Promise<HouseholdAddress | null> {
  const read = (columns: string) => supabase.from("household_addresses").select(columns).eq("household_id", householdId).maybeSingle();
  let { data, error } = await read("unit_line, formatted_address, place_id, latitude, longitude");
  // Safe in either order: before the unit_line migration lands, read without it.
  if (error?.code === "42703" || error?.code === "PGRST204") ({ data, error } = await read("formatted_address, place_id, latitude, longitude"));
  if (error) throw new Error(`loadHouseholdAddress failed: ${error.code ?? "unknown"}`);
  if (!data) return null;
  const row = data as unknown as Row;
  const latitude = row.latitude === null ? null : Number(row.latitude);
  const longitude = row.longitude === null ? null : Number(row.longitude);
  return {
    formattedAddress: row.formatted_address,
    unitLine: cleanUnitLine(row.unit_line),
    placeId: row.place_id,
    location: latitude !== null && longitude !== null && Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null,
  };
}

/** A picked place (already re-read on the server) or a typed line. */
export type AddressInput = { place: Place } | { typed: string };

async function saveHouseholdAddressImpl(
  supabase: SupabaseClient,
  input: { householdId: string; memberId: string; address: AddressInput; /** Undefined leaves the stored unit line alone. */ unitLine?: string | null },
): Promise<HouseholdAddress> {
  const row =
    "place" in input.address
      ? {
          formatted_address: input.address.place.formattedAddress.trim().slice(0, 300),
          place_id: input.address.place.placeId,
          latitude: round6(input.address.place.latitude),
          longitude: round6(input.address.place.longitude),
        }
      : { formatted_address: input.address.typed.trim().slice(0, 300), place_id: null, latitude: null, longitude: null };
  if (!row.formatted_address) throw ApiError.badRequest("What is the address?");

  const unitLine = input.unitLine === undefined ? undefined : cleanUnitLine(input.unitLine);
  const upsert = (withUnit: boolean) =>
    supabase
      .from("household_addresses")
      .upsert({ household_id: input.householdId, set_by_member_id: input.memberId, ...row, ...(withUnit && unitLine !== undefined ? { unit_line: unitLine } : {}) }, { onConflict: "household_id" });
  let { error } = await upsert(true);
  if (error?.code === "42703" || error?.code === "PGRST204") ({ error } = await upsert(false));
  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only a household administrator can set the home address.");
    throw new Error(`saveHouseholdAddress failed: ${error.code ?? "unknown"}`);
  }
  return {
    formattedAddress: row.formatted_address,
    unitLine: unitLine ?? null,
    placeId: row.place_id,
    location: row.latitude !== null && row.longitude !== null ? { latitude: row.latitude, longitude: row.longitude } : null,
  };
}

async function removeHouseholdAddressImpl(supabase: SupabaseClient, householdId: string): Promise<void> {
  const { error } = await supabase.from("household_addresses").delete().eq("household_id", householdId);
  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only a household administrator can remove the home address.");
    throw new Error(`removeHouseholdAddress failed: ${error.code ?? "unknown"}`);
  }
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/** Changes only the unit line of the address on record; the picked place stays exact. */
async function saveHouseholdUnitLineImpl(supabase: SupabaseClient, input: { householdId: string; memberId: string; unitLine: string | null }): Promise<void> {
  const { error } = await supabase
    .from("household_addresses")
    .update({ unit_line: cleanUnitLine(input.unitLine), set_by_member_id: input.memberId })
    .eq("household_id", input.householdId);
  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only a household administrator can set the home address.");
    throw new Error(`saveHouseholdUnitLine failed: ${error.code ?? "unknown"}`);
  }
}

export const saveHouseholdUnitLine = invalidatesContext(saveHouseholdUnitLineImpl, (_supabase, input) => input.householdId);
export const saveHouseholdAddress = invalidatesContext(saveHouseholdAddressImpl, (_supabase, input) => input.householdId);
export const removeHouseholdAddress = invalidatesContext(removeHouseholdAddressImpl, (_supabase, householdId) => householdId);
