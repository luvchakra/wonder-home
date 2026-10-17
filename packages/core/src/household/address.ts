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
  formattedAddress: string;
  placeId: string | null;
  location: LatLng | null;
};

type Row = { formatted_address: string; place_id: string | null; latitude: number | string | null; longitude: number | string | null };

export async function loadHouseholdAddress(supabase: SupabaseClient, householdId: string): Promise<HouseholdAddress | null> {
  const { data, error } = await supabase
    .from("household_addresses")
    .select("formatted_address, place_id, latitude, longitude")
    .eq("household_id", householdId)
    .maybeSingle();
  if (error) throw new Error(`loadHouseholdAddress failed: ${error.code ?? "unknown"}`);
  if (!data) return null;
  const row = data as Row;
  const latitude = row.latitude === null ? null : Number(row.latitude);
  const longitude = row.longitude === null ? null : Number(row.longitude);
  return {
    formattedAddress: row.formatted_address,
    placeId: row.place_id,
    location: latitude !== null && longitude !== null && Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null,
  };
}

/** A picked place (already re-read on the server) or a typed line. */
export type AddressInput = { place: Place } | { typed: string };

async function saveHouseholdAddressImpl(
  supabase: SupabaseClient,
  input: { householdId: string; memberId: string; address: AddressInput },
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

  const { error } = await supabase
    .from("household_addresses")
    .upsert({ household_id: input.householdId, set_by_member_id: input.memberId, ...row }, { onConflict: "household_id" });
  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only a household administrator can set the home address.");
    throw new Error(`saveHouseholdAddress failed: ${error.code ?? "unknown"}`);
  }
  return {
    formattedAddress: row.formatted_address,
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

export const saveHouseholdAddress = invalidatesContext(saveHouseholdAddressImpl, (_supabase, input) => input.householdId);
export const removeHouseholdAddress = invalidatesContext(removeHouseholdAddressImpl, (_supabase, householdId) => householdId);
