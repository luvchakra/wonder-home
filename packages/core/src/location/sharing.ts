import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";

/**
 * Where each family member is, by consent (the owner, 2026-10-20: "show
 * current location of each member here. obviously this is consent based,
 * located in setting of that user, for child, adult controls it").
 *
 * - **Off unless turned on.** An adult (or helper) turns their own on in
 *   Settings; a child's is turned on by their guardian or an Admin in Family.
 * - **The latest position only**, from the member's own device while they
 *   have WonderHome open, rounded to about eleven metres; turning sharing off
 *   deletes it (a database trigger). No history is ever kept.
 * - **Adults see it; children if the sharer chose so.** The household's adults
 *   always read positions; a helper reads only their own. A child reads a
 *   person's position only when that person turned on "let the children see it"
 *   (`visibleToChildren`), off by default. It is never given to a model.
 * - **Said as a place.** Near a place the household saved (home, a school, an
 *   office, the place book) it reads as that place; otherwise as out, with a
 *   map link, and how long ago it was.
 */

export type KnownPlace = { name: string; kind: "home" | "school" | "work" | "place"; latitude: number; longitude: number };
export type MemberLocation = { memberId: string; latitude: number; longitude: number; accuracyM: number | null; recordedAt: Date };
/**
 * Whether a member shares, and with whom. `visibleToChildren` is the sharer's
 * own audience choice (the owner, 2026-10-29): off means only the household's
 * adults see it (the default), on means the children see it too.
 */
export type LocationSharing = { memberId: string; enabled: boolean; visibleToChildren: boolean };

/** Within this many metres of a saved place, a member is said to be there. */
export const AT_PLACE_METRES = 150;
/** A position older than this is "last seen", not "now". */
export const FRESH_MINUTES = 30;

/** Great-circle distance in metres. */
export function metresBetween(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** The saved place a position is at (the nearest within `AT_PLACE_METRES`, allowing for the reading's accuracy), or null. */
export function placeAt(position: { latitude: number; longitude: number; accuracyM?: number | null }, places: readonly KnownPlace[]): KnownPlace | null {
  const reach = AT_PLACE_METRES + Math.min(position.accuracyM ?? 0, 150);
  let best: { place: KnownPlace; metres: number } | null = null;
  for (const place of places) {
    const metres = metresBetween(position, place);
    if (metres <= reach && (!best || metres < best.metres)) best = { place, metres };
  }
  return best?.place ?? null;
}

/** A map link for a position, opened outside the app. */
export function mapLink(position: { latitude: number; longitude: number }): string {
  return `https://www.google.com/maps/search/?api=1&query=${position.latitude.toFixed(4)},${position.longitude.toFixed(4)}`;
}

const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

type Row = Record<string, unknown>;

/** Who shares (and with whom), and the positions the reader may see. Empty, never an error, before the tables exist. */
export async function loadLocations(supabase: SupabaseClient, householdId: string): Promise<{ sharing: LocationSharing[]; locations: MemberLocation[] }> {
  const [sharing, locations] = await Promise.all([
    loadSharing(supabase, householdId),
    supabase.from("member_locations").select("member_id, latitude, longitude, accuracy_m, recorded_at").eq("household_id", householdId).limit(100),
  ]);
  return {
    sharing,
    locations: ((locations.data ?? []) as Row[]).map((row) => ({
      memberId: row.member_id as string,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      accuracyM: row.accuracy_m === null || row.accuracy_m === undefined ? null : Number(row.accuracy_m),
      recordedAt: new Date(row.recorded_at as string),
    })),
  };
}

/**
 * Who shares, and with whom. Reads the audience choice (`visible_to_children`),
 * falling back to adults-only when the column is not there yet — so a deploy
 * is safe before its migration (the owner, 2026-10-29).
 */
async function loadSharing(supabase: SupabaseClient, householdId: string): Promise<LocationSharing[]> {
  const withAudience = await supabase.from("member_location_sharing").select("member_id, enabled, visible_to_children").eq("household_id", householdId).limit(100);
  const rows = withAudience.error
    ? ((await supabase.from("member_location_sharing").select("member_id, enabled").eq("household_id", householdId).limit(100)).data ?? [])
    : (withAudience.data ?? []);
  return (rows as Row[]).map((row) => ({ memberId: row.member_id as string, enabled: Boolean(row.enabled), visibleToChildren: Boolean(row.visible_to_children) }));
}

/** The household's saved places a position can be matched to: home, each school, each office, the place book's saved ones. */
export async function loadKnownPlaces(supabase: SupabaseClient, householdId: string, homeName = "Home"): Promise<KnownPlace[]> {
  const [home, schools, work, book] = await Promise.all([
    supabase.from("household_addresses").select("latitude, longitude").eq("household_id", householdId).maybeSingle(),
    supabase.from("school_enrolments").select("school_name, latitude, longitude").eq("household_id", householdId).not("latitude", "is", null).limit(20),
    supabase.from("member_work_places").select("name, latitude, longitude").eq("household_id", householdId).limit(20),
    supabase.from("household_places").select("name, latitude, longitude").eq("household_id", householdId).eq("status", "saved").not("latitude", "is", null).limit(100),
  ]);
  const places: KnownPlace[] = [];
  const homeRow = home.data as Row | null;
  if (homeRow?.latitude !== null && homeRow?.latitude !== undefined) places.push({ name: homeName, kind: "home", latitude: Number(homeRow.latitude), longitude: Number(homeRow.longitude) });
  for (const row of (schools.data ?? []) as Row[]) places.push({ name: row.school_name as string, kind: "school", latitude: Number(row.latitude), longitude: Number(row.longitude) });
  for (const row of (work.data ?? []) as Row[]) places.push({ name: row.name as string, kind: "work", latitude: Number(row.latitude), longitude: Number(row.longitude) });
  for (const row of (book.data ?? []) as Row[]) places.push({ name: row.name as string, kind: "place", latitude: Number(row.latitude), longitude: Number(row.longitude) });
  return places;
}

/** Turns a member's sharing on or off. RLS decides who may: the adult themselves, or a child's guardian or an Admin. Off deletes the position. */
export async function setLocationSharing(supabase: SupabaseClient, input: { householdId: string; memberId: string; enabled: boolean; setBy: string }): Promise<void> {
  const { error } = await supabase
    .from("member_location_sharing")
    .upsert({ household_id: input.householdId, member_id: input.memberId, enabled: input.enabled, set_by: input.setBy, updated_at: new Date().toISOString() }, { onConflict: "member_id" });
  if (error) {
    if (error.code === "42501") throw new ApiError("forbidden", "Only the person themselves, or a child's guardian or an Admin, can change this.");
    throw new Error(`setLocationSharing failed: ${error.code ?? "unknown"}`);
  }
}

/**
 * Sets a sharer's audience: adults only (the default), or the family's
 * children too (the owner, 2026-10-29). Only meaningful while sharing is on,
 * and only the existing row is touched, so the on/off state is left as it is.
 * RLS decides who may: the sharer themselves, or a child's guardian or Admin —
 * the same rule as turning sharing on.
 */
export async function setLocationAudience(supabase: SupabaseClient, input: { householdId: string; memberId: string; visibleToChildren: boolean; setBy: string }): Promise<void> {
  const { error } = await supabase
    .from("member_location_sharing")
    .update({ visible_to_children: input.visibleToChildren, set_by: input.setBy, updated_at: new Date().toISOString() })
    .eq("household_id", input.householdId)
    .eq("member_id", input.memberId);
  if (error) {
    if (error.code === "42501") throw new ApiError("forbidden", "Only the person themselves, or a child's guardian or an Admin, can change this.");
    throw new Error(`setLocationAudience failed: ${error.code ?? "unknown"}`);
  }
}

/** The member's own device reports where it is; refused (quietly) when their sharing is off. */
export async function reportLocation(supabase: SupabaseClient, input: { householdId: string; memberId: string; latitude: number; longitude: number; accuracyM?: number | null }): Promise<boolean> {
  if (!Number.isFinite(input.latitude) || !Number.isFinite(input.longitude) || Math.abs(input.latitude) > 90 || Math.abs(input.longitude) > 180) return false;
  const { error } = await supabase.from("member_locations").upsert(
    {
      household_id: input.householdId,
      member_id: input.memberId,
      latitude: round4(input.latitude),
      longitude: round4(input.longitude),
      accuracy_m: input.accuracyM === null || input.accuracyM === undefined ? null : Math.min(100_000, Math.max(0, Math.round(input.accuracyM))),
      recorded_at: new Date().toISOString(),
    },
    { onConflict: "member_id" },
  );
  return !error;
}

/** "4 minutes ago", "2 hours ago", "yesterday", in the reader's language. */
export function agoText(language: string, at: Date, now = new Date()): string {
  const minutes = Math.max(0, Math.round((now.getTime() - at.getTime()) / 60_000));
  const format = new Intl.RelativeTimeFormat(language, { numeric: "auto" });
  if (minutes < 60) return format.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return format.format(-hours, "hour");
  return format.format(-Math.round(hours / 24), "day");
}

/** Whether a position is recent enough to say "now" rather than "last seen". */
export function isFresh(at: Date, now = new Date()): boolean {
  return now.getTime() - at.getTime() <= FRESH_MINUTES * 60_000;
}
