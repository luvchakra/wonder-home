import { describe, expect, it } from "vitest";

import { todayWeather } from "./today-weather";

const at = (hour: number) => new Date(Date.UTC(2026, 9, 21, hour));
const window = (hour: number, temperatureC: number, precipitationChance: number) => ({ start: at(hour), end: at(hour + 1), temperatureC, precipitationChance, humidity: 0.6 });

describe("todayWeather", () => {
  const windows = [window(2, 24.4, 0), window(3, 26.2, 0.1), window(8, 31.6, 0.2), window(11, 29, 0.7), window(16, 25, 0.3), window(20, 23, 0.9)];

  it("reads the hour now, the day's high and low, and the likeliest rain still ahead today", () => {
    expect(todayWeather(windows, new Date(Date.UTC(2026, 9, 21, 3, 30)), at(18))).toEqual({ nowC: 26, highC: 32, lowC: 25, rainChance: 0.7, rainAt: at(11) });
  });

  it("does not say rain below the line, and nothing at all once the day's windows are gone", () => {
    expect(todayWeather([window(3, 26, 0.2)], at(3), at(18))?.rainAt).toBeNull();
    expect(todayWeather(windows, at(19), at(18))).toBeNull();
  });
});
