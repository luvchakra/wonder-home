"use client";

import { useCallback, useSyncExternalStore } from "react";

import {
  INSTALL_SNOOZE_MS,
  INSTALL_STORAGE_KEY,
  installBannerVariant,
  installPlatform,
  parseStoredInstallState,
  type InstallBannerVariant,
  type InstallPlatform,
  type RelatedAppsState,
  type StoredInstallState,
} from "./install-eligibility";

/**
 * Whether this page can be installed as an app, and how.
 *
 * Chromium browsers fire `beforeinstallprompt` once the app is installable
 * and not installed, usually early and only once — so it is captured here at
 * module load, before any component has mounted, and handed to whichever
 * surface asks: the install banner, the account menu, HomeSend's channels.
 * The root layout renders `InstallPromptCapture` so this module is evaluated
 * on every page, not only on the ones that show an install action. Browsers
 * without the event (Safari on iOS, Firefox) install through their own share
 * or browser menu instead, which the caller explains in words. Once the app
 * is running installed there is nothing to install.
 *
 * Everything that touches `localStorage` is wrapped: blocked storage means
 * the banner cannot remember a "Not now", never that a page breaks.
 */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type InstallState = {
  /** A native prompt is available: calling `prompt()` shows it. */
  canPrompt: boolean;
  /** Already running as an installed app, or installed from this page. */
  installed: boolean;
  /** Where the browser hides its own install action, for the words. */
  platform: InstallPlatform;
};

type PromptOutcome = "accepted" | "dismissed" | "unavailable";

type Snapshot = InstallState & { banner: InstallBannerVariant };

const SERVER_STATE: Snapshot = { canPrompt: false, installed: false, platform: "unknown", banner: "hidden" };

/** Display modes in which this page *is* the installed app. */
const INSTALLED_DISPLAY_MODES = ["standalone", "fullscreen", "minimal-ui", "window-controls-overlay"] as const;

let started = false;
let deferred: BeforeInstallPromptEvent | null = null;
let relatedApps: RelatedAppsState = "unsupported";
/** Installed during this page's life (`appinstalled`, an accepted prompt, iOS "I've added it"), whatever storage allows. */
let installedThisSession = false;
/** "Not now" during this page's life, so the banner stays gone even when storage is blocked. */
let dismissedThisSession = false;
let snapshot: Snapshot = SERVER_STATE;
const listeners = new Set<() => void>();

function runningInstalled(): boolean {
  return (
    INSTALLED_DISPLAY_MODES.some((mode) => window.matchMedia?.(`(display-mode: ${mode})`).matches) ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function readStored(): StoredInstallState | null {
  try {
    return parseStoredInstallState(window.localStorage.getItem(INSTALL_STORAGE_KEY));
  } catch {
    return null;
  }
}

function writeStored(state: StoredInstallState): void {
  try {
    window.localStorage.setItem(INSTALL_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage blocked: this page still hides the banner; the next visit may ask again.
  }
}

function compute(): Snapshot {
  if (typeof window === "undefined") return SERVER_STATE;
  const installed = runningInstalled();
  const userAgent = navigator.userAgent;
  const maxTouchPoints = navigator.maxTouchPoints ?? 0;
  const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
  const banner: InstallBannerVariant =
    installedThisSession || dismissedThisSession
      ? "hidden"
      : installBannerVariant({
          userAgent,
          uaDataMobile: uaData?.mobile,
          maxTouchPoints,
          coarsePointer: window.matchMedia?.("(pointer: coarse)").matches ?? false,
          runningInstalled: installed,
          relatedApps,
          hasPromptEvent: deferred !== null,
          stored: readStored(),
          now: Date.now(),
        });
  return {
    canPrompt: deferred !== null && !installed,
    installed: installed || installedThisSession,
    platform: installPlatform(userAgent, maxTouchPoints),
    banner,
  };
}

/** Recomputes, keeping the same snapshot object when nothing changed (useSyncExternalStore needs that). */
function update(): void {
  const next = compute();
  if (
    next.canPrompt !== snapshot.canPrompt ||
    next.installed !== snapshot.installed ||
    next.platform !== snapshot.platform ||
    next.banner !== snapshot.banner
  ) {
    snapshot = next;
    for (const listener of listeners) listener();
  }
}

function markInstalled(): void {
  installedThisSession = true;
  deferred = null;
  writeStored({ installed: true });
  update();
}

/** "Not now", or declining the browser's prompt: the banner stays away on this browser for the snooze period. */
function snoozeBanner(): void {
  dismissedThisSession = true;
  writeStored({ ...readStored(), snoozedUntil: Date.now() + INSTALL_SNOOZE_MS });
  update();
}

/**
 * Asks the browser whether this web app is already installed on the device.
 * It answers only for the manifest's own `related_applications` entry (a
 * `webapp` pointing at the manifest itself), and only from a normal tab.
 */
function checkRelatedApps(): void {
  const lookup = (navigator as Navigator & { getInstalledRelatedApps?: () => Promise<unknown[]> }).getInstalledRelatedApps;
  if (typeof lookup !== "function" || runningInstalled()) return;
  relatedApps = "pending";
  lookup
    .call(navigator)
    .then((apps) => {
      relatedApps = Array.isArray(apps) && apps.length > 0 ? "installed" : "none";
    })
    .catch(() => {
      relatedApps = "none";
    })
    .finally(update);
}

/** Starts listening, once per page. Safe to call from anywhere, any number of times. */
export function startInstallCapture(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  window.addEventListener("beforeinstallprompt", (event) => {
    // The banner and the menu offer the install; the browser's own mini-infobar would be a second offer.
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    update();
  });
  window.addEventListener("appinstalled", markInstalled);
  for (const mode of INSTALLED_DISPLAY_MODES) {
    window.matchMedia?.(`(display-mode: ${mode})`).addEventListener?.("change", update);
  }
  checkRelatedApps();
  snapshot = compute();
}

startInstallCapture();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => snapshot;
const getServerSnapshot = () => SERVER_STATE;

/**
 * Shows the browser's own install prompt. An event can be prompted only
 * once, whatever the answer, so it is let go either way; declining quiets
 * the banner for the snooze period.
 */
async function promptInstall(): Promise<PromptOutcome> {
  const event = deferred;
  if (!event) return "unavailable";
  deferred = null;
  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === "accepted") markInstalled();
    else snoozeBanner();
    return outcome;
  } catch {
    update();
    return "unavailable";
  }
}

export function useInstallPrompt(): InstallState & { prompt: () => Promise<PromptOutcome> } {
  const { canPrompt, installed, platform } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const prompt = useCallback(() => promptInstall(), []);
  return { canPrompt, installed, platform, prompt };
}

/**
 * The install banner's view of the same state: which invitation to show, if
 * any, and the three things a person can do with it.
 */
export function useInstallBanner(): {
  variant: InstallBannerVariant;
  install: () => Promise<PromptOutcome>;
  dismiss: () => void;
  /** iOS: the person says they added it to the Home Screen — a Safari tab can never tell. */
  confirmAdded: () => void;
} {
  const { banner } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { variant: banner, install: promptInstall, dismiss: snoozeBanner, confirmAdded: markInstalled };
}

/** What to tell somebody whose browser installs through its own menu. */
export function installInstructions(platform: InstallState["platform"]): string[] {
  switch (platform) {
    case "ios":
      return [
        "In Safari, tap the Share button at the bottom of the screen.",
        "Scroll down and tap “Add to Home Screen”.",
        "Tap “Add”. WonderHome opens like an app from then on.",
      ];
    case "android":
      return [
        "Open the browser’s menu (the three dots at the top right).",
        "Tap “Install app” or “Add to Home screen”.",
        "Confirm. WonderHome opens like an app from then on.",
      ];
    case "desktop":
      return [
        "Look for the install icon at the right-hand end of the address bar.",
        "Or open the browser’s menu and choose “Install WonderHome…”.",
      ];
    default:
      return ["Open your browser’s menu and look for “Install app” or “Add to Home screen”."];
  }
}
