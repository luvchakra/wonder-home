import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { loadHouseholdAddress, saveHouseholdAddress } from "@wonderhome/core/household/address";
import { loadWorkPlace, removeWorkPlace, saveWorkPlace } from "@wonderhome/core/household/work-place";
import { DEFAULT_PREFERENCES, resolvePreferences } from "@wonderhome/core/i18n/preferences";
import type { HouseholdMembership } from "@wonderhome/core/identity/schemas";
import { placesProviderFromEnv } from "@wonderhome/core/places/google";
import { PlacesUnavailableError, type Place } from "@wonderhome/core/places/provider";
import { endEnrolments, listEnrolments, saveEnrolment } from "@wonderhome/core/school/enrolments";

/**
 * Server-side halves of the place pickers, kept out of the "use server"
 * action files so none of them is callable from a browser on its own.
 */

/** Whether this deployment has a place search; without one, screens offer a plain field. */
export function placeSearchAvailable(): boolean {
  return placesProviderFromEnv() !== null;
}

function preferencesOf(membership: HouseholdMembership) {
  return membership.locale ? resolvePreferences(membership.locale.member, membership.locale.household) : DEFAULT_PREFERENCES;
}

const placeIdSchema = z.string().trim().min(1).max(300).regex(/^[A-Za-z0-9_-]+$/);

/**
 * The place someone picked, read again from the provider by its id. The
 * browser never supplies an address or coordinates; null when nothing was
 * picked or the provider is off.
 */
export async function pickedPlace(membership: HouseholdMembership, placeId: unknown, sessionToken: unknown): Promise<Place | null> {
  const id = placeIdSchema.safeParse(placeId);
  if (!id.success) return null;
  const provider = placesProviderFromEnv();
  if (!provider) return null;
  const token = z.uuid().safeParse(sessionToken);
  return provider.details(id.data, { sessionToken: token.success ? token.data : null, languageCode: preferencesOf(membership).language });
}

/** Saves the home address from a form: a picked place when there is one, else the typed line. Unchanged picks cost nothing. */
export async function saveAddressFromForm(
  supabase: SupabaseClient,
  membership: HouseholdMembership,
  formData: FormData,
): Promise<"saved" | "unchanged" | "empty"> {
  const placeId = String(formData.get("home_place_id") ?? "").trim();
  const typed = String(formData.get("home_address") ?? "").trim().slice(0, 300);
  const householdId = membership.household.id;
  const current = await loadHouseholdAddress(supabase, householdId).catch(() => null);
  if (placeId) {
    if (current?.placeId === placeId) return "unchanged";
    const place = await pickedPlace(membership, placeId, formData.get("places_session"));
    if (!place) throw new PlacesUnavailableError("unavailable");
    await saveHouseholdAddress(supabase, { householdId, memberId: membership.memberId, address: { place } });
    return "saved";
  }
  if (!typed) return "empty";
  if (current && current.formattedAddress === typed) return "unchanged";
  await saveHouseholdAddress(supabase, { householdId, memberId: membership.memberId, address: { typed } });
  return "saved";
}

/**
 * Saves an adult's office from the member details form (story 24-005): a
 * picked place, re-read on the server, or nothing to remove it. A typed name
 * with no pick is refused, because HomePlaces needs the point, not the words.
 * Untouched when the form carried no office field.
 */
export async function saveWorkPlaceFromForm(
  supabase: SupabaseClient,
  actor: HouseholdMembership,
  memberId: string,
  formData: FormData,
): Promise<"saved" | "removed" | "unchanged" | "untouched" | "typed"> {
  if (formData.get("officeField") !== "1") return "untouched";
  const householdId = actor.household.id;
  const placeId = String(formData.get("office_place_id") ?? "").trim();
  const typed = String(formData.get("office_name") ?? "").trim();
  const current = await loadWorkPlace(supabase, householdId, memberId).catch(() => null);
  if (!placeId) {
    if (typed) return "typed";
    if (!current) return "unchanged";
    await removeWorkPlace(supabase, { householdId, memberId });
    return "removed";
  }
  if (current?.placeId === placeId) return "unchanged";
  const place = await pickedPlace(actor, placeId, formData.get("office_session"));
  if (!place) throw new PlacesUnavailableError("unavailable");
  await saveWorkPlace(supabase, { householdId, memberId, setByMemberId: actor.memberId, place });
  return "saved";
}

/**
 * Saves a child's school from their details in Family (story 24-010), the
 * same way setup does: a picked place, re-read on the server, or the typed
 * name when there is no pick; nothing at all ends the school on record.
 * Untouched when the form carried no school field.
 */
export async function saveSchoolFromForm(
  supabase: SupabaseClient,
  actor: HouseholdMembership,
  childMemberId: string,
  formData: FormData,
): Promise<"saved" | "removed" | "unchanged" | "untouched"> {
  if (formData.get("schoolField") !== "1") return "untouched";
  const householdId = actor.household.id;
  // Only a child has a school: a field sent for anyone else changes nothing.
  const { data: member } = await supabase.from("household_members").select("member_type").eq("household_id", householdId).eq("id", childMemberId).maybeSingle();
  if ((member as { member_type?: string } | null)?.member_type !== "child") return "untouched";
  const placeId = String(formData.get("school_place_id") ?? "").trim();
  const typed = String(formData.get("school_name") ?? "").trim().slice(0, 120);
  // The class and section, when the form carried them ("5B"); left alone otherwise.
  const grade = formData.has("grade") ? String(formData.get("grade") ?? "").trim().slice(0, 40) || null : undefined;
  const current = (await listEnrolments(supabase, householdId).catch(() => [])).find((entry) => entry.childMemberId === childMemberId) ?? null;
  const keep = { ...(current?.hours ? { hours: current.hours } : {}), ...(grade !== undefined ? { grade } : {}) };
  const gradeChanged = grade !== undefined && (current?.grade ?? null) !== grade;
  if (placeId) {
    if (current?.placeId === placeId) {
      if (!gradeChanged) return "unchanged";
      await saveEnrolment(supabase, { householdId, childMemberId, schoolName: current.schoolName, grade });
      return "saved";
    }
    const place = await pickedPlace(actor, placeId, formData.get("school_session"));
    if (!place) throw new PlacesUnavailableError("unavailable");
    await saveEnrolment(supabase, { householdId, childMemberId, schoolName: place.name, place, only: true, ...keep });
    return "saved";
  }
  if (!typed) {
    if (!current) return "unchanged";
    await endEnrolments(supabase, { householdId, childMemberId });
    return "removed";
  }
  if (current && current.schoolName === typed) {
    if (!gradeChanged) return "unchanged";
    await saveEnrolment(supabase, { householdId, childMemberId, schoolName: typed, grade });
    return "saved";
  }
  await saveEnrolment(supabase, { householdId, childMemberId, schoolName: typed, place: null, only: true, ...keep });
  return "saved";
}

/**
 * A small map of the saved home, as a data URL the page carries inline. The
 * server fetches it with the key, so neither the key nor a third-party image
 * origin ever reaches the browser. Null when there is no search provider, no
 * point to show, or the map service does not answer: the page then shows
 * the address and the "Open in Google Maps" link alone.
 */
export async function homeMapImage(location: { latitude: number; longitude: number } | null): Promise<string | null> {
  const provider = placesProviderFromEnv();
  if (!provider?.staticMap || !location) return null;
  try {
    const image = await provider.staticMap(location, { width: 480, height: 200, zoom: 15 });
    if (!image || image.body.byteLength > 400_000) return null;
    return `data:${image.contentType};base64,${Buffer.from(image.body).toString("base64")}`;
  } catch {
    return null;
  }
}
