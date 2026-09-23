import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import { may } from "../billing/repository";
import { createAdminClient } from "../db/admin";
import { toConnectorError, type ConnectionState, type ConnectorError } from "../integrations/connector";
import { connectIntegration, disconnectIntegration, recordSyncOutcome } from "../integrations/repository";
import { OPEN_METEO_PROVIDER, roundCoordinate, weatherProviderFromEnv, type WeatherPlace } from "./open-meteo";
import { checkWeatherAccess, dryingConditions, type WeatherProvider, type WeatherWindow } from "./weather";

/**
 * Weather for one household, end to end (story 17-007).
 *
 * The order of the gates is the point: a deployment with no provider, a
 * household that never chose an area, and a plan without weather each answer
 * "off" before anything leaves WonderHome — and the entitlement is decided
 * here, on the server path, so a direct API call gets exactly the answer the
 * screen does.
 *
 * A forecast is fetched at most once an hour per household and kept on the
 * household's own row. A provider outage never touches that row: the last
 * good forecast keeps serving for a few hours, then the answer honestly
 * becomes "unavailable" and planning falls back to ordinary conditions.
 */

export const WEATHER_SCOPES = ["forecast.read"] as const;

/** A forecast younger than this is used as is. */
export const FORECAST_FRESH_MS = 60 * 60_000;
/** A forecast older than this is not a forecast any more. */
export const FORECAST_STALE_MS = 6 * 60 * 60_000;
/** How far ahead a fetch reaches: tomorrow's washing is planned tonight. */
export const FORECAST_HOURS = 48;

export type WeatherLocation = {
  label: string;
  latitude: number;
  longitude: number;
  timezone: string | null;
  consentedAt: Date;
  forecast: WeatherWindow[] | null;
  forecastFetchedAt: Date | null;
};

export type HouseholdWeather =
  | { state: "off"; reason: "no_provider" | "no_area" | "not_entitled" }
  | { state: "ready"; place: string; windows: WeatherWindow[]; fetchedAt: Date; stale: boolean }
  | { state: "unavailable"; place: string; error: ConnectorError };

type Row = Record<string, unknown>;

export async function loadWeatherLocation(supabase: SupabaseClient, householdId: string): Promise<WeatherLocation | null> {
  const { data, error } = await supabase
    .from("weather_locations")
    .select("label, latitude, longitude, timezone, consented_at, forecast, forecast_fetched_at")
    .eq("household_id", householdId)
    .maybeSingle();
  if (error) throw new Error(`loadWeatherLocation failed: ${error.code ?? "unknown"}`);
  if (!data) return null;
  const row = data as Row;
  return {
    label: row.label as string,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    timezone: (row.timezone as string | null) ?? null,
    consentedAt: new Date(row.consented_at as string),
    forecast: parseWindows(row.forecast),
    forecastFetchedAt: row.forecast_fetched_at ? new Date(row.forecast_fetched_at as string) : null,
  };
}

/**
 * An Admin chooses the area (and, by choosing it, consents to it leaving).
 *
 * Only the rounded coordinates are stored, whatever precision the caller
 * sent. The connection is recorded like any other integration, and the first
 * forecast is fetched straight away so the household sees at once whether it
 * works.
 */
export async function setWeatherLocation(
  supabase: SupabaseClient,
  input: { householdId: string; memberId: string; place: WeatherPlace; provider?: WeatherProvider | null; now?: Date },
): Promise<HouseholdWeather> {
  const provider = input.provider !== undefined ? input.provider : weatherProviderFromEnv();
  if (!provider) throw ApiError.conflict("Weather is not switched on for this deployment.");

  const entitlement = await may(supabase, input.householdId, "home.weather", input.now);
  const access = checkWeatherAccess({ entitlement, provider });
  if (!access.allowed) throw ApiError.forbidden(access.reason);

  const label = input.place.label.trim().slice(0, 160);
  if (!label) throw ApiError.badRequest("Pick an area.");

  const { error } = await supabase.from("weather_locations").upsert(
    {
      household_id: input.householdId,
      label,
      latitude: roundCoordinate(input.place.latitude),
      longitude: roundCoordinate(input.place.longitude),
      timezone: input.place.timezone,
      set_by_member_id: input.memberId,
      consented_at: (input.now ?? new Date()).toISOString(),
      // A new area makes the old forecast somebody else's weather.
      forecast: null,
      forecast_fetched_at: null,
    },
    { onConflict: "household_id" },
  );
  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only an Admin can choose where weather comes from.");
    throw new Error(`setWeatherLocation failed: ${error.code ?? "unknown"}`);
  }

  await connectIntegration(supabase, {
    householdId: input.householdId,
    kind: "weather",
    provider: provider.name,
    scopes: WEATHER_SCOPES,
    actorMemberId: input.memberId,
  });

  return householdWeather(supabase, input.householdId, { provider, now: input.now });
}

/** Weather off (rule 12's "remove"): the area and the cached forecast go, and so does the connection. */
export async function removeWeatherLocation(
  supabase: SupabaseClient,
  input: { householdId: string; memberId: string },
): Promise<void> {
  const { error } = await supabase.from("weather_locations").delete().eq("household_id", input.householdId);
  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only an Admin can switch weather off.");
    throw new Error(`removeWeatherLocation failed: ${error.code ?? "unknown"}`);
  }
  await disconnectIntegration(supabase, {
    householdId: input.householdId,
    kind: "weather",
    provider: OPEN_METEO_PROVIDER,
    actorMemberId: input.memberId,
  });
}

/**
 * The household's weather right now, or why there is none.
 *
 * Never throws: weather is a signal that sharpens a plan, and its absence is
 * an ordinary state that every caller already knows how to plan without.
 */
export async function householdWeather(
  supabase: SupabaseClient,
  householdId: string,
  options: { now?: Date; provider?: WeatherProvider | null; writer?: SupabaseClient | null; hours?: number } = {},
): Promise<HouseholdWeather> {
  const now = options.now ?? new Date();
  const provider = options.provider !== undefined ? options.provider : weatherProviderFromEnv();
  if (!provider) return { state: "off", reason: "no_provider" };

  let location: WeatherLocation | null;
  try {
    location = await loadWeatherLocation(supabase, householdId);
  } catch {
    return { state: "off", reason: "no_area" };
  }
  if (!location) return { state: "off", reason: "no_area" };

  try {
    const access = checkWeatherAccess({ entitlement: await may(supabase, householdId, "home.weather", now), provider });
    if (!access.allowed) return { state: "off", reason: "not_entitled" };
  } catch {
    return { state: "off", reason: "not_entitled" };
  }

  const ahead = (windows: readonly WeatherWindow[]) => windowsAhead(windows, now, options.hours ?? 24);
  const cached = location.forecast && location.forecastFetchedAt ? { windows: location.forecast, at: location.forecastFetchedAt } : null;
  if (cached && now.getTime() - cached.at.getTime() < FORECAST_FRESH_MS) {
    return { state: "ready", place: location.label, windows: ahead(cached.windows), fetchedAt: cached.at, stale: false };
  }

  const writer = options.writer !== undefined ? options.writer : adminClientOrNull();
  try {
    const windows = await provider.forecast({
      locality: location.label,
      latitude: location.latitude,
      longitude: location.longitude,
      from: startOfHour(now),
      hours: FORECAST_HOURS,
    });
    if (writer) {
      await writer
        .from("weather_locations")
        .update({ forecast: windows.map(serializeWindow), forecast_fetched_at: now.toISOString() })
        .eq("household_id", householdId);
      await recordOutcome(writer, householdId, provider.name, { ok: true, partialFailures: [] }, now);
    }
    return { state: "ready", place: location.label, windows: ahead(windows), fetchedAt: now, stale: false };
  } catch (thrown) {
    const error = toConnectorError(thrown);
    // The outage is recorded on the connection and nowhere else: the cached
    // forecast and everything planned from it stay exactly as they were.
    if (writer) await recordOutcome(writer, householdId, provider.name, { ok: false, error }, now).catch(() => undefined);
    if (cached && now.getTime() - cached.at.getTime() < FORECAST_STALE_MS) {
      return { state: "ready", place: location.label, windows: ahead(cached.windows), fetchedAt: cached.at, stale: true };
    }
    return { state: "unavailable", place: location.label, error };
  }
}

/**
 * What the weather means for the household, in one sentence, or nothing.
 *
 * Said in terms of a decision (drying, outdoor work), never as a forecast
 * readout: a family has a phone for that.
 */
export function describeHouseholdWeather(weather: HouseholdWeather): string | null {
  switch (weather.state) {
    case "off":
      return null;
    case "unavailable":
      return `${weather.error.message} Until it answers, plans assume ordinary weather.`;
    case "ready": {
      if (weather.windows.length === 0) return "No forecast covers the next day yet; plans assume ordinary weather.";
      const reason = dryingConditions(weather.windows).reason;
      return weather.stale ? `${reason} (From the last forecast — the weather service is not answering right now.)` : reason;
    }
  }
}

/** The windows that overlap the next `hours` from `now`. */
export function windowsAhead(windows: readonly WeatherWindow[], now: Date, hours: number): WeatherWindow[] {
  const until = now.getTime() + hours * 3_600_000;
  return windows.filter((window) => window.end.getTime() > now.getTime() && window.start.getTime() < until);
}

/** What the forecast row holds, read back defensively: anything unreadable is no forecast. */
export function parseWindows(value: unknown): WeatherWindow[] | null {
  if (!Array.isArray(value)) return null;
  const windows: WeatherWindow[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Row;
    const start = new Date(String(row.start));
    const end = new Date(String(row.end));
    const numbers = [row.precipitationChance, row.humidity, row.temperatureC].map(Number);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || numbers.some(Number.isNaN)) continue;
    windows.push({ start, end, precipitationChance: numbers[0]!, humidity: numbers[1]!, temperatureC: numbers[2]! });
  }
  return windows;
}

function serializeWindow(window: WeatherWindow) {
  return {
    start: window.start.toISOString(),
    end: window.end.toISOString(),
    precipitationChance: window.precipitationChance,
    humidity: window.humidity,
    temperatureC: window.temperatureC,
  };
}

function startOfHour(now: Date): Date {
  return new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000);
}

function adminClientOrNull(): SupabaseClient | null {
  try {
    return createAdminClient();
  } catch {
    // No service key (a test, a preview without secrets): still answer, just
    // without keeping the forecast for the next reader.
    return null;
  }
}

async function recordOutcome(
  writer: SupabaseClient,
  householdId: string,
  provider: string,
  outcome: Parameters<typeof recordSyncOutcome>[3],
  now: Date,
): Promise<void> {
  const { data } = await writer
    .from("integrations")
    .select("id, status, consecutive_failures, last_error_code")
    .eq("household_id", householdId)
    .eq("kind", "weather")
    .eq("provider", provider)
    .maybeSingle();
  if (!data) return;
  const row = data as Row;
  const state: ConnectionState = {
    status: row.status as ConnectionState["status"],
    consecutiveFailures: Number(row.consecutive_failures ?? 0),
    lastErrorCode: (row.last_error_code as string | null) ?? null,
  };
  await recordSyncOutcome(writer, row.id as string, state, outcome, now);
}
