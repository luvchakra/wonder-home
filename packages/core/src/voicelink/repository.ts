import type { SupabaseClient } from "@supabase/supabase-js";

import { ACCESS_TTL_SECONDS, CODE_TTL_SECONDS, hashSecret, newSecret, pkceMatches, REFRESH_TTL_SECONDS, type VoiceProvider } from "./oauth";
import { normaliseScopes, type VoiceScope } from "./scopes";

/**
 * Voice links and the grants behind them (voice phase 2).
 *
 * Every write here goes through the service-role client, after the caller
 * has established who is acting: the consent page (the signed-in member,
 * for their own link) or the token endpoint (a client that proved its
 * secret and a code or refresh token it holds). Reading a person's own
 * links, and revoking one, go through their own session so RLS decides.
 */

export type VoiceLink = {
  id: string;
  provider: VoiceProvider;
  memberId: string;
  status: "active" | "revoked";
  scopes: VoiceScope[];
  deviceName: string | null;
  linkedAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
};

type Row = Record<string, unknown>;

function toLink(row: Row): VoiceLink {
  return {
    id: row.id as string,
    provider: row.provider as VoiceProvider,
    memberId: row.member_id as string,
    status: row.status as VoiceLink["status"],
    scopes: normaliseScopes((row.scopes as unknown[] | null) ?? []),
    deviceName: (row.device_name as string | null) ?? null,
    linkedAt: new Date(row.linked_at as string),
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at as string) : null,
    revokedAt: row.revoked_at ? new Date(row.revoked_at as string) : null,
  };
}

/** The links this person may see: their own, or all of the household's if they are an admin. */
export async function listVoiceLinks(supabase: SupabaseClient, householdId: string): Promise<VoiceLink[]> {
  const { data, error } = await supabase
    .from("external_voice_identities")
    .select("id, provider, member_id, status, scopes, device_name, linked_at, last_used_at, revoked_at")
    .eq("household_id", householdId)
    .order("linked_at", { ascending: false });
  if (error) throw new Error(`listVoiceLinks failed: ${error.code ?? "unknown"}`);
  return ((data as Row[] | null) ?? []).map(toLink);
}

/** Revokes a link through the person's own session: their own link, or any in the household for an admin. */
export async function revokeVoiceLink(supabase: SupabaseClient, identityId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("revoke_voice_identity", { p_identity_id: identityId });
  if (error) {
    if (error.code === "42501") return false;
    throw new Error(`revokeVoiceLink failed: ${error.code ?? "unknown"}`);
  }
  return data === true;
}

/** After consent: the link itself, and a one-time code for the provider. */
export async function createVoiceLink(
  admin: SupabaseClient,
  input: {
    householdId: string;
    memberId: string;
    provider: VoiceProvider;
    scopes: readonly VoiceScope[];
    clientId: string;
    redirectUri: string;
    codeChallenge: string | null;
    now?: Date;
  },
): Promise<{ identityId: string; code: string }> {
  const now = input.now ?? new Date();
  const { data, error } = await admin
    .from("external_voice_identities")
    .insert({ household_id: input.householdId, member_id: input.memberId, provider: input.provider, scopes: normaliseScopes(input.scopes) })
    .select("id")
    .single();
  if (error || !data) throw new Error(`createVoiceLink failed: ${error?.code ?? "unknown"}`);
  const identityId = (data as Row).id as string;

  const code = newSecret("code");
  const { error: grantError } = await admin.from("voice_oauth_grants").insert({
    household_id: input.householdId,
    identity_id: identityId,
    kind: "code",
    token_hash: hashSecret(code),
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    code_challenge: input.codeChallenge,
    code_challenge_method: input.codeChallenge ? "S256" : null,
    expires_at: new Date(now.getTime() + CODE_TTL_SECONDS * 1000).toISOString(),
  });
  if (grantError) throw new Error(`createVoiceLink code failed: ${grantError.code ?? "unknown"}`);
  return { identityId, code };
}

export type TokenPair = { accessToken: string; refreshToken: string; expiresIn: number; scopes: VoiceScope[] };
export type TokenFailure = { error: "invalid_grant" | "invalid_request" };

async function issuePair(admin: SupabaseClient, grant: { householdId: string; identityId: string; clientId: string; scopes: VoiceScope[] }, now: Date): Promise<TokenPair> {
  const accessToken = newSecret("access");
  const refreshToken = newSecret("refresh");
  const { error } = await admin.from("voice_oauth_grants").insert([
    { household_id: grant.householdId, identity_id: grant.identityId, kind: "access", token_hash: hashSecret(accessToken), client_id: grant.clientId, expires_at: new Date(now.getTime() + ACCESS_TTL_SECONDS * 1000).toISOString() },
    { household_id: grant.householdId, identity_id: grant.identityId, kind: "refresh", token_hash: hashSecret(refreshToken), client_id: grant.clientId, expires_at: new Date(now.getTime() + REFRESH_TTL_SECONDS * 1000).toISOString() },
  ]);
  if (error) throw new Error(`issuing voice tokens failed: ${error.code ?? "unknown"}`);
  return { accessToken, refreshToken, expiresIn: ACCESS_TTL_SECONDS, scopes: grant.scopes };
}

async function activeIdentity(admin: SupabaseClient, identityId: string): Promise<{ householdId: string; memberId: string; scopes: VoiceScope[] } | null> {
  const { data } = await admin.from("external_voice_identities").select("household_id, member_id, status, scopes").eq("id", identityId).maybeSingle();
  const row = data as Row | null;
  if (!row || row.status !== "active") return null;
  return { householdId: row.household_id as string, memberId: row.member_id as string, scopes: normaliseScopes((row.scopes as unknown[] | null) ?? []) };
}

async function revokeAllFor(admin: SupabaseClient, identityId: string, now: Date): Promise<void> {
  await admin.from("voice_oauth_grants").update({ revoked_at: now.toISOString() }).eq("identity_id", identityId).is("revoked_at", null);
}

/**
 * The authorization-code grant. A code works once, for the client and
 * redirect it was issued to, with the PKCE verifier its challenge names. A
 * code presented a second time is treated as stolen: every token issued
 * from that link is revoked (RFC 6749 §4.1.2).
 */
export async function redeemCode(
  admin: SupabaseClient,
  input: { code: string; clientId: string; redirectUri: string | null; codeVerifier: string | null; now?: Date },
): Promise<TokenPair | TokenFailure> {
  const now = input.now ?? new Date();
  const { data } = await admin
    .from("voice_oauth_grants")
    .select("id, household_id, identity_id, client_id, redirect_uri, code_challenge, expires_at, used_at, revoked_at")
    .eq("token_hash", hashSecret(input.code))
    .eq("kind", "code")
    .maybeSingle();
  const grant = data as Row | null;
  if (!grant) return { error: "invalid_grant" };
  if (grant.used_at) {
    await revokeAllFor(admin, grant.identity_id as string, now);
    return { error: "invalid_grant" };
  }
  if (grant.revoked_at || new Date(grant.expires_at as string) <= now) return { error: "invalid_grant" };
  if (grant.client_id !== input.clientId || grant.redirect_uri !== input.redirectUri) return { error: "invalid_grant" };
  if (grant.code_challenge && !pkceMatches(input.codeVerifier, grant.code_challenge as string)) return { error: "invalid_grant" };

  // Spend it exactly once, even against a concurrent second redemption.
  const { data: spent } = await admin.from("voice_oauth_grants").update({ used_at: now.toISOString() }).eq("id", grant.id as string).is("used_at", null).select("id");
  if (!spent || (spent as Row[]).length !== 1) return { error: "invalid_grant" };

  const identity = await activeIdentity(admin, grant.identity_id as string);
  if (!identity) return { error: "invalid_grant" };
  return issuePair(admin, { householdId: identity.householdId, identityId: grant.identity_id as string, clientId: input.clientId, scopes: identity.scopes }, now);
}

/** The refresh-token grant: the old refresh token is spent and a new pair replaces it. */
export async function refreshVoiceTokens(admin: SupabaseClient, input: { refreshToken: string; clientId: string; now?: Date }): Promise<TokenPair | TokenFailure> {
  const now = input.now ?? new Date();
  const { data } = await admin
    .from("voice_oauth_grants")
    .select("id, identity_id, client_id, expires_at, used_at, revoked_at")
    .eq("token_hash", hashSecret(input.refreshToken))
    .eq("kind", "refresh")
    .maybeSingle();
  const grant = data as Row | null;
  if (!grant || grant.client_id !== input.clientId) return { error: "invalid_grant" };
  if (grant.used_at) {
    // A spent refresh token presented again: somebody else has a copy.
    await revokeAllFor(admin, grant.identity_id as string, now);
    return { error: "invalid_grant" };
  }
  if (grant.revoked_at || new Date(grant.expires_at as string) <= now) return { error: "invalid_grant" };
  const { data: spent } = await admin.from("voice_oauth_grants").update({ used_at: now.toISOString() }).eq("id", grant.id as string).is("used_at", null).select("id");
  if (!spent || (spent as Row[]).length !== 1) return { error: "invalid_grant" };
  const identity = await activeIdentity(admin, grant.identity_id as string);
  if (!identity) return { error: "invalid_grant" };
  return issuePair(admin, { householdId: identity.householdId, identityId: grant.identity_id as string, clientId: input.clientId, scopes: identity.scopes }, now);
}

export type ResolvedVoiceCaller = {
  identityId: string;
  provider: VoiceProvider;
  householdId: string;
  memberId: string;
  /** The auth user the member signs in as, for their own RLS session. */
  profileId: string;
  scopes: VoiceScope[];
};

/**
 * Who an access token speaks for, or null: unknown, expired, revoked, a
 * revoked link, or a member who is no longer active in the household. A
 * provider's own account id is never consulted — only the token WonderHome
 * issued.
 */
export async function resolveVoiceAccessToken(admin: SupabaseClient, accessToken: string | null | undefined, now: Date = new Date()): Promise<ResolvedVoiceCaller | null> {
  if (!accessToken || !accessToken.startsWith("wha_")) return null;
  const { data } = await admin
    .from("voice_oauth_grants")
    .select("identity_id, expires_at, revoked_at")
    .eq("token_hash", hashSecret(accessToken))
    .eq("kind", "access")
    .maybeSingle();
  const grant = data as Row | null;
  if (!grant || grant.revoked_at || new Date(grant.expires_at as string) <= now) return null;

  const { data: identityRow } = await admin
    .from("external_voice_identities")
    .select("id, provider, household_id, member_id, status, scopes")
    .eq("id", grant.identity_id as string)
    .maybeSingle();
  const identity = identityRow as Row | null;
  if (!identity || identity.status !== "active") return null;

  const { data: memberRow } = await admin
    .from("household_members")
    .select("profile_id, status")
    .eq("id", identity.member_id as string)
    .eq("household_id", identity.household_id as string)
    .maybeSingle();
  const member = memberRow as Row | null;
  if (!member || member.status !== "active" || typeof member.profile_id !== "string") return null;

  void admin.from("external_voice_identities").update({ last_used_at: now.toISOString() }).eq("id", identity.id as string).then(() => undefined, () => undefined);
  return {
    identityId: identity.id as string,
    provider: identity.provider as VoiceProvider,
    householdId: identity.household_id as string,
    memberId: identity.member_id as string,
    profileId: member.profile_id,
    scopes: normaliseScopes((identity.scopes as unknown[] | null) ?? []),
  };
}
