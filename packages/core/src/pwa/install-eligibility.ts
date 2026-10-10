/**
 * Whether to invite somebody to install WonderHome, and which invitation
 * (the install banner, story 00-011).
 *
 * Pure on purpose: every input is a plain flag the browser layer reads
 * (`use-install-prompt.ts`), so each platform's answer is a unit test rather
 * than a device in a drawer. The banner shows only when the browser can
 * really install the app *and* it is not already installed here:
 *
 * - **Chromium on a phone or tablet** (Chrome, Edge, Samsung Internet…) only
 *   once `beforeinstallprompt` has fired — the browser's own word that the
 *   app is installable and not installed — and then installs in one tap.
 * - **iOS and iPadOS** have no install event. Safari, and the other iOS
 *   browsers that offer "Add to Home Screen" in their share sheet from iOS
 *   16.4, get the two steps spelled out instead.
 * - **Everything else** — desktop (touchscreen or not), Firefox on Android,
 *   in-app browsers such as Instagram's or LinkedIn's — gets nothing.
 *
 * Never while running as the installed app, never once the browser reports
 * this app installed (`getInstalledRelatedApps`), and never inside a snooze
 * or after this browser has recorded an install.
 */

/** This product's own key, so nothing else on the origin can collide with it. */
export const INSTALL_STORAGE_KEY = "wonderhome:install-banner";

/** How long "Not now", or declining the browser's own prompt, quiets the banner. */
export const INSTALL_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

/** What this browser remembers about the invitation. */
export type StoredInstallState = {
  /** Installed (or, on iOS, the person said they added it): never ask again here. */
  installed?: true;
  /** Epoch milliseconds before which the banner stays away. */
  snoozedUntil?: number;
};

/**
 * `getInstalledRelatedApps`: not in this browser, still answering, or its
 * answer. "pending" hides the banner so it never flashes up and away again.
 */
export type RelatedAppsState = "unsupported" | "pending" | "none" | "installed";

export type InstallSignals = {
  userAgent: string;
  /** `navigator.userAgentData?.mobile` — absent outside Chromium. */
  uaDataMobile?: boolean;
  /** `navigator.maxTouchPoints`: tells an iPad asking for the desktop site from a Mac. */
  maxTouchPoints: number;
  /** `matchMedia("(pointer: coarse)")`: a finger is the primary pointer. */
  coarsePointer: boolean;
  /** Already running as the installed app (a standalone-like display mode, or iOS `navigator.standalone`). */
  runningInstalled: boolean;
  relatedApps: RelatedAppsState;
  /** A `beforeinstallprompt` event has been caught and kept. */
  hasPromptEvent: boolean;
  stored: StoredInstallState | null;
  now: number;
};

/** One-tap install, the iOS two-step explanation, or nothing at all. */
export type InstallBannerVariant = "prompt" | "ios" | "hidden";

const IOS_DEVICE = /iPhone|iPad|iPod/;

/** An iPhone, iPod or iPad — including an iPad that presents itself as a Mac. */
export function isIOSDevice(userAgent: string, maxTouchPoints: number): boolean {
  return IOS_DEVICE.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

/**
 * A phone or a tablet. The user agent (or Chromium's own `mobile` hint) says
 * what the device claims to be; a coarse primary pointer confirms a finger is
 * driving it. A desktop with a touchscreen claims neither Android nor iOS, so
 * it never counts, and neither does a phone asking for a desktop site in a
 * browser that hides it completely.
 */
export function isPhoneOrTablet(signals: Pick<InstallSignals, "userAgent" | "uaDataMobile" | "maxTouchPoints" | "coarsePointer">): boolean {
  const claimsMobile =
    signals.uaDataMobile === true ||
    /Android/.test(signals.userAgent) ||
    isIOSDevice(signals.userAgent, signals.maxTouchPoints);
  return claimsMobile && signals.coarsePointer;
}

/**
 * Browsers inside another app — they cannot install anything, and a banner
 * there would promise what the next tap cannot do. `; wv)` is Android's own
 * WebView marker; `GSA/` is the Google app on iOS.
 */
const IN_APP =
  /FBAN|FBAV|FB_IAB|FBIOS|Instagram|LinkedInApp|Line\/|Twitter|Snapchat|MicroMessenger|WhatsApp|TikTok|musical_ly|Bytedance|Pinterest|GSA\/|; wv\)/i;

export function isInAppBrowser(userAgent: string): boolean {
  return IN_APP.test(userAgent);
}

/** iOS browsers other than Safari that put "Add to Home Screen" in their share sheet from iOS 16.4. */
const IOS_THIRD_PARTY = /CriOS|FxiOS|EdgiOS/;
/** Other iOS shells: no share-sheet install we can promise. */
const IOS_OTHER = /OPiOS|OPT\/|YaBrowser|DuckDuckGo|Brave|GSA\//;

/** The iOS major and minor version from the user agent, when it says. */
export function iosVersion(userAgent: string): [number, number] | null {
  const os = /OS (\d+)[_.](\d+)/.exec(userAgent);
  if (os && IOS_DEVICE.test(userAgent)) return [Number(os[1]), Number(os[2])];
  // An iPad asking for the desktop site reports the Safari version, which
  // tracks iPadOS's own.
  const safari = /Version\/(\d+)\.(\d+)/.exec(userAgent);
  return safari ? [Number(safari[1]), Number(safari[2])] : null;
}

/** Safari on iOS, or a share-sheet iOS browser on 16.4 or later. */
export function iosCanAddToHomeScreen(userAgent: string): boolean {
  if (IOS_OTHER.test(userAgent)) return false;
  if (IOS_THIRD_PARTY.test(userAgent)) {
    const version = iosVersion(userAgent);
    return version !== null && (version[0] > 16 || (version[0] === 16 && version[1] >= 4));
  }
  // Safari itself always says "Safari/" and "Version/"; a WebView inside an
  // app says neither.
  return /Safari\//.test(userAgent) && /Version\//.test(userAgent);
}

/** Inside a snooze, or after an install this browser has recorded. */
export function isQuieted(stored: StoredInstallState | null, now: number): boolean {
  if (!stored) return false;
  if (stored.installed) return true;
  return typeof stored.snoozedUntil === "number" && stored.snoozedUntil > now;
}

export function installBannerVariant(signals: InstallSignals): InstallBannerVariant {
  if (signals.runningInstalled) return "hidden";
  if (signals.relatedApps === "installed" || signals.relatedApps === "pending") return "hidden";
  if (isQuieted(signals.stored, signals.now)) return "hidden";
  if (!isPhoneOrTablet(signals)) return "hidden";
  if (isInAppBrowser(signals.userAgent)) return "hidden";

  const ios = isIOSDevice(signals.userAgent, signals.maxTouchPoints);
  if (ios) return iosCanAddToHomeScreen(signals.userAgent) ? "ios" : "hidden";
  return signals.hasPromptEvent ? "prompt" : "hidden";
}

/** Where a browser keeps its own install action — for the words in a menu or sheet. */
export type InstallPlatform = "ios" | "android" | "desktop" | "unknown";

export function installPlatform(userAgent: string, maxTouchPoints: number): InstallPlatform {
  if (isIOSDevice(userAgent, maxTouchPoints)) return "ios";
  if (/Android/.test(userAgent)) return "android";
  if (/Windows|Macintosh|Linux|CrOS/.test(userAgent)) return "desktop";
  return "unknown";
}

/** Reads the stored state, tolerating anything a person or another version left there. */
export function parseStoredInstallState(raw: string | null): StoredInstallState | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    const state: StoredInstallState = {};
    if (record.installed === true) state.installed = true;
    if (typeof record.snoozedUntil === "number" && Number.isFinite(record.snoozedUntil)) state.snoozedUntil = record.snoozedUntil;
    return state;
  } catch {
    return null;
  }
}
