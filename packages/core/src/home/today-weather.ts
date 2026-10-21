import type { WeatherWindow } from "./weather";

/**
 * The day's weather at a glance, for the Home date card (the owner,
 * 2026-10-21: "make this card longer and show more weather info on this
 * card"). Arithmetic over the forecast windows already kept for the
 * household, nothing more: the temperature now, the day's high and low,
 * and the likeliest rain still ahead, with when it is.
 */
export type TodayWeather = {
  /** The temperature in the window covering now, else the next one. */
  nowC: number;
  highC: number;
  lowC: number;
  /** The highest chance of rain from now to the end of the local day, 0..1. */
  rainChance: number;
  /** When that chance peaks, when it is worth saying. */
  rainAt: Date | null;
};

/** Rain is said only from this chance up; below it the day reads as dry. */
export const RAIN_WORTH_SAYING = 0.4;

export function todayWeather(windows: readonly WeatherWindow[], now: Date, endOfDay: Date): TodayWeather | null {
  const today = windows.filter((window) => window.end > now && window.start < endOfDay);
  if (today.length === 0) return null;
  const current = today.find((window) => window.start <= now && window.end > now) ?? today[0]!;
  const temps = today.map((window) => window.temperatureC);
  const wettest = today.reduce((best, window) => (window.precipitationChance > best.precipitationChance ? window : best), today[0]!);
  return {
    nowC: Math.round(current.temperatureC),
    highC: Math.round(Math.max(...temps)),
    lowC: Math.round(Math.min(...temps)),
    rainChance: wettest.precipitationChance,
    rainAt: wettest.precipitationChance >= RAIN_WORTH_SAYING ? wettest.start : null,
  };
}
