import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { connectorError } from "./open-meteo";
import {
  describeHouseholdWeather,
  FORECAST_FRESH_MS,
  householdWeather,
  parseWindows,
  windowsAhead,
} from "./weather-service";
import type { WeatherProvider, WeatherWindow } from "./weather";

/** Story 17-007: the gates, the cache and the outage path around one household's weather. */

const NOW = new Date("2026-09-23T06:00:00Z");
let household = 0;

type Tables = Record<string, unknown[]>;

/** Just enough of a Supabase client: reads answer from `tables`, writes are recorded. */
function fakeSupabase(tables: Tables) {
  const writes: { table: string; op: string; values: unknown }[] = [];
  const client = {
    from(table: string) {
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        maybeSingle: async () => ({ data: (tables[table] ?? [])[0] ?? null, error: null }),
        update(values: unknown) {
          writes.push({ table, op: "update", values });
          return { eq: () => ({ eq: async () => ({ error: null }), then: (resolve: (value: unknown) => void) => resolve({ error: null }) }) };
        },
        then(resolve: (value: unknown) => void) {
          resolve({ data: tables[table] ?? [], error: null });
        },
      };
      return chain;
    },
  };
  return { client: client as unknown as SupabaseClient, writes };
}

const window = (hoursFromNow: number, rain: number): WeatherWindow => ({
  start: new Date(NOW.getTime() + hoursFromNow * 3_600_000),
  end: new Date(NOW.getTime() + (hoursFromNow + 3) * 3_600_000),
  precipitationChance: rain,
  humidity: 0.6,
  temperatureC: 29,
});

const serialized = (w: WeatherWindow) => ({ ...w, start: w.start.toISOString(), end: w.end.toISOString() });

function provider(windows: WeatherWindow[] | Error | object): WeatherProvider & { calls: number } {
  const result = {
    name: "open-meteo",
    calls: 0,
    async forecast() {
      result.calls += 1;
      if (!Array.isArray(windows)) throw windows;
      return windows;
    },
  };
  return result;
}

function tables(over: { plan?: boolean; location?: Record<string, unknown> | null } = {}): Tables {
  return {
    household_subscriptions: [{ plan_key: "pro", status: "active", current_period_start: "2026-09-01T00:00:00Z" }],
    plan_features: [{ feature_key: "home.weather", enabled: over.plan ?? true, limit_per_period: null, period: "forever" }],
    weather_locations:
      over.location === null
        ? []
        : [{ label: "Pune, Maharashtra, India", latitude: "18.52", longitude: "73.86", timezone: "Asia/Kolkata", consented_at: "2026-09-20T00:00:00Z", forecast: null, forecast_fetched_at: null, ...over.location }],
    integrations: [{ id: "i-1", status: "connecting", consecutive_failures: 0, last_error_code: null }],
  };
}

const id = () => `00000000-0000-4000-8000-${String(++household).padStart(12, "0")}`;

describe("the gates, in order, before anything leaves", () => {
  it("no provider for this deployment is off, without reading anything", async () => {
    const db = fakeSupabase(tables());
    expect(await householdWeather(db.client, id(), { now: NOW, provider: null })).toEqual({ state: "off", reason: "no_provider" });
  });

  it("no area chosen is off, and the provider is never asked", async () => {
    const p = provider([window(0, 0.1)]);
    const db = fakeSupabase(tables({ location: null }));
    expect(await householdWeather(db.client, id(), { now: NOW, provider: p, writer: null })).toEqual({ state: "off", reason: "no_area" });
    expect(p.calls).toBe(0);
  });

  it("a plan without weather is off even with an area set — the server decides, not the screen", async () => {
    const p = provider([window(0, 0.1)]);
    const db = fakeSupabase(tables({ plan: false }));
    expect(await householdWeather(db.client, id(), { now: NOW, provider: p, writer: null })).toEqual({ state: "off", reason: "not_entitled" });
    expect(p.calls).toBe(0);
  });
});

describe("one fetch an hour, kept on the household's row", () => {
  it("a fresh forecast is used as is", async () => {
    const p = provider([]);
    const db = fakeSupabase(tables({ location: { forecast: [serialized(window(0, 0.7))], forecast_fetched_at: new Date(NOW.getTime() - FORECAST_FRESH_MS / 2).toISOString() } }));
    const weather = await householdWeather(db.client, id(), { now: NOW, provider: p, writer: null });
    expect(weather).toMatchObject({ state: "ready", place: "Pune, Maharashtra, India", stale: false });
    expect(p.calls).toBe(0);
  });

  it("an old forecast is fetched again, stored, and the connection marked working", async () => {
    const p = provider([window(0, 0.2), window(3, 0.1)]);
    const db = fakeSupabase(tables());
    const writer = fakeSupabase(tables());
    const weather = await householdWeather(db.client, id(), { now: NOW, provider: p, writer: writer.client });
    expect(weather).toMatchObject({ state: "ready", stale: false });
    expect(p.calls).toBe(1);
    const stored = writer.writes.find((write) => write.table === "weather_locations")?.values as { forecast: unknown[] };
    expect(stored.forecast).toHaveLength(2);
    expect(writer.writes.find((write) => write.table === "integrations")?.values).toMatchObject({ status: "connected", consecutive_failures: 0 });
  });
});

describe("an outage never becomes the household's weather", () => {
  it("serves the last forecast for a few hours, and says it is the last one", async () => {
    const p = provider(connectorError("unavailable"));
    const db = fakeSupabase(tables({ location: { forecast: [serialized(window(0, 0.8))], forecast_fetched_at: new Date(NOW.getTime() - 2 * 3_600_000).toISOString() } }));
    const writer = fakeSupabase(tables());
    const weather = await householdWeather(db.client, id(), { now: NOW, provider: p, writer: writer.client });
    expect(weather).toMatchObject({ state: "ready", stale: true });
    // The forecast row is not touched; only the connection's health is.
    expect(writer.writes.some((write) => write.table === "weather_locations")).toBe(false);
    expect(writer.writes.find((write) => write.table === "integrations")?.values).toMatchObject({ status: "degraded", last_error_code: "unavailable" });
    expect(describeHouseholdWeather(weather)).toMatch(/last forecast/);
  });

  it("with nothing recent to fall back on, it is unavailable and plans assume ordinary weather", async () => {
    const p = provider(connectorError("timeout"));
    const db = fakeSupabase(tables());
    const weather = await householdWeather(db.client, id(), { now: NOW, provider: p, writer: null });
    expect(weather).toMatchObject({ state: "unavailable", error: { code: "timeout" } });
    expect(describeHouseholdWeather(weather)).toMatch(/ordinary weather/);
  });

  it("a provider that throws something foreign is unavailable, with nothing of its message kept", async () => {
    const p = provider(new Error("socket hang up key=abc"));
    const weather = await householdWeather(fakeSupabase(tables()).client, id(), { now: NOW, provider: p, writer: null });
    expect(weather.state).toBe("unavailable");
    expect(JSON.stringify(weather)).not.toContain("abc");
  });
});

describe("reading back what was stored", () => {
  it("parseWindows skips anything unreadable instead of inventing weather", () => {
    const parsed = parseWindows([serialized(window(0, 0.3)), { start: "nope" }, null, "x"]);
    expect(parsed).toHaveLength(1);
    expect(parseWindows("not a list")).toBeNull();
  });

  it("windowsAhead keeps only what overlaps the next hours", () => {
    const windows = [window(-6, 0.9), window(-1, 0.1), window(20, 0.2), window(30, 0.9)];
    expect(windowsAhead(windows, NOW, 24).map((w) => w.precipitationChance)).toEqual([0.1, 0.2]);
  });

  it("describes a decision, not a readout", () => {
    expect(describeHouseholdWeather({ state: "off", reason: "no_area" })).toBeNull();
    expect(describeHouseholdWeather({ state: "ready", place: "Pune", windows: [window(0, 0.8)], fetchedAt: NOW, stale: false })).toMatch(/will not dry outside/);
  });
});
