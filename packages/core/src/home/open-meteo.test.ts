import { describe, expect, it } from "vitest";

import { createOpenMeteoProvider, roundCoordinate, weatherProviderFromEnv, windowsFromHourly } from "./open-meteo";
import { dryingConditions } from "./weather";

/** Story 17-007: Open-Meteo behind the provider-neutral weather port. */

function hourly(hours: number, from = "2026-09-23T00:00", values: { rain?: (h: number) => number | null; humidity?: number } = {}) {
  const start = Date.parse(`${from}Z`);
  const time = Array.from({ length: hours }, (_, h) => new Date(start + h * 3_600_000).toISOString().slice(0, 16));
  return {
    time,
    precipitation_probability: time.map((_, h) => (values.rain ? values.rain(h) : 10)),
    relative_humidity_2m: time.map(() => values.humidity ?? 50),
    temperature_2m: time.map(() => 30),
  };
}

function fakeFetch(respond: (url: URL) => Response | Promise<Response>) {
  const calls: URL[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    calls.push(url);
    return respond(url);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" }, ...init });

describe("the forecast becomes planning windows", () => {
  it("folds hours into three-hour windows, the wettest hour deciding the rain chance", () => {
    const windows = windowsFromHourly(hourly(6, "2026-09-23T00:00", { rain: (h) => (h === 4 ? 80 : 5), humidity: 60 }));
    expect(windows).toHaveLength(2);
    expect(windows[0]).toMatchObject({ precipitationChance: 0.05, humidity: 0.6, temperatureC: 30 });
    expect(windows[1]!.precipitationChance).toBe(0.8);
    expect(windows[1]!.start.toISOString()).toBe("2026-09-23T03:00:00.000Z");
  });

  it("drops a window the provider left empty rather than calling it dry", () => {
    const windows = windowsFromHourly(hourly(6, "2026-09-23T00:00", { rain: (h) => (h < 3 ? null : 20) }));
    expect(windows.map((window) => window.start.toISOString())).toEqual(["2026-09-23T03:00:00.000Z"]);
  });

  it("a wet afternoon reaches the laundry decision", () => {
    const windows = windowsFromHourly(hourly(12, "2026-09-23T06:00", { rain: (h) => (h > 6 ? 70 : 10), humidity: 85 }));
    expect(dryingConditions(windows).outdoorViable).toBe(false);
  });
});

describe("what leaves WonderHome", () => {
  it("only the area, rounded to about a kilometre, in UTC", async () => {
    const { fetchImpl, calls } = fakeFetch(() => json({ hourly: hourly(48) }));
    const provider = createOpenMeteoProvider({ fetch: fetchImpl });
    await provider.forecast({ locality: "Pune", latitude: 18.519572, longitude: 73.855354, from: new Date("2026-09-23T00:00:00Z"), hours: 24 });
    const url = calls[0]!;
    expect(url.origin).toBe("https://api.open-meteo.com");
    expect(url.searchParams.get("latitude")).toBe("18.52");
    expect(url.searchParams.get("longitude")).toBe("73.86");
    expect(url.searchParams.get("timezone")).toBe("GMT");
    expect([...url.searchParams.keys()].sort()).toEqual(["forecast_days", "hourly", "latitude", "longitude", "timezone"]);
  });

  it("a deployment's key moves every request to the customer endpoint", async () => {
    const { fetchImpl, calls } = fakeFetch((url) => (url.pathname === "/v1/search" ? json({ results: [] }) : json({ hourly: hourly(24) })));
    const provider = createOpenMeteoProvider({ fetch: fetchImpl, apiKey: "k-123" });
    await provider.forecast({ locality: "Pune", latitude: 18.5, longitude: 73.9, from: new Date("2026-09-23T00:00:00Z"), hours: 12 });
    await provider.searchPlaces("Pune");
    expect(calls.map((url) => url.origin)).toEqual(["https://customer-api.open-meteo.com", "https://customer-geocoding-api.open-meteo.com"]);
    expect(calls.every((url) => url.searchParams.get("apikey") === "k-123")).toBe(true);
  });

  it("a locality without coordinates is never guessed at", async () => {
    const { fetchImpl, calls } = fakeFetch(() => json({}));
    const provider = createOpenMeteoProvider({ fetch: fetchImpl });
    await expect(provider.forecast({ locality: "Pune", from: new Date(), hours: 12 })).rejects.toMatchObject({ code: "not_configured", retryable: false });
    expect(calls).toHaveLength(0);
  });

  it("roundCoordinate keeps two decimals", () => {
    expect(roundCoordinate(18.519572)).toBe(18.52);
    expect(roundCoordinate(-0.004)).toBe(-0);
  });
});

describe("finding an area", () => {
  it("returns places a person can tell apart, already rounded", async () => {
    const { fetchImpl } = fakeFetch(() =>
      json({
        results: [
          { name: "Pune", latitude: 18.51957, longitude: 73.85535, country: "India", admin1: "Maharashtra", timezone: "Asia/Kolkata" },
          { name: "Pune", latitude: -9.36944, longitude: 124.31722, country: "Timor-Leste" },
        ],
      }),
    );
    const places = await createOpenMeteoProvider({ fetch: fetchImpl }).searchPlaces("Pune");
    expect(places).toEqual([
      { label: "Pune, Maharashtra, India", latitude: 18.52, longitude: 73.86, timezone: "Asia/Kolkata" },
      { label: "Pune, Timor-Leste", latitude: -9.37, longitude: 124.32, timezone: null },
    ]);
  });

  it("asks nothing for a single letter, and answers an empty result as none", async () => {
    const { fetchImpl, calls } = fakeFetch(() => json({}));
    const provider = createOpenMeteoProvider({ fetch: fetchImpl });
    expect(await provider.searchPlaces("P")).toEqual([]);
    expect(calls).toHaveLength(0);
    expect(await provider.searchPlaces("Nowhereville")).toEqual([]);
  });
});

describe("provider trouble is a contract error, never the provider's prose", () => {
  const forecast = (fetchImpl: typeof fetch) =>
    createOpenMeteoProvider({ fetch: fetchImpl }).forecast({ locality: "Pune", latitude: 18.5, longitude: 73.9, from: new Date(), hours: 12 });

  it("429 is a rate limit that honours Retry-After", async () => {
    const { fetchImpl } = fakeFetch(() => new Response("slow down", { status: 429, headers: { "retry-after": "120" } }));
    await expect(forecast(fetchImpl)).rejects.toMatchObject({ code: "rate_limited", retryable: true, retryAfterSeconds: 120 });
  });

  it("5xx is unavailable and retryable", async () => {
    const { fetchImpl } = fakeFetch(() => new Response("oops", { status: 503 }));
    await expect(forecast(fetchImpl)).rejects.toMatchObject({ code: "unavailable", retryable: true });
  });

  it("a rejected key is unauthorized, not retried", async () => {
    const { fetchImpl } = fakeFetch(() => new Response("no", { status: 403 }));
    await expect(forecast(fetchImpl)).rejects.toMatchObject({ code: "unauthorized", retryable: false });
  });

  it("an answer in the wrong shape is malformed", async () => {
    const { fetchImpl } = fakeFetch(() => json({ hourly: { time: "not a list" } }));
    await expect(forecast(fetchImpl)).rejects.toMatchObject({ code: "malformed" });
  });

  it("a timeout says so", async () => {
    const fetchImpl = (async () => {
      throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
    }) as typeof fetch;
    await expect(forecast(fetchImpl)).rejects.toMatchObject({ code: "timeout", retryable: true });
  });

  it("a network failure is unavailable, and its message never leaks", async () => {
    const fetchImpl = (async () => {
      throw new Error("getaddrinfo ENOTFOUND api.open-meteo.com token=secret");
    }) as typeof fetch;
    const error = await forecast(fetchImpl).catch((thrown) => thrown);
    expect(error).toMatchObject({ code: "unavailable" });
    expect(JSON.stringify(error)).not.toContain("secret");
  });
});

describe("the deployment decides whether weather exists at all", () => {
  it("off unless WONDERHOME_WEATHER_PROVIDER names Open-Meteo", () => {
    expect(weatherProviderFromEnv({})).toBeNull();
    expect(weatherProviderFromEnv({ WONDERHOME_WEATHER_PROVIDER: "somebody-else" })).toBeNull();
    expect(weatherProviderFromEnv({ WONDERHOME_WEATHER_PROVIDER: "open-meteo" })?.name).toBe("open-meteo");
  });
});
