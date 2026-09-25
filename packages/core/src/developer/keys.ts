import { createHash, randomBytes } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { auditChange } from "../api/audit";
import { ApiError } from "../api/errors";
import { hitRateLimit } from "../security/rate-limit";

/**
 * Partner keys (story 18-008).
 *
 * A key is a household's, created by one of its Admins, and says exactly what
 * it may do (`scopes`, which only ever narrow). It is shown once: only its
 * SHA-256 hash is kept, plus a short prefix so a person can tell keys apart. A
 * sandbox key (`whk_test_…`) reads fixtures and writes nothing, so an
 * integration can be built without touching a family's records. The whole
 * surface is off unless a deployment sets `WONDERHOME_DEVELOPER_API=on`.
 */

export const PARTNER_SCOPES = ["household.read", "groceries.read", "groceries.write"] as const;
export type PartnerScope = (typeof PARTNER_SCOPES)[number];
export type KeyEnvironment = "sandbox" | "live";

export const SCOPE_WORDS: Record<PartnerScope, string> = {
  "household.read": "See the household's name, time zone and how many people are in it",
  "groceries.read": "See what is on the grocery list",
  "groceries.write": "Add things to the grocery list",
};

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const KEY_PATTERN = /^whk_(test|live)_[A-Za-z0-9]{40}$/;

export function developerApiEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.WONDERHOME_DEVELOPER_API === "on";
}

/** A fresh key: 40 characters from a CSPRNG, about 238 bits. */
export function generateKey(environment: KeyEnvironment): string {
  let body = "";
  while (body.length < 40) {
    for (const byte of randomBytes(48)) {
      // 256 is not a multiple of 62: bytes from 248 up would bias the draw, so they are skipped.
      if (byte < 248 && body.length < 40) body += ALPHABET[byte % 62];
    }
  }
  return `whk_${environment === "sandbox" ? "test" : "live"}_${body}`;
}

export function hashKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

/** What a person sees to recognise a key: the environment and the first four characters. */
export function keyPrefix(key: string): string {
  return key.slice(0, 13);
}

/** The key in an `Authorization: Bearer …` header, only when it has a key's exact shape. */
export function keyFromHeader(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  const key = match?.[1] ?? null;
  return key && KEY_PATTERN.test(key) ? key : null;
}

export function isScope(value: string): value is PartnerScope {
  return (PARTNER_SCOPES as readonly string[]).includes(value);
}

export type PartnerActor = { keyId: string; householdId: string; environment: KeyEnvironment; scopes: readonly PartnerScope[] };

/** Whether a key row may be used now. Pure, so the rule is tested on its own. */
export function keyIsUsable(row: { revoked_at: string | null; expires_at: string | null }, now: Date): boolean {
  if (row.revoked_at) return false;
  return !row.expires_at || new Date(row.expires_at).getTime() > now.getTime();
}

/**
 * Who is calling, from the request's key. Every failure looks the same from
 * outside — no key, a wrong key, a revoked one and an expired one are all a
 * plain 401 — so nobody learns which keys exist.
 */
export async function authenticatePartner(admin: SupabaseClient, request: Request, now: Date = new Date()): Promise<PartnerActor> {
  // Switched off, no key is valid: the same 401 as any bad key, so an
  // anonymous caller learns nothing about whether the API is on.
  const key = keyFromHeader(request.headers.get("authorization"));
  if (!key || !developerApiEnabled()) throw ApiError.unauthenticated("A valid partner key is required.");
  const { data, error } = await admin
    .from("developer_api_keys")
    .select("id, household_id, environment, scopes, revoked_at, expires_at, last_used_at")
    .eq("key_hash", hashKey(key))
    .maybeSingle();
  if (error) throw new Error(`partner key lookup failed: ${error.code ?? "unknown"}`);
  const row = data as Record<string, unknown> | null;
  if (!row || !keyIsUsable(row as { revoked_at: string | null; expires_at: string | null }, now)) {
    throw ApiError.unauthenticated("A valid partner key is required.");
  }
  const actor: PartnerActor = {
    keyId: row.id as string,
    householdId: row.household_id as string,
    environment: row.environment as KeyEnvironment,
    scopes: ((row.scopes as string[]) ?? []).filter(isScope),
  };
  if (!(await hitRateLimit(admin, "partner.request", actor.keyId))) {
    throw new ApiError("rate_limited", "Too many requests with this key. Nothing was lost; try again in a minute.");
  }
  // "Last used" to the minute is enough for a person, and keeps a busy key from writing on every call.
  const last = row.last_used_at ? new Date(row.last_used_at as string).getTime() : 0;
  if (now.getTime() - last > 60_000) await admin.from("developer_api_keys").update({ last_used_at: now.toISOString() }).eq("id", actor.keyId);
  return actor;
}

export function requireScope(actor: PartnerActor, scope: PartnerScope): void {
  if (!actor.scopes.includes(scope)) throw ApiError.forbidden(`This key does not have the ${scope} scope.`);
}

export type DeveloperKeySummary = {
  id: string;
  name: string;
  environment: KeyEnvironment;
  prefix: string;
  scopes: PartnerScope[];
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

/** A household's keys, newest first, never with a hash. The caller has already checked the Admin. */
export async function listDeveloperKeys(admin: SupabaseClient, householdId: string): Promise<DeveloperKeySummary[]> {
  const { data, error } = await admin
    .from("developer_api_keys")
    .select("id, name, environment, key_prefix, scopes, created_at, expires_at, last_used_at, revoked_at")
    .eq("household_id", householdId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`listDeveloperKeys failed: ${error.code ?? "unknown"}`);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    environment: row.environment as KeyEnvironment,
    prefix: row.key_prefix as string,
    scopes: ((row.scopes as string[]) ?? []).filter(isScope),
    createdAt: row.created_at as string,
    expiresAt: (row.expires_at as string | null) ?? null,
    lastUsedAt: (row.last_used_at as string | null) ?? null,
    revokedAt: (row.revoked_at as string | null) ?? null,
  }));
}

/** At most this many live keys a household holds at once. */
export const MAX_ACTIVE_KEYS = 10;

/**
 * Creates a key and returns it — the only time the full key exists outside the
 * caller's own copy. The caller has already checked that the actor is an Admin.
 */
export async function createDeveloperKey(
  admin: SupabaseClient,
  input: { householdId: string; memberId: string; name: string; environment: KeyEnvironment; scopes: readonly PartnerScope[]; expiresInDays: number | null },
  now: Date = new Date(),
): Promise<{ id: string; key: string }> {
  const scopes = [...new Set(input.scopes)].filter(isScope);
  if (scopes.length === 0) throw ApiError.badRequest("Choose at least one thing the key may do.");
  const { count } = await admin.from("developer_api_keys").select("id", { count: "exact", head: true }).eq("household_id", input.householdId).is("revoked_at", null);
  if ((count ?? 0) >= MAX_ACTIVE_KEYS) throw ApiError.conflict(`A household can hold ${MAX_ACTIVE_KEYS} keys at once. Revoke one you no longer use first.`);

  const key = generateKey(input.environment);
  const expiresAt = input.expiresInDays ? new Date(now.getTime() + input.expiresInDays * 86_400_000).toISOString() : null;
  const { data, error } = await admin
    .from("developer_api_keys")
    .insert({
      household_id: input.householdId,
      name: input.name.trim(),
      environment: input.environment,
      key_prefix: keyPrefix(key),
      key_hash: hashKey(key),
      scopes,
      created_by_member_id: input.memberId,
      created_at: now.toISOString(),
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (error) throw new Error(`createDeveloperKey failed: ${error.code ?? "unknown"}`);
  const id = (data as { id: string }).id;
  await auditChange({
    householdId: input.householdId,
    eventType: "developer_key.created",
    actorMemberId: input.memberId,
    targetTable: "developer_api_keys",
    targetId: id,
    // Never the key or its hash: which environment and what it may do.
    metadata: { environment: input.environment, scopes, expiresInDays: input.expiresInDays },
  });
  return { id, key };
}

/** Revokes a key. Kept, never deleted, so its history stays readable. */
export async function revokeDeveloperKey(admin: SupabaseClient, input: { householdId: string; memberId: string; keyId: string }, now: Date = new Date()): Promise<void> {
  const { data, error } = await admin
    .from("developer_api_keys")
    .update({ revoked_at: now.toISOString() })
    .eq("id", input.keyId)
    .eq("household_id", input.householdId)
    .is("revoked_at", null)
    .select("id");
  if (error) throw new Error(`revokeDeveloperKey failed: ${error.code ?? "unknown"}`);
  if (!data?.length) throw ApiError.notFound("That key is not active.");
  await auditChange({
    householdId: input.householdId,
    eventType: "developer_key.revoked",
    actorMemberId: input.memberId,
    targetTable: "developer_api_keys",
    targetId: input.keyId,
    metadata: {},
  });
}
