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
  "WONDERHOME_GEMINI_VOICE_KEY",
  "WONDERHOME_GEMINI_LIVE_MODEL",
];

export type StoredSettings = Readonly<Record<string, string>>;

/**
 * This server's copy of the saved settings. It lives on `globalThis`, not in
 * this module: Next compiles `instrumentation.ts` (which registers the loader)
 * and each route into separate module graphs, so a module-level `let` gave
 * every route its own copy with no loader, and a route read the deployment's
 * variables only, never a value saved in Platform admin (the WhatsApp outage,
 * 2026-11-22: the app secret saved there, absent from Vercel, never reached
 * the webhook). One object per process, whichever copy of this module asks.
 */
type RuntimeEnvState = {
  toolingOptIn: boolean;
  listeners: Set<() => void>;
  withoutAi: Env | null;
  loader: (() => Promise<StoredSettings>) | null;
  overlay: (rows: StoredSettings) => StoredSettings;
  stored: StoredSettings;
  merged: Env | null;
  loadedAt: number;
  /** Whether this server has read the saved values at least once (a cold server has not). */
  everLoaded: boolean;
  refreshing: Promise<void> | null;
  lastForcedAt: number;
};
const STATE_KEY = Symbol.for("wonderhome.platform-settings.runtime-env");
const state: RuntimeEnvState = ((globalThis as Record<symbol, unknown>)[STATE_KEY] as RuntimeEnvState | undefined) ??
  ((globalThis as Record<symbol, unknown>)[STATE_KEY] = {
    toolingOptIn: false,
    listeners: new Set(),
    withoutAi: null,
    loader: null,
    overlay: () => ({}),
    stored: {},
    merged: null,
    loadedAt: Number.NEGATIVE_INFINITY,
    everLoaded: false,
    refreshing: null,
    lastForcedAt: Number.NEGATIVE_INFINITY,
  } satisfies RuntimeEnvState) as RuntimeEnvState;

/** Readers that keep a value derived from these settings (the model names) and must re-derive it when they change. */
export function whenSettingsChange(listener: () => void): void {
  state.listeners.add(listener);
}
function settingsChanged(): void {
  for (const listener of state.listeners) {
    try {
      listener();
    } catch {
      // A reader's own problem never stops the others.
    }
  }
}

/** Tooling only (`evaluation/cli.ts`): the AI settings may come from this process's environment. Refused on Vercel. */
export function allowAiSettingsFromEnvironment(): void {
  state.toolingOptIn = true;
  state.withoutAi = null;
  state.merged = null;
  settingsChanged();
}

/** Whether this process is tooling that may read AI settings from its environment. Never on a deployment. */
export function aiSettingsFromEnvironmentAllowed(env: Env = process.env): boolean {
  if (env.VERCEL) return false;
  return state.toolingOptIn || env.NODE_ENV === "development" || Boolean(env.VITEST);
}

/** The process environment without the store-only names, unless this is tooling. */
function deploymentEnv(): Env {
  if (aiSettingsFromEnvironmentAllowed()) return process.env;
  state.withoutAi ??= Object.fromEntries(Object.entries(process.env).filter(([key]) => !STORE_ONLY_KEYS.includes(key)));
  return state.withoutAi;
}

const TTL_MS = 60_000;

/** Server start: how to read the saved values (the service-role RPC), and which of them to lay over. */
export function useSettingsLoader(load: (() => Promise<StoredSettings>) | null, keep: (rows: StoredSettings) => StoredSettings = () => ({})): void {
  state.loader = load;
  state.overlay = keep;
  state.stored = {};
  state.merged = null;
  state.loadedAt = Number.NEGATIVE_INFINITY;
  state.everLoaded = false;
  state.refreshing = null;
  state.withoutAi = null;
  state.lastForcedAt = Number.NEGATIVE_INFINITY;
  settingsChanged();
}

/** Loads the saved values now (shared by concurrent callers). A failed read keeps what was there. */
export function refreshRuntimeEnv(now = Date.now()): Promise<void> {
  if (!state.loader) return Promise.resolve();
  if (state.refreshing) return state.refreshing;
  const load = state.loader;
  const keep = state.overlay;
  state.refreshing = keptPerServer("platform_config", async () => ({ value: await load(), keep: true }), now)
    .then(
      (rows) => {
        state.stored = keep(rows);
        state.merged = null;
        state.loadedAt = now;
        state.everLoaded = true;
        settingsChanged();
      },
      () => {
        // The store could not be read: keep the last values (or the plain
        // environment) and try again on the next read after a short pause.
        state.loadedAt = now - TTL_MS + 5_000;
      },
    )
    .finally(() => {
      state.refreshing = null;
    });
  return state.refreshing;
}

/** The environment to read a setting from, now. Never waits; refreshes behind itself when stale. */
export function runtimeEnv(now = Date.now()): Env {
  if (state.loader && now - state.loadedAt >= TTL_MS) void refreshRuntimeEnv(now);
  const base = deploymentEnv();
  if (Object.keys(state.stored).length === 0) return base;
  state.merged ??= { ...base, ...state.stored };
  return state.merged;
}

/** Whether the saved settings have been read on this server (else the AI settings read as unset). */
export function savedSettingsLoaded(): boolean {
  return state.everLoaded;
}

/**
 * For a reader about to send a key: if this server has not yet read the saved
 * settings, wait for them (bounded, retried once), then answer as `runtimeEnv()`.
 * A store that still can't be read leaves the AI settings unset: no key.
 */
export async function runtimeEnvForAi(waitMs = 2_500, now = Date.now()): Promise<Env> {
  if (state.loader && !state.everLoaded) {
    for (let attempt = 0; attempt < 2 && !state.everLoaded; attempt += 1) {
      await Promise.race([refreshRuntimeEnv(Date.now()), new Promise<void>((resolve) => setTimeout(resolve, waitMs).unref?.())]);
    }
  }
  return runtimeEnv(now);
}

/**
 * For a webhook checking a caller with a secret saved in Platform admin (the
 * WhatsApp app secret, the payment and email webhook secrets): a cold server
 * waits, bounded, for its first read of the store, so a secret saved there is
 * never missed for the deployment's (possibly absent) variable.
 */
export function settledSettingsEnv(waitMs = 2_500): Promise<Env> {
  return runtimeEnvForAi(waitMs);
}

/** The same, after waiting for a refresh if the copy is stale: for a request that must see a save just made. */
export async function freshRuntimeEnv(now = Date.now()): Promise<Env> {
  if (state.loader && now - state.loadedAt >= TTL_MS) await refreshRuntimeEnv(now);
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

/** Where this server's saved settings stand, for a refusal that must say why (never a value). */
export type SettingsStoreState = "loaded" | "not_loaded" | "no_loader";
export function settingsStoreState(): SettingsStoreState {
  if (!state.loader) return "no_loader";
  return state.everLoaded ? "loaded" : "not_loaded";
}

/**
 * For a webhook about to refuse a caller for a missing setting: read the store
 * again now (bounded) rather than answer from a copy that may predate a save
 * on another server. At most once every ten seconds per server, so a caller
 * retrying a refused delivery cannot turn into a read per request.
 */
export async function reloadedSettingsEnv(waitMs = 2_500, now = Date.now()): Promise<Env> {
  if (state.loader && now - state.lastForcedAt >= 10_000) {
    state.lastForcedAt = now;
    forgetRuntimeEnv();
    await Promise.race([refreshRuntimeEnv(now), new Promise<void>((resolve) => setTimeout(resolve, waitMs).unref?.())]);
  }
  return runtimeEnv(now);
}

/** After a save on this server: drop the kept copy so the next read loads the new value. */
export function forgetRuntimeEnv(): void {
  forgetPlatformData("platform_config");
  state.loadedAt = Number.NEGATIVE_INFINITY;
}

/** Which keys have a saved value laid over the environment, for the admin screens. */
export function savedKeys(): readonly string[] {
  return Object.keys(state.stored);
}
