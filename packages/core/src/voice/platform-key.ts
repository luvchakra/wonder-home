/**
 * The speech key, which belongs to the deployment rather than to a family.
 *
 * Speech is infrastructure: one Google Cloud project, one bill, one set of
 * quotas, configured once by whoever runs WonderHome. Asking every
 * household to go and create their own API key was the wrong shape for it
 * — that is a developer's errand, not something a family should have to do
 * to be understood when they talk.
 *
 * So this mirrors `ai/model-key.ts`'s platform half exactly: an
 * environment variable, read on the server, never rendered and never sent
 * to a browser. There is no platform administration screen to set it on,
 * because the platform boundary here is API routes only, and the settings
 * screen says so plainly rather than pointing at a page that does not
 * exist.
 *
 * What stays with the household is everything about *how* it sounds —
 * language, voice, rate, pitch, the words to expect. Those are
 * preferences, they differ per home, and they live in
 * `household_voice_settings`.
 */

export type SpeechKey = { provider: "google"; key: string } | null;

/** The deployment's own speech key, or null when none is configured. */
export function platformSpeechKey(env: Record<string, string | undefined> = process.env): SpeechKey {
  const key = env.WONDERHOME_SPEECH_KEY?.trim();
  if (!key) return null;
  return { provider: "google", key };
}

/** Whether this deployment can speak and listen at all, for a screen to say out loud. */
export function speechConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return platformSpeechKey(env) !== null;
}
