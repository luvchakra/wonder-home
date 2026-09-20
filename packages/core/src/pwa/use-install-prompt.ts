"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether this page can be installed as an app, and how.
 *
 * Chromium browsers fire `beforeinstallprompt` once the manifest and service
 * criteria are met, usually early and only once — so it is captured here at
 * module load, before any component has mounted, and handed to whichever
 * menu asks. Browsers without the event (Safari on iOS, Firefox) install
 * through their own share or browser menu instead, which the caller explains
 * in words. Once the app is running standalone there is nothing to install.
 */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type InstallState = {
  /** A native prompt is available: calling `prompt()` shows it. */
  canPrompt: boolean;
  /** Already running as an installed app. */
  installed: boolean;
  /** Where the browser hides its own install action, for the words. */
  platform: "ios" | "android" | "desktop" | "unknown";
};

const SERVER_STATE: InstallState = { canPrompt: false, installed: false, platform: "unknown" };

let deferred: BeforeInstallPromptEvent | null = null;
let snapshot: InstallState = SERVER_STATE;
const listeners = new Set<() => void>();

function compute(): InstallState {
  if (typeof window === "undefined") return SERVER_STATE;
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const ua = navigator.userAgent;
  const platform: InstallState["platform"] = /iPhone|iPad|iPod/i.test(ua)
    ? "ios"
    : /Android/i.test(ua)
      ? "android"
      : /Windows|Macintosh|Linux|CrOS/i.test(ua)
        ? "desktop"
        : "unknown";
  return { canPrompt: deferred !== null && !standalone, installed: standalone, platform };
}

function update(): void {
  snapshot = compute();
  for (const listener of listeners) listener();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    update();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    update();
  });
  snapshot = compute();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useInstallPrompt(): InstallState & { prompt: () => Promise<"accepted" | "dismissed" | "unavailable"> } {
  const state = useSyncExternalStore(subscribe, () => snapshot, () => SERVER_STATE);

  const prompt = useCallback(async () => {
    const event = deferred;
    if (!event) return "unavailable" as const;
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === "accepted") deferred = null;
    update();
    return outcome;
  }, []);

  return { ...state, prompt };
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
