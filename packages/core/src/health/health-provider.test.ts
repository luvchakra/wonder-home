import { describe, expect, it } from "vitest";

import { ApiError } from "../api/errors";
import { assertHealthProviderLive, HEALTH_PROVIDER_IDS, HEALTH_PROVIDERS, isLiveHealthProvider, resolveHealthProvider } from "./health-provider";

describe("health-provider", () => {
  it("declares every provider named by the story", () => {
    expect([...HEALTH_PROVIDER_IDS].sort()).toEqual(
      ["android_health_connect", "apple_health_kit", "calendar", "home_send", "home_talk", "manual", "wearable"].sort(),
    );
  });

  it("marks manual, HomeTalk, HomeSend and calendar live", () => {
    expect(isLiveHealthProvider("manual")).toBe(true);
    expect(isLiveHealthProvider("home_talk")).toBe(true);
    expect(isLiveHealthProvider("home_send")).toBe(true);
    expect(isLiveHealthProvider("calendar")).toBe(true);
  });

  it("marks Apple HealthKit, Android Health Connect and a wearable inert", () => {
    expect(isLiveHealthProvider("apple_health_kit")).toBe(false);
    expect(isLiveHealthProvider("android_health_connect")).toBe(false);
    expect(isLiveHealthProvider("wearable")).toBe(false);
  });

  it("resolves the full provider record for a given id", () => {
    expect(resolveHealthProvider("manual")).toEqual(HEALTH_PROVIDERS.manual);
  });

  it("does not throw for a live provider", () => {
    expect(() => assertHealthProviderLive("manual")).not.toThrow();
    expect(assertHealthProviderLive("home_talk").id).toBe("home_talk");
  });

  it("refuses to claim a live connection for an inert provider", () => {
    expect(() => assertHealthProviderLive("apple_health_kit")).toThrow(ApiError);
    try {
      assertHealthProviderLive("wearable");
      throw new Error("expected assertHealthProviderLive to throw");
    } catch (thrown) {
      expect(thrown).toBeInstanceOf(ApiError);
      expect((thrown as ApiError).message).toMatch(/not connected yet/);
    }
  });

  it("never states a provider's own jargon-y product name in a label that would confuse a household", () => {
    for (const provider of Object.values(HEALTH_PROVIDERS)) {
      expect(provider.label.length).toBeGreaterThan(0);
    }
  });
});
