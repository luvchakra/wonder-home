import type { LiveEngine } from "./settings";

/**
 * The single source of truth for which engine runs a live conversation
 * (voice phase 3 follow-up, 2026-10-29).
 *
 * The choice used to live in two places that disagreed — the composer's
 * browser localStorage and the household-wide default on
 * `household_voice_settings.live_engine`. It is now one per-member value
 * (`household_members.live_engine`), with the household setting as the seed a
 * member inherits before they choose. These pure helpers are what the
 * composer, the Voice settings page and the HomeTalk page all read through,
 * so the "effective engine" is computed one way everywhere.
 */

/** This member's own choice if they made one, otherwise the household default. */
export function effectiveLiveEngine(
  memberChoice: LiveEngine | null | undefined,
  householdDefault: LiveEngine,
): LiveEngine {
  return memberChoice ?? householdDefault;
}

/**
 * Gemini Live is never left as the running choice once the server says it may
 * not run (no key, out of credits, consent off, plan or rollout). The control
 * still shows the fallback rather than a dead button (design rule 10); the
 * token route re-checks availability on every session regardless.
 */
export function gateLiveEngine(engine: LiveEngine, geminiAvailable: boolean): LiveEngine {
  return engine === "gemini_live" && !geminiAvailable ? "wonderhome" : engine;
}

/**
 * What the composer should show on first render, reconciling the server value
 * with the browser's old local cache.
 *
 * - When the server already holds this member's own explicit choice, it wins:
 *   the cache may be stale from another device and is ignored.
 * - When the server holds no choice yet but the browser does (the localStorage
 *   the composer used to keep before this became server-side), adopt it and
 *   report it as `migrate` so the caller can persist it up to the server once,
 *   so it shows in Settings too and survives the next device.
 *
 * The returned `engine` is already gated for Gemini availability.
 */
export function resolveInitialEngine(input: {
  server: LiveEngine;
  explicit: boolean;
  stored: string | null;
  geminiAvailable: boolean;
}): { engine: LiveEngine; migrate: LiveEngine | null } {
  if (!input.explicit && (input.stored === "wonderhome" || input.stored === "gemini_live")) {
    const wanted = input.stored;
    return { engine: gateLiveEngine(wanted, input.geminiAvailable), migrate: wanted };
  }
  return { engine: gateLiveEngine(input.server, input.geminiAvailable), migrate: null };
}

/**
 * The one-line description under the Voice settings engine picker, tracking
 * the *selected* option rather than whatever happens to be available — the
 * screenshot bug the owner caught, where "WonderHome" was selected but the
 * hint described Gemini Live (the owner, 2026-10-29).
 */
export function liveEngineHint(
  selected: LiveEngine,
  opts: {
    engines: { wonderhome: { name: string; detail: string }; gemini_live: { name: string; detail: string } };
    geminiHears: string;
    /** "Gemini Live is not available: {reason}" — `{reason}` is filled here. */
    geminiUnavailable: string;
    geminiAvailable: boolean;
    geminiReason?: string | null;
  },
): string {
  if (selected === "gemini_live") {
    if (opts.geminiAvailable) return `${opts.engines.gemini_live.detail} ${opts.geminiHears}`;
    return opts.geminiReason
      ? `${opts.engines.gemini_live.detail} ${opts.geminiUnavailable.replace("{reason}", opts.geminiReason)}`
      : opts.engines.gemini_live.detail;
  }
  return opts.engines.wonderhome.detail;
}
