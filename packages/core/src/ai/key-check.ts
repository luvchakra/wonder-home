import { classifyKeyFailure, keyFingerprint, type KeyAlertKind } from "./key-alerts";
import { providerOfKey, type ModelProvider } from "./model-key";

/**
 * Checking a model key the moment it is saved, and on "Test key" (2026-11-21:
 * a refused key sat saved as WonderHome's own for six days while every family
 * was answered by rules alone, and the platform admin card said nothing).
 *
 * The cheapest call each provider authenticates: listing one model. It costs
 * nothing, reads nothing of any household, and tells a refused key from a
 * working one. It cannot tell a spent balance (only a real call can), which
 * the alert on the first refused call still catches. Server-side only; the key
 * is sent to its provider and nowhere else, and never logged.
 */

export type KeyCheck =
  | { ok: true; provider: ModelProvider }
  /** The key's own format names another provider than the one chosen. Nothing was sent. */
  | { ok: false; reason: "mismatch"; provider: ModelProvider; looksLike: ModelProvider }
  /** The provider answered and refused it. */
  | { ok: false; reason: "refused"; provider: ModelProvider; kind: KeyAlertKind }
  /** The provider could not be reached or answered something else: not a verdict on the key. */
  | { ok: false; reason: "unreachable"; provider: ModelProvider };

const CHECK_TIMEOUT_MS = 8_000;

function request(provider: ModelProvider, key: string): { url: string; headers: Record<string, string> } {
  switch (provider) {
    case "anthropic":
      return { url: "https://api.anthropic.com/v1/models?limit=1", headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } };
    case "google":
      // In a header, never the URL, so the key can't land in a log line.
      return { url: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", headers: { "x-goog-api-key": key } };
    case "openai":
      return { url: "https://api.openai.com/v1/models", headers: { authorization: `Bearer ${key}` } };
  }
}

export async function checkModelKey(provider: ModelProvider, key: string, fetchImpl: typeof fetch = fetch): Promise<KeyCheck> {
  const trimmed = key.trim();
  const looksLike = providerOfKey(trimmed);
  // Only a documented prefix counts ("sk-ant-" is read as Anthropic before "sk-" as OpenAI); anything else is sent.
  if (looksLike && looksLike !== provider) {
    return { ok: false, reason: "mismatch", provider, looksLike };
  }
  const { url, headers } = request(provider, trimmed);
  try {
    const response = await fetchImpl(url, { method: "GET", headers, signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
    if (response.ok) return { ok: true, provider };
    const text = await response.text().catch(() => "");
    const kind = classifyKeyFailure(provider, response.status, text) ?? (response.status === 403 ? "key_rejected" : null);
    if (kind && kind !== "quota_exhausted") return { ok: false, reason: "refused", provider, kind };
    return { ok: false, reason: "unreachable", provider };
  } catch {
    return { ok: false, reason: "unreachable", provider };
  }
}

const NAME: Record<ModelProvider, string> = { anthropic: "Anthropic", google: "Google", openai: "OpenAI" };

/** The card's words for a check, with the one thing to do. Never any of the key. */
export function keyCheckWords(check: KeyCheck): { tone: "info" | "risk"; message: string } {
  if (check.ok) return { tone: "info", message: `${NAME[check.provider]} accepted this key.` };
  switch (check.reason) {
    case "mismatch":
      return {
        tone: "risk",
        message: `This looks like a ${NAME[check.looksLike]} key but the provider is set to ${NAME[check.provider]}. Set the provider to ${NAME[check.looksLike]}, or paste ${check.provider === "anthropic" || check.provider === "openai" ? "an" : "a"} ${NAME[check.provider]} key.`,
      };
    case "refused":
      return {
        tone: "risk",
        message:
          check.kind === "out_of_credits"
            ? `${NAME[check.provider]} refused this key: its account is out of credit. Add credit in ${NAME[check.provider]}'s billing page, then test again.`
            : `${NAME[check.provider]} refused this key. Create a new key in ${NAME[check.provider]}'s console and save it here.`,
      };
    case "unreachable":
      return { tone: "risk", message: `${NAME[check.provider]} couldn't be reached to check the key just now. Test it again in a minute.` };
  }
}

/** The fingerprint the alerts use, for a key that was just checked. */
export function fingerprintOf(key: string): string {
  return keyFingerprint(key.trim());
}
