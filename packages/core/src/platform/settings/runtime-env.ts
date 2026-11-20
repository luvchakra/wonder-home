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

/**
 * WonderHome's own AI settings live in one place: Platform admin (owner,
 * 2026-11-21, "ensure its only configured once and used from there"). On a
 * deployment (Vercel, the GitHub runner, any server) these names are taken
 * from the saved store alone: a deployment variable or a GitHub secret of the
 * same name is ignored, and until the store has been read they read as unset
 * ("no key": the rules answer), never as a stale copy. Only tooling (local
 * `next dev`, unit tests, `npm run eval -- --provider configured`, which calls
 * `allowAiSettingsFromEnvironment()`) may take them from the environment, and
 * never on Vercel. `registry.test.ts` checks each is a Platform admin setting;
 * `ai-settings-one-place.test.ts` fails on a direct `process.env` read of one.
 */
export const STORE_ONLY_KEYS: readonly string[] = [
  "WONDERHOME_AI_KEY",
  "WONDERHOME_AI_PROVIDER",
  "WONDERHOME_AI_MODEL",
  "WONDERHOME_AI_UNDERSTANDING_MODEL",
  "WONDERHOME_AI_ANSWER_MODEL",
  "WONDERHOME_AI_INTAKE_MODEL",
  "WONDERHOME_AI_SECOND_READ_MODEL",
  "WONDERHOME_GEMINI_TRANSCRIBE_MODEL",
  "WONDERHOME_SPEECH_KEY",
  "WONDERHOME_GEMINI_LIVE_MODEL",
];

let toolingOptIn = false;

/** Readers that keep a value derived from these settings (the model names) and must re-derive it when they change. */
const listeners = new Set<() => void>();
export function whenSettingsChange(listener: () => void): void {
  listeners.add(listener);
}
function settingsChanged(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // A reader's own problem never stops the others.
    }
  }
}

/** Tooling only (`evaluation/cli.ts`): the AI settings may come from this process's environment. Refused on Vercel. */
export function allowAiSettingsFromEnvironment(): void {
  toolingOptIn = true;
  withoutAi = null;
  merged = null;
  settingsChanged();
}

/** Whether this process is tooling that may read AI settings from its environment. Never on a deployment. */
export function aiSettingsFromEnvironmentAllowed(env: Env = process.env): boolean {
  if (env.VERCEL) return false;
  return toolingOptIn || env.NODE_ENV === "development" || Boolean(env.VITEST);
}

/** The process environment without the store-only names, unless this is tooling. */
function deploymentEnv(): Env {
  if (aiSettingsFromEnvironmentAllowed()) return process.env;
  withoutAi ??= Object.fromEntries(Object.entries(process.env).filter(([key]) => !STORE_ONLY_KEYS.includes(key)));
  return withoutAi;
}
let withoutAi: Env | null = null;
export type StoredSettings = Readonly<Record<string, string>>;

let loader: (() => Promise<StoredSettings>) | null = null;
let overlay: (rows: StoredSettings) => StoredSettings = () => ({});
let stored: StoredSettings = {};
let merged: Env | null = null;
let loadedAt = Number.NEGATIVE_INFINITY;
/** Whether this server has read the saved values at least once (a cold server has not). */
let everLoaded = false;
let refreshing: Promise<void> | null = null;

const TTL_MS = 60_000;

/** Server start: how to read the saved values (the service-role RPC), and which of them to lay over. */
export function useSettingsLoader(load: (() => Promise<StoredSettings>) | null, keep: (rows: StoredSettings) => StoredSettings = () => ({})): void {
  loader = load;
  overlay = keep;
  stored = {};
  merged = null;
  loadedAt = Number.NEGATIVE_INFINITY;
  everLoaded = false;
  refreshing = null;
  withoutAi = null;
  settingsChanged();
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
        everLoaded = true;
        settingsChanged();
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
  const base = deploymentEnv();
  if (Object.keys(stored).length === 0) return base;
  merged ??= { ...base, ...stored };
  return merged;
}

/** Whether the saved settings have been read on this server (else the AI settings read as unset). */
export function savedSettingsLoaded(): boolean {
  return everLoaded;
}

/**
 * For a reader about to send a key: if this server has not yet read the saved
 * settings, wait for them (bounded, retried once), then answer as `runtimeEnv()`.
 * A store that still can't be read leaves the AI settings unset: no key.
 */
export async function runtimeEnvForAi(waitMs = 2_500, now = Date.now()): Promise<Env> {
  if (loader && !everLoaded) {
    for (let attempt = 0; attempt < 2 && !everLoaded; attempt += 1) {
      await Promise.race([refreshRuntimeEnv(Date.now()), new Promise<void>((resolve) => setTimeout(resolve, waitMs).unref?.())]);
    }
  }
  return runtimeEnv(now);
}

/** The same, after waiting for a refresh if the copy is stale: for a request that must see a save just made. */
export async function freshRuntimeEnv(now = Date.now()): Promise<Env> {
  if (loader && now - loadedAt >= TTL_MS) await refreshRuntimeEnv(now);
  return runtimeEnv(now);
}

/**
 * The same, but a server that has never read the saved values waits for that
 * first read (at most `waitMs`) instead of answering with the deployment's
 * variables. Every model call resolves its key through this
 * (`model-key.ts` `currentPlatformKey`): a cold server whose start-up read was
 * slower than instrumentation's three seconds once sent the deployment's old
 * key while the owner's saved one sat unread (2026-11-21). Once read, it never
 * waits again; a stale copy refreshes behind itself as before.
 */
export async function settledRuntimeEnv(waitMs = 5_000, now = Date.now()): Promise<Env> {
  // Since 2026-11-21 (one place) a store that still can't be read leaves the AI settings unset, never the variables.
  return runtimeEnvForAi(waitMs / 2, now);
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
