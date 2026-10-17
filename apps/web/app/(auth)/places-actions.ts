"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { createClient } from "@wonderhome/core/db/server";
import { loadHouseholdAddress, removeHouseholdAddress } from "@wonderhome/core/household/address";
import { DEFAULT_PREFERENCES, resolvePreferences } from "@wonderhome/core/i18n/preferences";
import { requireHouseholdAdmin } from "@wonderhome/core/identity/households";
import { placesProviderFromEnv } from "@wonderhome/core/places/google";
import { distanceLabel, PlacesUnavailableError, type PlaceSearchKind } from "@wonderhome/core/places/provider";
import { hitRateLimit, rateLimitMessage } from "@wonderhome/core/security/rate-limit";

import { saveAddressFromForm } from "../_lib/places";
import type { ActionState } from "./actions";

/**
 * Place search for the home address and for schools near home.
 *
 * The browser asks here, never Google: the key stays on the server, every
 * search is an Admin's and is rate limited per member, and a school search
 * leans toward the household's saved home, read here from the database
 * rather than taken from the browser.
 */

export type PlaceOption = { placeId: string; primary: string; secondary: string; distance: string | null };
export type PlaceSearchResult = { options?: PlaceOption[]; error?: string };

const searchSchema = z.object({
  householdId: z.uuid(),
  query: z.string().trim().min(2).max(120),
  kind: z.enum(["address", "school"]),
  sessionToken: z.uuid(),
});

export async function searchPlacesAction(input: { householdId: string; query: string; kind: PlaceSearchKind; sessionToken: string }): Promise<PlaceSearchResult> {
  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) return { options: [] };
  const provider = placesProviderFromEnv();
  if (!provider) return { error: "Search is not available. Type it in instead." };

  try {
    const supabase = await createClient();
    const membership = await requireHouseholdAdmin(supabase, parsed.data.householdId);
    if (!(await hitRateLimit(createAdminClient(), "places.search", membership.memberId))) return { error: rateLimitMessage("places.search") };
    const near = parsed.data.kind === "school" ? ((await loadHouseholdAddress(supabase, parsed.data.householdId).catch(() => null))?.location ?? null) : null;
    const preferences = membership.locale ? resolvePreferences(membership.locale.member, membership.locale.household) : DEFAULT_PREFERENCES;
    const suggestions = await provider.search({
      query: parsed.data.query,
      kind: parsed.data.kind,
      sessionToken: parsed.data.sessionToken,
      near,
      regionCode: preferences.region,
      languageCode: preferences.language,
    });
    return { options: suggestions.map((s) => ({ placeId: s.placeId, primary: s.primary, secondary: s.secondary, distance: distanceLabel(s.distanceMeters) })) };
  } catch (thrown) {
    if (thrown instanceof PlacesUnavailableError) return { error: "Search is not answering right now. Type it in instead, or try again in a minute." };
    return { error: toErrorBody(thrown, "household").body.error.message };
  }
}

const householdSchema = z.uuid();

/** Manage Household → Home address: set or change it. */
export async function setHomeAddressAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const householdId = householdSchema.safeParse(formData.get("householdId"));
  if (!householdId.success) return { error: "Please try again." };
  try {
    const supabase = await createClient();
    const membership = await requireHouseholdAdmin(supabase, householdId.data);
    const result = await saveAddressFromForm(supabase, membership, formData);
    if (result === "empty") return { error: "Search for your address and pick it, or type it in." };
    revalidatePath("/household/address");
    revalidatePath("/household");
    return { notice: "Home address saved." };
  } catch (thrown) {
    if (thrown instanceof PlacesUnavailableError) return { error: "That place could not be read just now. Try again, or type the address in." };
    return { error: toErrorBody(thrown, "household").body.error.message };
  }
}

/** The other half (rule 12): removing it. Schools already picked keep their own address. */
export async function removeHomeAddressAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const householdId = householdSchema.safeParse(formData.get("householdId"));
  if (!householdId.success) return { error: "Please try again." };
  try {
    const supabase = await createClient();
    await requireHouseholdAdmin(supabase, householdId.data);
    await removeHouseholdAddress(supabase, householdId.data);
    revalidatePath("/household/address");
    revalidatePath("/household");
    return { notice: "Home address removed." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "household").body.error.message };
  }
}
