"use server";

import { redirect } from "next/navigation";

import { auditChange } from "@wonderhome/core/api/audit";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { createClient } from "@wonderhome/core/db/server";
import { listMemberships } from "@wonderhome/core/identity/households";
import { readAuthorizeRequest, redirectWith } from "@wonderhome/core/voicelink/oauth";
import { createVoiceLink, revokeVoiceLink } from "@wonderhome/core/voicelink/repository";
import { normaliseScopes } from "@wonderhome/core/voicelink/scopes";
import { revalidatePath } from "next/cache";

/**
 * Linking a voice assistant, and unlinking it (voice phase 2).
 *
 * The authorization request travels through the form as it arrived and is
 * checked again here — client, exact redirect, PKCE — so nothing about the
 * link is decided by the browser. The member is whoever is signed in, never
 * a field on the form. Only an adult links: a child's account is not theirs
 * to hand to a third-party assistant.
 */

function paramsFrom(formData: FormData): URLSearchParams {
  const params = new URLSearchParams();
  for (const name of ["client_id", "redirect_uri", "response_type", "state", "scope", "code_challenge", "code_challenge_method"]) {
    const value = formData.get(name);
    if (typeof value === "string") params.set(name, value);
  }
  return params;
}

export async function approveVoiceLinkAction(formData: FormData): Promise<void> {
  const params = paramsFrom(formData);
  const reading = readAuthorizeRequest(params);
  if (!reading.ok) {
    if ("redirectUri" in reading) redirect(redirectWith(reading.redirectUri, { error: reading.error, state: reading.state }));
    redirect(`/oauth/voice/authorize?${params.toString()}`);
  }

  const supabase = await createClient();
  const membership = (await listMemberships(supabase))[0];
  if (!membership) redirect(`/sign-in?next=${encodeURIComponent(`/oauth/voice/authorize?${params.toString()}`)}`);
  if (membership.memberType !== "adult") redirect(redirectWith(reading.request.redirectUri, { error: "access_denied", state: reading.request.state }));

  // The member's choices, never more than the provider asked for.
  const chosen = normaliseScopes(formData.getAll("scope_choice")).filter((scope) => reading.request.scopes.includes(scope));
  if (chosen.length === 0) redirect(redirectWith(reading.request.redirectUri, { error: "access_denied", state: reading.request.state }));

  const { identityId, code } = await createVoiceLink(createAdminClient(), {
    householdId: membership.household.id,
    memberId: membership.memberId,
    provider: reading.request.client.provider,
    scopes: chosen,
    clientId: reading.request.client.clientId,
    redirectUri: reading.request.redirectUri,
    codeChallenge: reading.request.codeChallenge,
  });
  await auditChange({
    householdId: membership.household.id,
    eventType: "voice_link.created",
    actorMemberId: membership.memberId,
    targetTable: "external_voice_identities",
    targetId: identityId,
    metadata: { provider: reading.request.client.provider, scopes: chosen },
  });

  redirect(redirectWith(reading.request.redirectUri, { code, state: reading.request.state }));
}

export async function denyVoiceLinkAction(formData: FormData): Promise<void> {
  const reading = readAuthorizeRequest(paramsFrom(formData));
  if (!reading.ok) redirect("/settings/voice-assistants");
  redirect(redirectWith(reading.request.redirectUri, { error: "access_denied", state: reading.request.state }));
}

export async function revokeVoiceLinkAction(formData: FormData): Promise<void> {
  const identityId = formData.get("identityId");
  if (typeof identityId !== "string" || !/^[0-9a-f-]{36}$/.test(identityId)) return;
  const supabase = await createClient();
  const membership = (await listMemberships(supabase))[0];
  if (await revokeVoiceLink(supabase, identityId)) {
    if (membership) {
      await auditChange({
        householdId: membership.household.id,
        eventType: "voice_link.revoked",
        actorMemberId: membership.memberId,
        targetTable: "external_voice_identities",
        targetId: identityId,
      });
    }
  }
  revalidatePath("/settings/voice-assistants");
}
