/**
 * Which speech key answers for a household, and whose it is.
 *
 * The same bargain `ai/model-key.ts` strikes for the model, for the same
 * reasons. WonderHome runs speech on its own Google Cloud project by
 * default, so a family gets a voice that understands them without holding
 * a cloud account, enabling APIs or pasting a credential — that is a
 * developer's errand, not something anybody should do to be heard in their
 * own home.
 *
 * A household that would rather use their own — their own billing, their
 * own quotas, their own agreement with Google, their own data-handling
 * terms — sets one, and theirs wins.
 *
 * The order is the whole of the policy:
 *
 *   1. The household's own key, if they have configured one.
 *   2. WonderHome's platform key, from the deployment's environment.
 *   3. Neither — and then nothing pretends otherwise. Speech falls back to
 *      whatever the browser can do on its own, and the settings screen says
 *      exactly that.
 *
 * Resolution is a pure function of its two inputs, so the precedence can be
 * tested without a database or an environment.
 */

export type SpeechKeySource = "household" | "platform" | "none";

export type SpeechKey =
  | { source: "household"; provider: "google"; key: string }
  | { source: "platform"; provider: "google"; key: string }
  | { source: "none"; provider: null; key: null };

/** WonderHome's own speech key, from the deployment's environment. */
export function platformSpeechKey(env: Record<string, string | undefined> = process.env): string | null {
  const key = env.WONDERHOME_SPEECH_KEY?.trim();
  return key ? key : null;
}

export function resolveSpeechKey(household: string | null, platform: string | null): SpeechKey {
  if (household && household.trim().length > 0) {
    return { source: "household", provider: "google", key: household.trim() };
  }
  if (platform && platform.trim().length > 0) {
    return { source: "platform", provider: "google", key: platform.trim() };
  }
  return { source: "none", provider: null, key: null };
}

/** What a household is told about whose servers hear them. */
export function describeSpeechSource(source: SpeechKeySource): {
  title: string;
  detail: string;
  tone: "handled" | "attention";
} {
  switch (source) {
    case "household":
      return {
        title: "Your household's own Google key",
        detail:
          "Speech is billed to your Google Cloud account and covered by your agreement with them, not ours. Your allowances are your own.",
        tone: "handled",
      };
    case "platform":
      return {
        title: "WonderHome's speech service",
        detail: "Included with your plan. Nothing to set up, and no Google account of your own.",
        tone: "handled",
      };
    case "none":
      return {
        title: "No speech service configured",
        detail:
          "WonderHome still listens and answers using whatever your browser provides. That is free, varies by device, and barely works in Safari.",
        tone: "attention",
      };
  }
}
