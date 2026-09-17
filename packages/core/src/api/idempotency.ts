import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "./errors";

/**
 * Idempotency for side-effecting endpoints (story 18-004).
 *
 * A retry must not charge a card twice, send a second invitation or create a
 * duplicate household. The client sends an Idempotency-Key; the first request
 * under that key runs and its response is recorded, and any repeat returns the
 * recorded response without executing anything.
 *
 * Two rules make this trustworthy rather than merely convenient:
 *
 *   * A key is scoped to the household and the endpoint, so the same key used
 *     against a different operation is a new operation, not a false hit.
 *   * The request body is fingerprinted. Reusing a key with a different payload
 *     is a client bug, and returning the old response would hide it, so it is
 *     refused with a conflict instead.
 */

const HEADER = "idempotency-key";

export const IDEMPOTENCY_HEADER = HEADER;

/** Keys live long enough to cover retries, not forever. */
export const IDEMPOTENCY_TTL_HOURS = 24;

export function idempotencyKeyFrom(headers: Headers): string | null {
  const raw = headers.get(HEADER);
  if (!raw) return null;

  const key = raw.trim();
  if (key.length < 8 || key.length > 255) {
    throw ApiError.badRequest("Idempotency-Key must be between 8 and 255 characters.");
  }
  if (!/^[A-Za-z0-9._:-]+$/.test(key)) {
    throw ApiError.badRequest("Idempotency-Key may contain only letters, digits, . _ : and -");
  }
  return key;
}

export async function fingerprint(endpoint: string, body: unknown): Promise<string> {
  const payload = `${endpoint}\n${stableStringify(body)}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Key order must not change the fingerprint, or retries look like new requests. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);

  return `{${entries.join(",")}}`;
}

export type RecordedResponse = { status: number; body: unknown };

export type IdempotencyStore = {
  lookup(key: string, endpoint: string): Promise<{ requestHash: string; response: RecordedResponse } | null>;
  record(input: {
    key: string;
    endpoint: string;
    requestHash: string;
    response: RecordedResponse;
  }): Promise<void>;
};

/**
 * Runs `operation` at most once per key.
 *
 * With no key the operation simply runs: idempotency is opt-in per request, so
 * an endpoint does not silently change behaviour for clients that never asked.
 */
export async function withIdempotency<T>(
  store: IdempotencyStore | null,
  input: { key: string | null; endpoint: string; body: unknown },
  operation: () => Promise<RecordedResponse & { result?: T }>,
): Promise<RecordedResponse> {
  if (!store || !input.key) {
    const { status, body } = await operation();
    return { status, body };
  }

  const requestHash = await fingerprint(input.endpoint, input.body);
  const existing = await store.lookup(input.key, input.endpoint);

  if (existing) {
    if (existing.requestHash !== requestHash) {
      throw new ApiError(
        "conflict",
        "This Idempotency-Key was already used with a different request body.",
      );
    }
    return existing.response;
  }

  const { status, body } = await operation();

  // Only successful outcomes are worth replaying: a failure should be allowed
  // to be retried properly rather than permanently cached as an error.
  if (status < 400) {
    await store.record({ key: input.key, endpoint: input.endpoint, requestHash, response: { status, body } });
  }

  return { status, body };
}

/** Supabase-backed store. Scoped to one household, so keys cannot collide across tenants. */
export function supabaseIdempotencyStore(
  supabase: SupabaseClient,
  householdId: string,
): IdempotencyStore {
  return {
    async lookup(key, endpoint) {
      const { data, error } = await supabase
        .from("idempotency_keys")
        .select("request_hash, response_status, response_body")
        .eq("household_id", householdId)
        .eq("key", key)
        .eq("endpoint", endpoint)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (error) throw new Error(`idempotency lookup failed: ${error.code ?? "unknown"}`);
      if (!data) return null;

      return {
        requestHash: data.request_hash as string,
        response: { status: data.response_status as number, body: data.response_body },
      };
    },

    async record({ key, endpoint, requestHash, response }) {
      const expiresAt = new Date(Date.now() + IDEMPOTENCY_TTL_HOURS * 3_600_000).toISOString();
      const { error } = await supabase.from("idempotency_keys").insert({
        household_id: householdId,
        key,
        endpoint,
        request_hash: requestHash,
        response_status: response.status,
        response_body: response.body,
        expires_at: expiresAt,
      });

      // A concurrent duplicate lost the race; the winner's response stands.
      if (error && error.code !== "23505") {
        throw new Error(`idempotency record failed: ${error.code ?? "unknown"}`);
      }
    },
  };
}
