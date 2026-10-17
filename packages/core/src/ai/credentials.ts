import type { SupabaseClient } from "@supabase/supabase-js";

import { auditChange } from "../api/audit";
import { ApiError } from "../api/errors";
import { createAdminClient } from "../db/admin";
import { writeKeyRow } from "./key-row";
import { MODEL_PROVIDERS, type HouseholdKey, type ModelProvider } from "./model-key";

/**
 * Reading and writing a household's own model key.
 *
 * Note which client each function takes, because that is the whole design.
 * Setting and clearing go through the caller's own session, so RLS decides
 * whether they are an administrator. Reading the key goes through the admin
 * client, because the table has no SELECT policy at all — nothing reachable
 * from a browser can fetch a key back, including the household that set it.
 */

type Row = Record<string, unknown>;

export type CredentialStatus = {
  configured: boolean;
  provider: ModelProvider | null;
  updatedAt: Date | null;
};

/** Whether a household has its own key, and since when. Never the key itself. */
export async function credentialStatus(
  supabase: SupabaseClient,
  householdId: string,
): Promise<CredentialStatus> {
  const { data, error } = await supabase.rpc("ai_credential_status", {
    p_household_id: householdId,
  });

  if (error) throw new Error(`credentialStatus failed: ${error.code ?? "unknown"}`);

  const row = ((data as Row[] | null) ?? [])[0];
  if (!row) return { configured: false, provider: null, updatedAt: null };

  return {
    configured: true,
    provider: row.provider as ModelProvider,
    updatedAt: row.updated_at ? new Date(row.updated_at as string) : null,
  };
}

export async function setHouseholdKey(
  supabase: SupabaseClient,
  input: { householdId: string; memberId: string; provider: ModelProvider; apiKey: string },
): Promise<void> {
  const apiKey = input.apiKey.trim();
  if (apiKey.length < 20) throw ApiError.badRequest("That does not look like a model key.");
  if (!MODEL_PROVIDERS.includes(input.provider)) {
    throw ApiError.badRequest("That provider is not one WonderHome can use.");
  }

  const error = await writeKeyRow(supabase, "household_ai_credentials", {
    household_id: input.householdId,
    provider: input.provider,
    api_key: apiKey,
    set_by_member_id: input.memberId,
  });

  if (error) {
    if (error.code === "42501") {
      throw ApiError.forbidden("Only an Admin can set a model key.");
    }
    throw new Error(`setHouseholdKey failed: ${error.code ?? "unknown"}`);
  }

  // Which company's servers answer for this household is a household decision
  // worth a trail entry (story 15-006). The provider name only — the key
  // itself is the one thing in this file that must never appear anywhere else,
  // and `recordAuditEvent` would redact it even if it were passed by mistake.
  await auditChange({
    householdId: input.householdId,
    actorMemberId: input.memberId,
    eventType: "ai.key_set",
    targetTable: "household_ai_credentials",
    targetId: input.householdId,
    metadata: { provider: input.provider },
  });
}

export async function clearHouseholdKey(
  supabase: SupabaseClient,
  householdId: string,
  actorMemberId?: string,
): Promise<void> {
  const { error } = await supabase
    .from("household_ai_credentials")
    .delete()
    .eq("household_id", householdId);

  if (error) {
    if (error.code === "42501") {
      throw ApiError.forbidden("Only an Admin can remove a model key.");
    }
    throw new Error(`clearHouseholdKey failed: ${error.code ?? "unknown"}`);
  }

  // Removing the household's own key sends them back to the platform key,
  // under a different agreement with the provider. Worth knowing afterwards.
  await auditChange({
    householdId,
    actorMemberId: actorMemberId ?? null,
    eventType: "ai.key_removed",
    targetTable: "household_ai_credentials",
    targetId: householdId,
  });
}

/**
 * The household's key, for the server that is about to call a provider.
 *
 * Deliberately the only reader, and deliberately on the admin client: the
 * table has no SELECT policy, so this is the single path by which a key
 * leaves the database, and it is a server one. The result must never be put
 * in a response, a log or a rendered page.
 */
export async function readHouseholdKey(householdId: string): Promise<HouseholdKey> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("household_ai_credentials")
    .select("provider, api_key")
    .eq("household_id", householdId)
    .maybeSingle();

  if (error) throw new Error(`readHouseholdKey failed: ${error.code ?? "unknown"}`);
  if (!data) return null;

  const row = data as Row;
  return { provider: row.provider as ModelProvider, key: row.api_key as string };
}

/**
 * The Gemini voice key: a second, optional Google key used only for Gemini
 * Live voice, so a household whose assistant thinks with Anthropic or OpenAI
 * can still talk to Gemini. Same rules as the assistant key: written through
 * the caller's session (RLS: Admins only), read only here on the admin client,
 * and its status never carries the key.
 */
export async function geminiVoiceKeyStatus(supabase: SupabaseClient, householdId: string): Promise<CredentialStatus> {
  const { data, error } = await supabase.rpc("gemini_voice_credential_status", { p_household_id: householdId });
  if (error) throw new Error(`geminiVoiceKeyStatus failed: ${error.code ?? "unknown"}`);
  const row = ((data as Row[] | null) ?? [])[0];
  if (!row) return { configured: false, provider: null, updatedAt: null };
  return { configured: true, provider: "google", updatedAt: row.updated_at ? new Date(row.updated_at as string) : null };
}

export async function setGeminiVoiceKey(supabase: SupabaseClient, input: { householdId: string; memberId: string; apiKey: string }): Promise<void> {
  const apiKey = input.apiKey.trim();
  if (apiKey.length < 20) throw ApiError.badRequest("That does not look like a Google AI key.");
  const error = await writeKeyRow(supabase, "household_gemini_voice_credentials", { household_id: input.householdId, provider: "google", api_key: apiKey, set_by_member_id: input.memberId });
  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only an Admin can set the Gemini voice key.");
    throw new Error(`setGeminiVoiceKey failed: ${error.code ?? "unknown"}`);
  }
  await auditChange({
    householdId: input.householdId,
    actorMemberId: input.memberId,
    eventType: "ai.voice_key_set",
    targetTable: "household_gemini_voice_credentials",
    targetId: input.householdId,
    metadata: { provider: "google" },
  });
}

export async function clearGeminiVoiceKey(supabase: SupabaseClient, householdId: string, actorMemberId?: string): Promise<void> {
  const { error } = await supabase.from("household_gemini_voice_credentials").delete().eq("household_id", householdId);
  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only an Admin can remove the Gemini voice key.");
    throw new Error(`clearGeminiVoiceKey failed: ${error.code ?? "unknown"}`);
  }
  await auditChange({
    householdId,
    actorMemberId: actorMemberId ?? null,
    eventType: "ai.voice_key_removed",
    targetTable: "household_gemini_voice_credentials",
    targetId: householdId,
  });
}

/** The Gemini voice key, for the server opening a Gemini Live session. Never put in a response, a log or a page. */
export async function readGeminiVoiceKey(householdId: string): Promise<HouseholdKey> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("household_gemini_voice_credentials").select("api_key").eq("household_id", householdId).maybeSingle();
  if (error) throw new Error(`readGeminiVoiceKey failed: ${error.code ?? "unknown"}`);
  if (!data) return null;
  return { provider: "google", key: (data as Row).api_key as string };
}
