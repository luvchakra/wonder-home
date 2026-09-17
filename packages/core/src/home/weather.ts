/**
 * Weather-aware planning (story 13-005).
 *
 * `CLAUDE.md` is explicit that a provider is live only once credentials,
 * authentication, contract behaviour and integration tests exist. None of that
 * is true yet, so this module defines the port and a deterministic fixture, and
 * nothing here claims a real forecast.
 *
 * The product rule matters more than the integration: weather is used only when
 * it can change a household decision. A family does not need a forecast from
 * WonderHome — they have a phone. They need to know that the uniform will not
 * dry in time, which is a different sentence.
 */

export type WeatherWindow = {
  start: Date;
  end: Date;
  /** 0..1. */
  precipitationChance: number;
  /** Relative humidity, 0..1. */
  humidity: number;
  temperatureC: number;
};

export type WeatherQuery = {
  /** Coarse location: a household's city, never a precise address. */
  locality: string;
  from: Date;
  hours: number;
};

export type WeatherProvider = {
  readonly name: string;
  forecast(query: WeatherQuery): Promise<WeatherWindow[]>;
};

/**
 * A provider that returns exactly what it was given.
 *
 * Every decision in this module is therefore testable without a network, and
 * the absence of a configured provider is an ordinary state rather than an
 * error — a household with no forecast still gets plans, just less confident
 * ones.
 */
export function createFixtureWeatherProvider(windows: readonly WeatherWindow[]): WeatherProvider {
  return {
    name: "fixture",
    async forecast(query) {
      const until = new Date(query.from.getTime() + query.hours * 3_600_000);
      return windows.filter((window) => window.end > query.from && window.start < until);
    },
  };
}

/** A settled, dry stretch: laundry on a line will dry, outdoor work is fine. */
export const FIXTURE_CLEAR_DAY: readonly WeatherWindow[] = buildWindows([
  { precipitationChance: 0.05, humidity: 0.4, temperatureC: 31 },
  { precipitationChance: 0.05, humidity: 0.42, temperatureC: 33 },
  { precipitationChance: 0.1, humidity: 0.45, temperatureC: 30 },
]);

/** Monsoon: nothing dries outside and outdoor work should move. */
export const FIXTURE_WET_DAY: readonly WeatherWindow[] = buildWindows([
  { precipitationChance: 0.8, humidity: 0.9, temperatureC: 26 },
  { precipitationChance: 0.75, humidity: 0.92, temperatureC: 25 },
  { precipitationChance: 0.6, humidity: 0.88, temperatureC: 26 },
]);

function buildWindows(
  parts: readonly { precipitationChance: number; humidity: number; temperatureC: number }[],
  from = new Date("2026-09-17T00:00:00.000Z"),
): WeatherWindow[] {
  return parts.map((part, index) => ({
    start: new Date(from.getTime() + index * 6 * 3_600_000),
    end: new Date(from.getTime() + (index + 1) * 6 * 3_600_000),
    ...part,
  }));
}

export type DryingConditions = {
  /** Whether line drying will work at all. */
  outdoorViable: boolean;
  /**
   * What to multiply an indoor drying estimate by. Above 1 means slower than
   * usual; the multiplier is how weather actually reaches a decision.
   */
  hoursMultiplier: number;
  reason: string;
};

/** Above this chance of rain, hanging washing outside is a gamble the household loses. */
export const RAIN_THRESHOLD = 0.4;

export function dryingConditions(windows: readonly WeatherWindow[]): DryingConditions {
  if (windows.length === 0) {
    // No forecast is not bad weather. Assume ordinary conditions and say so,
    // rather than inventing caution the household did not ask for.
    return { outdoorViable: true, hoursMultiplier: 1, reason: "No forecast available; assuming ordinary conditions." };
  }

  const wettest = Math.max(...windows.map((window) => window.precipitationChance));
  const humidity = windows.reduce((total, window) => total + window.humidity, 0) / windows.length;

  if (wettest >= RAIN_THRESHOLD) {
    return {
      outdoorViable: false,
      hoursMultiplier: 1.8,
      reason: `Rain is likely (${Math.round(wettest * 100)}% chance), so washing will not dry outside.`,
    };
  }

  if (humidity >= 0.75) {
    return {
      outdoorViable: true,
      hoursMultiplier: 1.4,
      reason: "It is humid, so drying will take longer than usual.",
    };
  }

  return { outdoorViable: true, hoursMultiplier: 1, reason: "Good drying conditions." };
}

export type OutdoorPlan =
  | { kind: "proceed"; reason: string }
  | { kind: "move"; toStart: Date; reason: string }
  | { kind: "no_clear_window"; reason: string };

/**
 * Whether outdoor work should move, and to when (story 13-005).
 *
 * The answer is only ever produced when it changes something: work already
 * planned for a dry window comes back as `proceed`, which the caller is meant
 * to say nothing about.
 */
export function planOutdoorWork(
  plannedStart: Date,
  durationHours: number,
  windows: readonly WeatherWindow[],
): OutdoorPlan {
  const covering = windows.filter(
    (window) =>
      window.end > plannedStart &&
      window.start < new Date(plannedStart.getTime() + durationHours * 3_600_000),
  );

  if (covering.length === 0) {
    return { kind: "proceed", reason: "No forecast covers that time; nothing suggests moving it." };
  }

  if (covering.every((window) => window.precipitationChance < RAIN_THRESHOLD)) {
    return { kind: "proceed", reason: "The forecast is fine for that time." };
  }

  const alternative = windows.find(
    (window) => window.start >= plannedStart && window.precipitationChance < RAIN_THRESHOLD,
  );

  return alternative
    ? {
        kind: "move",
        toStart: alternative.start,
        reason: "Rain is likely at the planned time; this is the next dry window.",
      }
    : { kind: "no_clear_window", reason: "Rain is likely all day; this may need to wait." };
}

export type WeatherAccess =
  | { allowed: true }
  | { allowed: false; code: "not_entitled" | "not_configured"; reason: string };

/**
 * Whether weather-aware planning may run for this household.
 *
 * The acceptance criterion is that a direct API call cannot bypass the
 * entitlement decision even when the UI does not render the feature — so this
 * is called on the server path, not consulted by the component. Hiding a
 * feature is presentation; refusing it is authorization, and only one of those
 * is a control.
 */
export function checkWeatherAccess(input: {
  entitled: boolean;
  provider: WeatherProvider | null;
}): WeatherAccess {
  if (!input.entitled) {
    return {
      allowed: false,
      code: "not_entitled",
      reason: "Weather-aware planning is not part of this household's plan.",
    };
  }
  if (!input.provider) {
    return {
      allowed: false,
      code: "not_configured",
      reason: "No weather provider is configured.",
    };
  }
  return { allowed: true };
}
