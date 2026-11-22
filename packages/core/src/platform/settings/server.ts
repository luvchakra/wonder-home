import { adminClientFor, adminGrant } from "../../db/admin-context";
import { overlayOf } from "./overlay";
import { loadStoredSettings } from "./store";
import { refreshRuntimeEnv, settingsStoreState, useSettingsLoader } from "./runtime-env";

/**
 * Server start (`apps/web/instrumentation.ts`, Node only): lay the settings
 * staff saved over the environment, and wait briefly for the first read so
 * the first request already sees them. A slow or missing store never holds a
 * server up for longer than `waitMs`; readers then use the environment until
 * the read lands.
 */
export async function enablePlatformSettings(waitMs = 3_000): Promise<void> {
  registerLoader();
  await Promise.race([refreshRuntimeEnv(), new Promise<void>((resolve) => setTimeout(resolve, waitMs).unref?.())]);
}

function registerLoader(): void {
  useSettingsLoader(() => loadStoredSettings(adminClientFor(adminGrant.worker("platform-settings", "read saved platform settings"))), overlayOf);
}

/**
 * For a route that must see saved settings (the WhatsApp webhook): registers
 * the loader if this server has none yet, without resetting one already
 * there. Instrumentation normally has; this keeps a route working if it
 * has not run, or ran in a module graph this route cannot see.
 */
export function ensurePlatformSettings(): void {
  if (settingsStoreState() === "no_loader") registerLoader();
}

