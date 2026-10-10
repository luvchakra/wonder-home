"use client";

import { startInstallCapture } from "../../pwa/use-install-prompt";

// Evaluated with the root layout's own client code, on every page: Chromium
// fires `beforeinstallprompt` once per page load and often before any screen
// has mounted, so the listener must already be there (story 00-011). A module
// the layout loads anyway is early enough, so no inline script is added.
startInstallCapture();

/** Renders nothing; being in the root layout is the whole point. */
export function InstallPromptCapture() {
  return null;
}
