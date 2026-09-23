/**
 * Which model key answers for a household, and whose it is.
 *
 * WonderHome runs the assistant on its own key by default, so a family gets
 * a working assistant without holding an account with a model provider. A
 * household that would rather use their own — for their own billing, their
 * own retention terms, their own provider — sets one, and theirs wins.
 *
 * The order is deliberate and is the whole of the policy:
 *
 *   1. The household's own key, if they have configured one.
 *   2. WonderHome's platform key, from the deployment's environment.
 *   3. Neither — and then nothing pretends otherwise. The conversation
 *      engine answers from its deterministic rules and the settings screen
 *      says so, because `CLAUDE.md` is explicit that a provider is live only
 *      once it is configured.
 *
 * Resolution is a pure function of two inputs so the precedence can be
 * tested without a database or an environment.
 */

export const MODEL_PROVIDERS = ["anthropic", "google", "openai"] as const;
export type ModelProvider = (typeof MODEL_PROVIDERS)[number];

/** Where a key came from. The settings screen says this out loud. */
export type KeySource = "household" | "platform" | "none";

export type ModelKey =
  | { source: "household"; provider: ModelProvider; key: string }
  | { source: "platform"; provider: ModelProvider; key: string }
  | { source: "none"; provider: null; key: null };

export type HouseholdKey = { provider: ModelProvider; key: string } | null;
export type PlatformKey = { provider: ModelProvider; key: string } | null;

export function resolveModelKey(household: HouseholdKey, platform: PlatformKey): ModelKey {
  if (household && household.key.trim().length > 0) {
    return { source: "household", provider: household.provider, key: household.key };
  }
  if (platform && platform.key.trim().length > 0) {
    return { source: "platform", provider: platform.provider, key: platform.key };
  }
  return { source: "none", provider: null, key: null };
}

/**
 * WonderHome's own key, from the deployment's environment.
 *
 * There is no platform administration screen to set this on — the platform
 * boundary is API routes only — so it is an environment variable, and the
 * settings screen tells an operator exactly that rather than pointing at a
 * page that does not exist.
 */
export function platformKey(
  env: Record<string, string | undefined> = process.env,
): PlatformKey {
  const key = env.WONDERHOME_AI_KEY?.trim();
  if (!key) return null;

  const named = env.WONDERHOME_AI_PROVIDER?.trim().toLowerCase() ?? "";
  const provider = PROVIDER_NAMES[named] ?? providerOfKey(key) ?? "anthropic";

  return { provider, key };
}

/**
 * What an operator might reasonably write for each provider. "gemini" is
 * what anyone holding a Gemini key types; reading it as "not a provider"
 * once sent a Google key to Anthropic, which refused it with a 401 and left
 * every household without a key of its own understanding nothing.
 */
const PROVIDER_NAMES: Record<string, ModelProvider> = {
  anthropic: "anthropic",
  claude: "anthropic",
  google: "google",
  gemini: "google",
  "google gemini": "google",
  openai: "openai",
  gpt: "openai",
  chatgpt: "openai",
};

/**
 * The provider a key's own format names, when the environment does not
 * name one we recognise. Only the documented prefixes count; anything else
 * is not guessed at.
 */
function providerOfKey(key: string): ModelProvider | null {
  if (key.startsWith("sk-ant-")) return "anthropic";
  if (key.startsWith("AIza")) return "google";
  if (key.startsWith("sk-")) return "openai";
  return null;
}

/** What a household is told about where its assistant's intelligence comes from. */
export function describeKeySource(
  source: KeySource,
): { title: string; detail: string; tone: "handled" | "neutral" | "attention" } {
  switch (source) {
    case "household":
      return {
        title: "Your household's own key",
        detail:
          "Requests are billed to your provider account and are covered by your agreement with them, not ours.",
        tone: "handled",
      };
    case "platform":
      return {
        title: "WonderHome's key",
        detail:
          "Included with your plan. Your household's data is never used to train models.",
        tone: "handled",
      };
    case "none":
      return {
        title: "No model configured",
        detail:
          "The assistant still works: it answers from WonderHome's own rules rather than a language model, and never pretends to have understood more than it did.",
        tone: "attention",
      };
  }
}
