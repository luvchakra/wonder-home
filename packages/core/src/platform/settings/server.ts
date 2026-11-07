import { adminClientFor, adminGrant } from "../../db/admin-context";
import { overlayOf } from "./overlay";
import { loadStoredSettings } from "./store";
import { refreshRuntimeEnv, useSettingsLoader } from "./runtime-env";

/**
 * Server start (`apps/web/instrumentation.ts`, Node only): lay the settings
 * staff saved over the environment, and wait briefly for the first read so
 * the first request already sees them. A slow or missing store never holds a
 * server up for longer than `waitMs`; readers then use the environment until
 * the read lands.
 */
export async function enablePlatformSettings(waitMs = 3_000): Promise<void> {
  useSettingsLoader(() => loadStoredSettings(adminClientFor(adminGrant.worker("platform-settings", "read saved platform settings"))), overlayOf);
  await Promise.race([refreshRuntimeEnv(), new Promise<void>((resolve) => setTimeout(resolve, waitMs).unref?.())]);
}
