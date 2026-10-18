import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import { invalidatesContext } from "../context/invalidation";
import type { LatLng, Place } from "../places/provider";

/**
 * Where an adult works (`member_work_places`, HomePlaces story 24-005).
 *
 * Always a place picked from the search and re-read on the server, so it
 * carries a point HomePlaces can search near ("somewhere for lunch near my
 * office"). The person, adults and Admins read it; a child or a househelper
 * gets nothing (RLS). The person sets their own, an Admin any adult's.
 */

export type WorkPlace = {
  memberId: string;
  placeId: string;
  name: string;
  address: string | null;
  location: LatLng;
};

type Row = { member_id: string; place_id: string; name: string; address: string | null; latitude: number | string; longitude: number | string };

function toWorkPlace(row: Row): WorkPlace | null {
  const latitude = Number(row.latitude);
  const longitude = Number(row.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { memberId: row.member_id, placeId: row.place_id, name: row.name, address: row.address, location: { latitude, longitude } };
}

/** Every office this person may see in the household: their own, or everyone's for an adult. */
export async function listWorkPlaces(supabase: SupabaseClient, householdId: string): Promise<WorkPlace[]> {
  const { data, error } = await supabase
    .from("member_work_places")
    .select("member_id, place_id, name, address, latitude, longitude")
    .eq("household_id", householdId);
  if (error) throw new Error(`listWorkPlaces failed: ${error.code ?? "unknown"}`);
  return ((data as Row[] | null) ?? []).flatMap((row) => toWorkPlace(row) ?? []);
}

export async function loadWorkPlace(supabase: SupabaseClient, householdId: string, memberId: string): Promise<WorkPlace | null> {
  const { data, error } = await supabase
    .from("member_work_places")
    .select("member_id, place_id, name, address, latitude, longitude")
    .eq("household_id", householdId)
    .eq("member_id", memberId)
    .maybeSingle();
  if (error) throw new Error(`loadWorkPlace failed: ${error.code ?? "unknown"}`);
  return data ? toWorkPlace(data as Row) : null;
}

const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

async function saveWorkPlaceImpl(
  supabase: SupabaseClient,
  input: { householdId: string; memberId: string; setByMemberId: string; place: Place },
): Promise<void> {
  const { error } = await supabase.from("member_work_places").upsert(
    {
      member_id: input.memberId,
      household_id: input.householdId,
      place_id: input.place.placeId,
      name: (input.place.name || input.place.formattedAddress).trim().slice(0, 200),
      address: input.place.formattedAddress.trim().slice(0, 300) || null,
      latitude: round6(input.place.latitude),
      longitude: round6(input.place.longitude),
      set_by_member_id: input.setByMemberId,
    },
    { onConflict: "member_id" },
  );
  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only the person, or an Admin, can set where an adult works.");
    throw new Error(`saveWorkPlace failed: ${error.code ?? "unknown"}`);
  }
}

async function removeWorkPlaceImpl(supabase: SupabaseClient, input: { householdId: string; memberId: string }): Promise<void> {
  const { error } = await supabase.from("member_work_places").delete().eq("household_id", input.householdId).eq("member_id", input.memberId);
  if (error) throw new Error(`removeWorkPlace failed: ${error.code ?? "unknown"}`);
}

export const saveWorkPlace = invalidatesContext(saveWorkPlaceImpl, (_s, input) => input.householdId);
export const removeWorkPlace = invalidatesContext(removeWorkPlaceImpl, (_s, input) => input.householdId);
