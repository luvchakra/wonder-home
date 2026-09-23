import { createAdminClient } from "@wonderhome/core/db/admin";
import { recordChannelEvent } from "@wonderhome/core/hometalk/channel-events";
import { log } from "@wonderhome/core/observability/logger";
import { hitRateLimit } from "@wonderhome/core/security/rate-limit";
import {
  alexaResponseFor,
  alexaSkillId,
  alexaTurn,
  certChainUrlAllowed,
  checkAlexaCertificate,
  linkAccountResponse,
  localAlexaResponse,
  readAlexaEnvelope,
  signatureMatches,
  splitPemChain,
  timestampFresh,
} from "@wonderhome/core/voicelink/alexa";
import { withMemberSession } from "@wonderhome/core/voicelink/member-session";
import { resolveVoiceAccessToken } from "@wonderhome/core/voicelink/repository";

import { handleHomeTalkRequest } from "@/app/_lib/hometalk-gateway";

/**
 * The WonderHome Alexa skill's endpoint (voice integration phase 4).
 *
 * Alexa is a channel into HomeTalk, nothing more. A request is proved to be
 * Alexa's (certificate, signature, timestamp, this skill's own id) before it
 * is even parsed for meaning; the speaker is whoever the WonderHome access
 * token Alexa holds was issued to — never Amazon's own account id; and the
 * turn runs as that member, under their own RLS, with the scopes they chose,
 * through the same gateway as every other channel. Alexa never touches the
 * database and never decides whether anything happened.
 *
 * Inert until ALEXA_SKILL_ID is set (and ALEXA_OAUTH_* for linking).
 */

const MAX_BODY_BYTES = 64 * 1024;
const CERT_CACHE_MS = 60 * 60 * 1000;
const certCache = new Map<string, { pem: string; at: number }>();

function reject(status: 400 | 401 | 413): Response {
  return new Response(JSON.stringify({ error: { code: "unauthenticated", message: "Authentication required.", requestId: "alexa" } }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function alexaJson(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

async function certificateChain(url: string): Promise<string | null> {
  const cached = certCache.get(url);
  if (cached && Date.now() - cached.at < CERT_CACHE_MS) return cached.pem;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000), redirect: "error" });
    if (!response.ok) return null;
    const pem = (await response.text()).slice(0, 32 * 1024);
    certCache.set(url, { pem, at: Date.now() });
    return pem;
  } catch {
    return null;
  }
}

export async function POST(request: Request): Promise<Response> {
  const skillId = alexaSkillId();
  // Unconfigured and unauthenticated look the same from outside.
  if (!skillId) return reject(401);

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return reject(413);
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) return reject(413);

  // Amazon's rules: reject with 400 anything that is not provably Alexa's.
  const certUrl = request.headers.get("signaturecertchainurl");
  if (!certChainUrlAllowed(certUrl)) return reject(400);
  const pem = await certificateChain(certUrl!);
  if (!pem) return reject(400);
  const now = new Date();
  let certificate;
  try {
    certificate = checkAlexaCertificate(splitPemChain(pem), now);
  } catch {
    return reject(400);
  }
  if (!certificate.ok || !signatureMatches(certificate.leaf, request.headers.get("signature-256"), rawBody)) return reject(400);

  const envelope = readAlexaEnvelope(rawBody);
  if (!envelope || !timestampFresh(envelope.timestamp, now) || envelope.applicationId !== skillId) return reject(400);

  const turn = alexaTurn(envelope);
  if (turn.kind === "local") return alexaJson(localAlexaResponse(turn.speech, turn.endSession));

  const admin = createAdminClient();
  const caller = await resolveVoiceAccessToken(admin, envelope.accessToken);
  if (!caller || caller.provider !== "amazon_alexa") {
    await recordChannelEvent(admin, { channel: "alexa", outcome: "unlinked" });
    return alexaJson(linkAccountResponse());
  }
  if (!(await hitRateLimit(admin, "voice.request", caller.identityId))) {
    await recordChannelEvent(admin, { channel: "alexa", householdId: caller.householdId, outcome: "rate_limited" });
    return alexaJson(localAlexaResponse("That's a lot in a short time, so I'm pausing for a few minutes. Nothing was lost.", true));
  }

  try {
    const answer = await withMemberSession(admin, caller.profileId, (supabase) =>
      handleHomeTalkRequest(
        {
          channel: "alexa",
          householdId: caller.householdId,
          memberId: caller.memberId,
          requestId: envelope.requestId,
          input: { text: turn.text, modality: "voice", ...(envelope.locale ? { locale: envelope.locale } : {}) },
          device: { provider: "amazon" },
        },
        { supabase },
        { scopes: caller.scopes },
      ),
    );
    return alexaJson(alexaResponseFor(answer));
  } catch (thrown) {
    log.warn("alexa: turn failed", { reason: thrown instanceof Error ? thrown.message.slice(0, 80) : "unknown", allow: ["reason"] });
    return alexaJson(localAlexaResponse("I couldn't do that right now. Nothing was changed.", true));
  }
}

export const dynamic = "force-dynamic";
