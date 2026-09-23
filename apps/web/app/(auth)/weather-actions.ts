"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { createClient } from "@wonderhome/core/db/server";
import { weatherProviderFromEnv, type WeatherPlace } from "@wonderhome/core/home/open-meteo";
import { removeWeatherLocation, setWeatherLocation } from "@wonderhome/core/home/weather-service";
import { requireHouseholdAdmin } from "@wonderhome/core/identity/households";
import { hitRateLimit, rateLimitMessage } from "@wonderhome/core/security/rate-limit";

import type { ActionState } from "./actions";

/**
 * Choosing where the household's weather comes from (story 17-007).
 *
 * Every action re-checks that the caller is an Admin: what leaves the
 * household is an Admin's decision, and a hidden form is not a permission.
 * The entitlement is checked again inside `setWeatherLocation`, so neither
 * this screen nor a direct call can turn weather on for a plan without it.
 */

export type WeatherSearchState = { places?: WeatherPlace[]; error?: string };

const searchSchema = z.object({ householdId: z.uuid(), query: z.string().trim().min(2).max(80) });

export async function searchWeatherPlacesAction(householdId: string, query: string): Promise<WeatherSearchState> {
  const parsed = searchSchema.safeParse({ householdId, query });
  if (!parsed.success) return { error: "Type at least two letters of your town or city." };

  const provider = weatherProviderFromEnv();
  if (!provider) return { error: "Weather is not switched on for this deployment." };

  try {
    const supabase = await createClient();
    const membership = await requireHouseholdAdmin(supabase, parsed.data.householdId);
    if (!(await hitRateLimit(createAdminClient(), "weather.search", membership.memberId))) return { error: rateLimitMessage("weather.search") };
    const places = await provider.searchPlaces(parsed.data.query);
    return places.length > 0 ? { places } : { error: `Nothing called "${parsed.data.query}" was found. Try the nearest town or city.` };
  } catch (thrown) {
    if (typeof thrown === "object" && thrown !== null && "retryable" in thrown) {
      return { error: "The weather service is not answering right now. Try again in a minute." };
    }
    return { error: toErrorBody(thrown, "weather").body.error.message };
  }
}

const areaSchema = z.object({
  householdId: z.uuid(),
  label: z.string().trim().min(1).max(160),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  timezone: z.string().trim().max(64).optional().transform((value) => value || null),
});

export async function setWeatherAreaAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = areaSchema.safeParse({
    householdId: formData.get("householdId"),
    label: formData.get("label"),
    latitude: formData.get("latitude"),
    longitude: formData.get("longitude"),
    timezone: formData.get("timezone") ?? undefined,
  });
  if (!parsed.success) return { error: "Pick one of the places found." };

  try {
    const supabase = await createClient();
    const membership = await requireHouseholdAdmin(supabase, parsed.data.householdId);
    const weather = await setWeatherLocation(supabase, {
      householdId: parsed.data.householdId,
      memberId: membership.memberId,
      place: { label: parsed.data.label, latitude: parsed.data.latitude, longitude: parsed.data.longitude, timezone: parsed.data.timezone },
    });
    revalidatePath("/household/integrations");
    revalidatePath("/household/home");
    return weather.state === "ready"
      ? { notice: `Weather is on for ${parsed.data.label}. Laundry and outdoor jobs now plan around it.` }
      : { notice: `Saved ${parsed.data.label}. The weather service did not answer yet — WonderHome will try again and plans for ordinary weather meanwhile.` };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "weather").body.error.message };
  }
}

export async function removeWeatherAreaAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const householdId = z.uuid().safeParse(formData.get("householdId"));
  if (!householdId.success) return { error: "That could not be read. Please try again." };

  try {
    const supabase = await createClient();
    const membership = await requireHouseholdAdmin(supabase, householdId.data);
    await removeWeatherLocation(supabase, { householdId: householdId.data, memberId: membership.memberId });
    revalidatePath("/household/integrations");
    revalidatePath("/household/home");
    return { notice: "Weather is off. Your area was removed, and planning assumes ordinary weather." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "weather").body.error.message };
  }
}
