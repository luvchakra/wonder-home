import { describe, expect, it } from "vitest";

import {
  INSTALL_SNOOZE_MS,
  installBannerVariant,
  installPlatform,
  iosCanAddToHomeScreen,
  isPhoneOrTablet,
  parseStoredInstallState,
  type InstallSignals,
} from "./install-eligibility";

const UA = {
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  chromeAndroidTablet:
    "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  samsungInternet:
    "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
  firefoxAndroid: "Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0",
  androidWebView:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36",
  instagramAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36 Instagram 350.0.0.0.0 Android",
  safariIPhone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1",
  safariIPadAsMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
  chromeIOS17:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1",
  chromeIOS16_2:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/108.0.5359.112 Mobile/15E148 Safari/604.1",
  instagramIOS:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0.0 (iPhone15,2; iOS 17_6; en_US)",
  linkedInIOS:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.30",
  chromeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  safariMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
};

const NOW = Date.UTC(2026, 9, 10);

/** A phone on Chrome for Android, nothing installed, nothing remembered. */
function signals(overrides: Partial<InstallSignals> = {}): InstallSignals {
  return {
    userAgent: UA.chromeAndroid,
    uaDataMobile: true,
    maxTouchPoints: 5,
    coarsePointer: true,
    runningInstalled: false,
    relatedApps: "none",
    hasPromptEvent: true,
    stored: null,
    now: NOW,
    ...overrides,
  };
}

const iPhone = (userAgent: string, overrides: Partial<InstallSignals> = {}) =>
  signals({ userAgent, uaDataMobile: undefined, hasPromptEvent: false, relatedApps: "unsupported", ...overrides });

describe("installBannerVariant", () => {
  it("Chromium on a phone, once beforeinstallprompt has fired, offers one-tap install", () => {
    expect(installBannerVariant(signals())).toBe("prompt");
    expect(installBannerVariant(signals({ userAgent: UA.samsungInternet }))).toBe("prompt");
  });

  it("Chromium on an Android tablet (which reports mobile: false) still counts", () => {
    expect(installBannerVariant(signals({ userAgent: UA.chromeAndroidTablet, uaDataMobile: false }))).toBe("prompt");
  });

  it("Chromium on a phone shows nothing until the browser says it can install", () => {
    expect(installBannerVariant(signals({ hasPromptEvent: false }))).toBe("hidden");
  });

  it("desktop shows nothing, even with the event and even with a touchscreen", () => {
    const desktop = { userAgent: UA.chromeWindows, uaDataMobile: false, maxTouchPoints: 0, coarsePointer: false };
    expect(installBannerVariant(signals(desktop))).toBe("hidden");
    expect(installBannerVariant(signals({ ...desktop, maxTouchPoints: 10, coarsePointer: true }))).toBe("hidden");
    expect(installBannerVariant(signals({ userAgent: UA.safariMac, uaDataMobile: undefined, maxTouchPoints: 0, coarsePointer: false, hasPromptEvent: false }))).toBe("hidden");
  });

  it("running as the installed app shows nothing", () => {
    expect(installBannerVariant(signals({ runningInstalled: true }))).toBe("hidden");
    expect(installBannerVariant(iPhone(UA.safariIPhone, { runningInstalled: true }))).toBe("hidden");
  });

  it("installed according to getInstalledRelatedApps shows nothing, and nothing while it is still answering", () => {
    expect(installBannerVariant(signals({ relatedApps: "installed" }))).toBe("hidden");
    expect(installBannerVariant(signals({ relatedApps: "pending" }))).toBe("hidden");
    expect(installBannerVariant(signals({ relatedApps: "unsupported" }))).toBe("prompt");
  });

  it("Safari on an iPhone gets the two-step explanation", () => {
    expect(installBannerVariant(iPhone(UA.safariIPhone))).toBe("ios");
  });

  it("an iPad that presents itself as a Mac is still an iPad", () => {
    expect(installBannerVariant(iPhone(UA.safariIPadAsMac, { maxTouchPoints: 5 }))).toBe("ios");
  });

  it("Chrome on iOS 16.4 and later can add to the Home Screen; before 16.4 it cannot", () => {
    expect(installBannerVariant(iPhone(UA.chromeIOS17))).toBe("ios");
    expect(installBannerVariant(iPhone(UA.chromeIOS16_2))).toBe("hidden");
  });

  it("Firefox on Android shows nothing — it never fires the event", () => {
    expect(installBannerVariant(signals({ userAgent: UA.firefoxAndroid, uaDataMobile: undefined, hasPromptEvent: false }))).toBe("hidden");
  });

  it("in-app browsers show nothing, on Android and on iOS", () => {
    expect(installBannerVariant(signals({ userAgent: UA.instagramAndroid }))).toBe("hidden");
    expect(installBannerVariant(signals({ userAgent: UA.androidWebView }))).toBe("hidden");
    expect(installBannerVariant(iPhone(UA.instagramIOS))).toBe("hidden");
    expect(installBannerVariant(iPhone(UA.linkedInIOS))).toBe("hidden");
  });

  it("a snooze hides it until it runs out", () => {
    expect(installBannerVariant(signals({ stored: { snoozedUntil: NOW + 1 } }))).toBe("hidden");
    expect(installBannerVariant(iPhone(UA.safariIPhone, { stored: { snoozedUntil: NOW + INSTALL_SNOOZE_MS } }))).toBe("hidden");
    expect(installBannerVariant(signals({ stored: { snoozedUntil: NOW - 1 } }))).toBe("prompt");
  });

  it("an install this browser recorded hides it for good", () => {
    expect(installBannerVariant(signals({ stored: { installed: true } }))).toBe("hidden");
    expect(installBannerVariant(iPhone(UA.safariIPhone, { stored: { installed: true } }))).toBe("hidden");
  });
});

describe("the parts", () => {
  it("a phone needs a finger as well as a phone's user agent", () => {
    expect(isPhoneOrTablet({ userAgent: UA.chromeAndroid, uaDataMobile: true, maxTouchPoints: 5, coarsePointer: false })).toBe(false);
    expect(isPhoneOrTablet({ userAgent: UA.safariMac, maxTouchPoints: 0, coarsePointer: true })).toBe(false);
  });

  it("only Safari and the share-sheet browsers on iOS can add to the Home Screen", () => {
    expect(iosCanAddToHomeScreen(UA.safariIPhone)).toBe(true);
    expect(iosCanAddToHomeScreen(UA.instagramIOS)).toBe(false);
    expect(iosCanAddToHomeScreen("Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/131.0 Mobile/15E148 Safari/605.1.15")).toBe(true);
  });

  it("the platform for the browser-menu instructions knows an iPad posing as a Mac", () => {
    expect(installPlatform(UA.safariIPadAsMac, 5)).toBe("ios");
    expect(installPlatform(UA.safariMac, 0)).toBe("desktop");
    expect(installPlatform(UA.chromeAndroid, 5)).toBe("android");
  });

  it("stored state is read defensively", () => {
    expect(parseStoredInstallState(null)).toBeNull();
    expect(parseStoredInstallState("not json")).toBeNull();
    expect(parseStoredInstallState("[1]")).toEqual({});
    expect(parseStoredInstallState('{"installed":"yes","snoozedUntil":"soon"}')).toEqual({});
    expect(parseStoredInstallState('{"installed":true,"snoozedUntil":5}')).toEqual({ installed: true, snoozedUntil: 5 });
  });
});
