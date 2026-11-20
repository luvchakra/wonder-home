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
 * keys and tells an Admin, by email too; an alert on the platform's own key goes
 * to the platform admins (`platform-key-alert.ts`).
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

/**
 * Where a key that reaches a provider came from, so an alert can say which
 * copy is being refused (owner, 2026-11-21) — never anything of the key itself.
 * `platform_saved`: Platform admin. `household` / `household_voice`: a home's
 * own key. `tooling`: a developer's environment (local dev, `npm run eval`).
 * Since 2026-11-21 no deployment variable or GitHub secret reaches a provider,
 * so those two are kept only to label alerts recorded before.
 */
export const KEY_ORIGINS = ["platform_saved", "household", "household_voice", "tooling", "deployment_variable", "github_secret"] as const;
export type KeyOrigin = (typeof KEY_ORIGINS)[number];

/** This server's memory only (keys already live in it while a call is made); never stored, logged or sent. */
const origins = new Map<string, KeyOrigin>();

/** Called by the one resolution (`model-key.ts`, `credentials.ts`) as it hands a key out. Cheap on repeat. */
export function noteKeyOrigin(apiKey: string, origin: KeyOrigin): void {
  if (origins.get(apiKey) === origin) return;
  if (origins.size > 500) origins.clear();
  origins.set(apiKey, origin);
}

/** Where a key came from, if the resolution handed it out on this server. */
export function originOfKey(apiKey: string): KeyOrigin | null {
  return origins.get(apiKey) ?? null;
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

/**
 * Keys a provider refused on this server, until when they are not sent again.
 * A refused key fails every call the same way, so one reading's several steps
 * (OCR, a read, a stronger read) answered one by one only delayed the
 * household's reply. Out of quota is not held: a per-minute limit passes.
 */
const refusedUntil = new Map<string, number>();
const HOLD_REFUSED_MS = 60_000;

export function keyRefusedRecently(apiKey: string, now = Date.now()): boolean {
  const until = refusedUntil.get(keyFingerprint(apiKey));
  return until !== undefined && now < until;
}

/** What a held key's call answers instead of reaching the provider: a refusal the SDKs never retry. */
export function refusedResponse(provider: ModelProvider): Response {
  const body = provider === "anthropic"
    ? { type: "error", error: { type: "authentication_error", message: "This key was refused a moment ago; not sent again yet." } }
    : { error: { message: "This key was refused a moment ago; not sent again yet.", type: "invalid_request_error", code: "invalid_api_key" } };
  return new Response(JSON.stringify(body), { status: 401, headers: { "content-type": "application/json", "x-wonderhome-held": "1" } });
}

/** For tests: forget every held key. */
export function forgetRefusedKeys(): void {
  refusedUntil.clear();
}

export async function noteKeyFailure(apiKey: string, provider: ModelProvider, kind: KeyAlertKind, now = Date.now()): Promise<void> {
  if (kind !== "quota_exhausted") refusedUntil.set(keyFingerprint(apiKey), now + HOLD_REFUSED_MS);
  try {
    const db = await getRecorder();
    if (!db) return;
    const fingerprint = keyFingerprint(apiKey);
    lastResolved.delete(fingerprint);
    const source = origins.get(apiKey) ?? null;
    const { error } = await db.rpc("record_ai_key_alert", { p_fingerprint: fingerprint, p_provider: provider, p_kind: kind, p_source: source });
    // Before migration 20261121000000 the function takes three arguments: record without the source.
    if (error && ["PGRST202", "42883"].includes((error as { code?: string }).code ?? "")) {
      await db.rpc("record_ai_key_alert", { p_fingerprint: fingerprint, p_provider: provider, p_kind: kind });
    }
  } catch {
    // Best effort: a refusal still reaches the caller as it always did.
  }
}

export async function noteKeyWorking(apiKey: string, now = Date.now(), force = false): Promise<void> {
  try {
    const fingerprint = keyFingerprint(apiKey);
    refusedUntil.delete(fingerprint);
    const last = lastResolved.get(fingerprint);
    if (!force && last !== undefined && now - last < RESOLVE_EVERY_MS) return;
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
