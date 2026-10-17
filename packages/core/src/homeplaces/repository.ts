import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import { invalidatesContext } from "../context/invalidation";
import type { LatLng } from "../places/provider";

/**
 * The household's place book (`household_places`): places the family saved
 * from a HomePlaces answer or added by hand, and places they said are "not
 * for us". It is what HomePlaces learns from: saved places come first and
 * their kinds are preferred; turned-down places never come back. Every
 * member reads it; an adult or Admin changes it (RLS).
 */

export type PlaceStatus = "saved" | "not_for_us";

export type HouseholdPlace = {
  id: string;
  placeId: string;
  name: string;
  address: string;
  kind: string | null;
  location: LatLng | null;
  mapsUri: string | null;
  status: PlaceStatus;
  note: string | null;
};

type Row = {
  id: string;
  place_id: string;
  name: string;
  address: string | null;
  kind: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  maps_uri: string | null;
  status: string;
  note: string | null;
};

export async function listHouseholdPlaces(supabase: SupabaseClient, householdId: string): Promise<HouseholdPlace[]> {
  const { data, error } = await supabase
    .from("household_places")
    .select("id, place_id, name, address, kind, latitude, longitude, maps_uri, status, note")
    .eq("household_id", householdId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`listHouseholdPlaces failed: ${error.code ?? "unknown"}`);
  return ((data ?? []) as Row[]).map((row) => ({
    id: row.id,
    placeId: row.place_id,
    name: row.name,
    address: row.address ?? "",
    kind: row.kind,
    location: row.latitude !== null && row.longitude !== null ? { latitude: Number(row.latitude), longitude: Number(row.longitude) } : null,
    mapsUri: row.maps_uri,
    status: row.status === "not_for_us" ? "not_for_us" : "saved",
    note: row.note,
  }));
}

/** Save a place, or mark it "not for us": one row per place, the latest word wins. */
async function markPlaceImpl(
  supabase: SupabaseClient,
  input: {
    householdId: string;
    memberId: string;
    place: { placeId: string; name: string; address: string; kind: string | null; location: LatLng | null; mapsUri: string | null };
    status: PlaceStatus;
  },
): Promise<void> {
  const { error } = await supabase.from("household_places").upsert(
    {
      household_id: input.householdId,
      place_id: input.place.placeId,
      name: input.place.name.trim().slice(0, 200),
      address: input.place.address.trim().slice(0, 300) || null,
      kind: input.place.kind?.slice(0, 80) ?? null,
      latitude: input.place.location ? Math.round(input.place.location.latitude * 1e6) / 1e6 : null,
      longitude: input.place.location ? Math.round(input.place.location.longitude * 1e6) / 1e6 : null,
      maps_uri: input.place.mapsUri?.slice(0, 500) ?? null,
      status: input.status,
      set_by_member_id: input.memberId,
    },
    { onConflict: "household_id,place_id" },
  );
  if (error) throw refusal(error, "markPlace");
}

/** A note on a saved place ("Anya loves the swings"), or none. */
async function notePlaceImpl(supabase: SupabaseClient, input: { householdId: string; id: string; note: string | null }): Promise<void> {
  const { error } = await supabase
    .from("household_places")
    .update({ note: input.note?.trim().slice(0, 300) || null })
    .eq("household_id", input.householdId)
    .eq("id", input.id);
  if (error) throw refusal(error, "notePlace");
}

/** Forget a place: saved or turned down, it goes back to being any other place. */
async function forgetPlaceImpl(supabase: SupabaseClient, input: { householdId: string; id: string }): Promise<void> {
  const { error } = await supabase.from("household_places").delete().eq("household_id", input.householdId).eq("id", input.id);
  if (error) throw refusal(error, "forgetPlace");
}

/** Undo a Save or a "not for us" from where it was given: by the provider's place id. */
async function clearPlaceImpl(supabase: SupabaseClient, input: { householdId: string; placeId: string }): Promise<void> {
  const { error } = await supabase.from("household_places").delete().eq("household_id", input.householdId).eq("place_id", input.placeId);
  if (error) throw refusal(error, "clearPlace");
}

function refusal(error: { code?: string }, what: string): Error {
  if (error.code === "42501") return ApiError.forbidden("An adult in the household can change its places.");
  return new Error(`${what} failed: ${error.code ?? "unknown"}`);
}

export const markPlace = invalidatesContext(markPlaceImpl, (_supabase, input) => input.householdId);
export const notePlace = invalidatesContext(notePlaceImpl, (_supabase, input) => input.householdId);
export const forgetPlace = invalidatesContext(forgetPlaceImpl, (_supabase, input) => input.householdId);
export const clearPlace = invalidatesContext(clearPlaceImpl, (_supabase, input) => input.householdId);
