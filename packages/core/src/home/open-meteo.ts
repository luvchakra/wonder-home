import { z } from "zod";

import type { ConnectorError } from "../integrations/connector";
import type { WeatherProvider, WeatherQuery, WeatherWindow } from "./weather";

/**
 * Open-Meteo as WonderHome's weather provider (story 17-007).
 *
 * It sits behind the provider-neutral `WeatherProvider` port from 13-005, so
 * nothing downstream — drying, outdoor work, the agenda — knows or cares which
 * service answered. Replacing it is a new file with the same shape.
 *
 * What leaves WonderHome is the household's area and nothing else: two
 * coordinates rounded to about a kilometre. No name, no address, no member.
 *
 * Open-Meteo's free tier is for non-commercial use; a deployment that serves
 * households commercially sets `OPEN_METEO_API_KEY`, which moves every request
 * to the customer endpoint. Which of the two applies is a decision for whoever
 * runs the deployment, not for this code (`weatherProviderFromEnv`).
 */

export const OPEN_METEO_PROVIDER = "open-meteo";

/** A forecast request answers in well under a second; five is generous and bounded. */
export const WEATHER_TIMEOUT_MS = 5_000;

/** How many hours make one planning window: fine enough for "this afternoon", coarse enough to read. */
export const WINDOW_HOURS = 3;

/** Two decimals is about 1.1 km — enough for weather, never enough to find a house. */
export function roundCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}

export type WeatherPlace = {
  /** "Pune, Maharashtra, India" — the words a person picks from. */
  label: string;
  latitude: number;
  longitude: number;
  timezone: string | null;
};

type Fetch = typeof fetch;

export type OpenMeteoOptions = {
  fetch?: Fetch;
  /** Set for commercial use; moves every request to the customer endpoints. */
  apiKey?: string | null;
  timeoutMs?: number;
};

export type OpenMeteoProvider = WeatherProvider & {
  searchPlaces(name: string): Promise<WeatherPlace[]>;
};

const number = z.number().nullable();

const ForecastSchema = z.object({
  hourly: z.object({
    time: z.array(z.string()),
    precipitation_probability: z.array(number),
    relative_humidity_2m: z.array(number),
    temperature_2m: z.array(number),
  }),
});

const PlacesSchema = z.object({
  results: z
    .array(
      z.object({
        name: z.string(),
        latitude: z.number(),
        longitude: z.number(),
        country: z.string().optional(),
        admin1: z.string().optional(),
        timezone: z.string().optional(),
      }),
    )
    .optional(),
});

export function createOpenMeteoProvider(options: OpenMeteoOptions = {}): OpenMeteoProvider {
  const doFetch = options.fetch ?? fetch;
  const apiKey = options.apiKey?.trim() || null;
  const timeoutMs = options.timeoutMs ?? WEATHER_TIMEOUT_MS;
  const forecastBase = apiKey ? "https://customer-api.open-meteo.com" : "https://api.open-meteo.com";
  const geocodingBase = apiKey ? "https://customer-geocoding-api.open-meteo.com" : "https://geocoding-api.open-meteo.com";

  async function getJson(url: URL): Promise<unknown> {
    if (apiKey) url.searchParams.set("apikey", apiKey);
    let response: Response;
    try {
      response = await doFetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/json" } });
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      throw connectorError(timedOut ? "timeout" : "unavailable");
    }
    if (!response.ok) throw errorForStatus(response);
    try {
      return await response.json();
    } catch {
      throw connectorError("malformed");
    }
  }

  return {
    name: OPEN_METEO_PROVIDER,

    async forecast(query: WeatherQuery): Promise<WeatherWindow[]> {
      if (query.latitude === undefined || query.longitude === undefined) {
        // A locality alone is not enough for this provider, and guessing where
        // a family lives from a word is exactly what this module must not do.
        throw connectorError("not_configured");
      }
      const url = new URL("/v1/forecast", forecastBase);
      url.searchParams.set("latitude", String(roundCoordinate(query.latitude)));
      url.searchParams.set("longitude", String(roundCoordinate(query.longitude)));
      url.searchParams.set("hourly", "precipitation_probability,relative_humidity_2m,temperature_2m");
      // UTC in, UTC out: the household's own timezone is applied where the
      // answer is shown, never by the provider.
      url.searchParams.set("timezone", "GMT");
      url.searchParams.set("forecast_days", String(Math.min(16, Math.max(1, Math.ceil(query.hours / 24) + 1))));

      const parsed = ForecastSchema.safeParse(await getJson(url));
      if (!parsed.success) throw connectorError("malformed");
      const until = new Date(query.from.getTime() + query.hours * 3_600_000);
      return windowsFromHourly(parsed.data.hourly).filter((window) => window.end > query.from && window.start < until);
    },

    async searchPlaces(name: string): Promise<WeatherPlace[]> {
      const term = name.trim();
      if (term.length < 2) return [];
      const url = new URL("/v1/search", geocodingBase);
      url.searchParams.set("name", term.slice(0, 80));
      url.searchParams.set("count", "6");
      url.searchParams.set("language", "en");
      const parsed = PlacesSchema.safeParse(await getJson(url));
      if (!parsed.success) throw connectorError("malformed");
      return (parsed.data.results ?? []).map((result) => ({
        label: [result.name, result.admin1, result.country].filter((part, index, all) => part && all.indexOf(part) === index).join(", "),
        latitude: roundCoordinate(result.latitude),
        longitude: roundCoordinate(result.longitude),
        timezone: result.timezone ?? null,
      }));
    },
  };
}

/**
 * Hourly readings folded into three-hour windows.
 *
 * The wettest hour decides a window's rain chance — a dry average hides the
 * shower that soaks the washing — while humidity and temperature are averaged.
 * An hour the provider left empty is skipped, and a window with no readings at
 * all is dropped rather than reported as dry.
 */
export function windowsFromHourly(hourly: z.infer<typeof ForecastSchema>["hourly"]): WeatherWindow[] {
  const buckets = new Map<number, { rain: number[]; humidity: number[]; temperature: number[] }>();
  hourly.time.forEach((time, index) => {
    const at = Date.parse(time.endsWith("Z") ? time : `${time}Z`);
    if (Number.isNaN(at)) return;
    const start = at - (at % (WINDOW_HOURS * 3_600_000));
    const bucket = buckets.get(start) ?? { rain: [], humidity: [], temperature: [] };
    const rain = hourly.precipitation_probability[index];
    const humidity = hourly.relative_humidity_2m[index];
    const temperature = hourly.temperature_2m[index];
    if (rain != null) bucket.rain.push(rain);
    if (humidity != null) bucket.humidity.push(humidity);
    if (temperature != null) bucket.temperature.push(temperature);
    buckets.set(start, bucket);
  });

  return [...buckets.entries()]
    .filter(([, bucket]) => bucket.rain.length > 0 && bucket.humidity.length > 0)
    .sort(([a], [b]) => a - b)
    .map(([start, bucket]) => ({
      start: new Date(start),
      end: new Date(start + WINDOW_HOURS * 3_600_000),
      precipitationChance: Math.max(...bucket.rain) / 100,
      humidity: average(bucket.humidity) / 100,
      temperatureC: bucket.temperature.length > 0 ? Math.round(average(bucket.temperature) * 10) / 10 : 0,
    }));
}

function average(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function errorForStatus(response: Response): ConnectorError {
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("retry-after"));
    return { ...connectorError("rate_limited"), ...(Number.isFinite(retryAfter) && retryAfter > 0 ? { retryAfterSeconds: retryAfter } : {}) };
  }
  if (response.status === 401 || response.status === 403) return connectorError("unauthorized");
  if (response.status >= 500) return connectorError("unavailable");
  return connectorError("malformed");
}

const MESSAGES: Record<ConnectorError["code"], string> = {
  unauthorized: "The weather service refused this deployment's key.",
  revoked: "Weather has been switched off.",
  rate_limited: "The weather service asked us to slow down; the forecast will refresh shortly.",
  unavailable: "The weather service is not answering right now.",
  timeout: "The weather service took too long to answer.",
  malformed: "The weather service sent something we could not read.",
  not_configured: "No area is set for weather yet.",
};

export function connectorError(code: ConnectorError["code"]): ConnectorError {
  return {
    code,
    retryable: code === "rate_limited" || code === "unavailable" || code === "timeout",
    message: MESSAGES[code],
  };
}

/**
 * The deployment's weather provider, or none.
 *
 * Off unless `WONDERHOME_WEATHER_PROVIDER` names Open-Meteo: a household is
 * never told weather is working because a default quietly reached a public
 * endpoint nobody decided to use.
 */
export function weatherProviderFromEnv(
  env: Record<string, string | undefined> = process.env,
  fetchImpl?: Fetch,
): OpenMeteoProvider | null {
  if (env.WONDERHOME_WEATHER_PROVIDER?.trim().toLowerCase() !== OPEN_METEO_PROVIDER) return null;
  return createOpenMeteoProvider({ apiKey: env.OPEN_METEO_API_KEY ?? null, fetch: fetchImpl });
}
