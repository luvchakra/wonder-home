import { forgetPlatformData, keptPerServer } from "../../lib/platform-cache";

/**
 * The environment as the server's readers see it: the deployment's variables,
 * with every value staff saved in the platform admin laid over them (owner,
 * 2026-11-07). So the order is saved value → environment variable → the
 * reader's own default, and a deployment with nothing saved behaves exactly
 * as before.
 *
 * Readers stay synchronous (`whatsappConfigFromEnv(env = runtimeEnv())`): the
 * saved values are loaded once when the server starts (`instrumentation.ts`)
 * and kept for a minute (`lib/platform-cache.ts`, `platform_config`); a read
 * after that minute answers with what it has and refreshes behind it. A save
 * clears this server's copy at once (`forgetRuntimeEnv`), and other servers
 * see it within the minute. Nothing is ever written to `process.env`.
 *
 * Only keys in the registry are laid over (`overlay.ts`, passed in by
 * `server.ts`), so a row can never stand in for a bootstrap value such as the
 * service-role key. The loader is registered by the server alone (it holds
 * the service-role client), so in a browser bundle this is the plain
 * environment; this module imports neither the registry nor zod for that reason.
 */

export type Env = Readonly<Record<string, string | undefined>>;
export type StoredSettings = Readonly<Record<string, string>>;

let loader: (() => Promise<StoredSettings>) | null = null;
let overlay: (rows: StoredSettings) => StoredSettings = () => ({});
let stored: StoredSettings = {};
let merged: Env | null = null;
let loadedAt = Number.NEGATIVE_INFINITY;
let refreshing: Promise<void> | null = null;

const TTL_MS = 60_000;

/** Server start: how to read the saved values (the service-role RPC), and which of them to lay over. */
export function useSettingsLoader(load: (() => Promise<StoredSettings>) | null, keep: (rows: StoredSettings) => StoredSettings = () => ({})): void {
  loader = load;
  overlay = keep;
  stored = {};
  merged = null;
  loadedAt = Number.NEGATIVE_INFINITY;
  refreshing = null;
}

/** Loads the saved values now (shared by concurrent callers). A failed read keeps what was there. */
export function refreshRuntimeEnv(now = Date.now()): Promise<void> {
  if (!loader) return Promise.resolve();
  if (refreshing) return refreshing;
  const load = loader;
  refreshing = keptPerServer("platform_config", async () => ({ value: await load(), keep: true }), now)
    .then(
      (rows) => {
        stored = overlay(rows);
        merged = null;
        loadedAt = now;
      },
      () => {
        // The store could not be read: keep the last values (or the plain
        // environment) and try again on the next read after a short pause.
        loadedAt = now - TTL_MS + 5_000;
      },
    )
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/** The environment to read a setting from, now. Never waits; refreshes behind itself when stale. */
export function runtimeEnv(now = Date.now()): Env {
  if (loader && now - loadedAt >= TTL_MS) void refreshRuntimeEnv(now);
  if (Object.keys(stored).length === 0) return process.env;
  merged ??= { ...process.env, ...stored };
  return merged;
}

/** The same, after waiting for a refresh if the copy is stale: for a request that must see a save just made. */
export async function freshRuntimeEnv(now = Date.now()): Promise<Env> {
  if (loader && now - loadedAt >= TTL_MS) await refreshRuntimeEnv(now);
  return runtimeEnv(now);
}

/** After a save on this server: drop the kept copy so the next read loads the new value. */
export function forgetRuntimeEnv(): void {
  forgetPlatformData("platform_config");
  loadedAt = Number.NEGATIVE_INFINITY;
}

/** Which keys have a saved value laid over the environment, for the admin screens. */
export function savedKeys(): readonly string[] {
  return Object.keys(stored);
}
