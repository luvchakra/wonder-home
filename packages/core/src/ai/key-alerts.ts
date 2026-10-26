import { createHash } from "node:crypto";

import type { ModelProvider } from "./model-key";

/**
 * Noticing when a provider stops taking a key (the owner, 2026-10-26: Gemini
 * ran out of credits, and live voice and WhatsApp voice notes stopped with no
 * word to anyone).
 *
 * Every model call goes through `provider-clients.ts`, which reports here what
 * the provider said: a refusal that means the key itself is the problem (out
 * of credits, out of quota, not valid) is recorded by the key's fingerprint in
 * `ai_key_alerts`; a call that works resolves it. The notice pass
 * (`notices.ts` `aiKeyNotices`) matches fingerprints to the household's own
 * keys and tells an Admin, by email too.
 *
 * No provider tells an app a key's balance before it runs out, so this tells
 * the household at the first refusal, not before. It never throws and never
 * slows a call: recording is best effort, and a key is checked for "working
 * again" at most once every few minutes per server.
 */

export type KeyAlertKind = "out_of_credits" | "quota_exhausted" | "key_rejected";

/**
 * What a provider's refusal says about the key, from its status and its own
 * words; null for anything that isn't about the key (a timeout, an overload,
 * a bad request). A per-minute rate limit reads as `quota_exhausted` too —
 * the notice waits until it has lasted, so a passing burst tells nobody.
 */
export function classifyKeyFailure(provider: ModelProvider, status: number | null, text: string): KeyAlertKind | null {
  const said = text.toLowerCase();
  // Words only a spent balance uses. Google says "exceeded your current quota … plan and billing details" for a
  // spent balance and a per-minute limit alike, so that one is a quota refusal, told only once it has lasted.
  if (/credit balance is too low|insufficient[_ ]quota|out of credits|prepayment|billing (has been )?disabled|payment required/.test(said)) return "out_of_credits";
  if (status === 402) return "out_of_credits";
  if (status === 401 || /api key not valid|invalid x-api-key|invalid api key|incorrect api key|api_key_invalid|permission_denied.*api key/.test(said)) return "key_rejected";
  if (status === 429 && (provider === "google" ? /resource_exhausted|quota/.test(said) : /quota/.test(said))) return "quota_exhausted";
  return null;
}

/** The key's SHA-256, as the database computes it from the stored key (`encode(digest(api_key, 'sha256'), 'hex')`). */
export function keyFingerprint(apiKey: string): string {
  return createHash("sha256").update(apiKey, "utf8").digest("hex");
}

type Recorder = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: unknown }>;
};

/** Built on first use and only on a server that has the service role; a test or a client bundle gets none. */
let recorder: Recorder | null | undefined;
async function getRecorder(): Promise<Recorder | null> {
  if (recorder !== undefined) return recorder;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITEST) {
    recorder = null;
    return recorder;
  }
  try {
    const { createAdminClient } = await import("../db/admin");
    recorder = createAdminClient() as unknown as Recorder;
  } catch {
    recorder = null;
  }
  return recorder;
}

/** When each key was last checked for "working again", so a busy server writes at most once every few minutes per key. */
const lastResolved = new Map<string, number>();
const RESOLVE_EVERY_MS = 5 * 60_000;

export async function noteKeyFailure(apiKey: string, provider: ModelProvider, kind: KeyAlertKind): Promise<void> {
  try {
    const db = await getRecorder();
    if (!db) return;
    const fingerprint = keyFingerprint(apiKey);
    lastResolved.delete(fingerprint);
    await db.rpc("record_ai_key_alert", { p_fingerprint: fingerprint, p_provider: provider, p_kind: kind });
  } catch {
    // Best effort: a refusal still reaches the caller as it always did.
  }
}

export async function noteKeyWorking(apiKey: string, now = Date.now()): Promise<void> {
  try {
    const fingerprint = keyFingerprint(apiKey);
    const last = lastResolved.get(fingerprint);
    if (last !== undefined && now - last < RESOLVE_EVERY_MS) return;
    lastResolved.set(fingerprint, now);
    const db = await getRecorder();
    if (!db) return;
    await db.rpc("resolve_ai_key_alert", { p_fingerprint: fingerprint });
  } catch {
    // Best effort.
  }
}

/** A thrown SDK error's status and words, whichever SDK threw it. */
export function failureOf(thrown: unknown): { status: number | null; text: string } {
  const error = thrown as { status?: unknown; code?: unknown; message?: unknown; error?: unknown } | null;
  const status = typeof error?.status === "number" ? error.status : typeof error?.code === "number" ? error.code : null;
  const nested = error?.error ? JSON.stringify(error.error) : "";
  const text = `${typeof error?.message === "string" ? error.message : ""} ${nested}`;
  return { status, text };
}
