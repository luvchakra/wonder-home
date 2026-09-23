import { rootCertificates } from "node:tls";
import { createVerify, X509Certificate } from "node:crypto";

import type { HomeTalkResponse } from "../hometalk/contract";

/**
 * Alexa as a HomeTalk channel (voice integration phase 4,
 * `design/voice-integration/04-alexa-hometalk-skill.md`).
 *
 * Everything here is pure and provider-shaped: proving a request really
 * came from Alexa, reading what was said out of it, and rendering a
 * HomeTalk answer back in Alexa's response format. Deciding anything is
 * HomeTalk's; this file only translates at the edge.
 *
 * Request verification follows Amazon's current rules for a skill hosted
 * as a web service (checked 2026-09):
 *   - SignatureCertChainUrl: https, host s3.amazonaws.com, a path that
 *     begins with /echo.api/ (case sensitive, after normalisation), port 443
 *     if one is given;
 *   - the signing certificate is in date, names echo-api.amazon.com in its
 *     subject alternative names, and chains to a trusted root;
 *   - Signature-256 is an RSA-SHA256 signature of the exact request body;
 *   - the request's timestamp is within 150 seconds.
 * The skill's own application id is also pinned, so another skill's
 * requests are never answered.
 */

export const ALEXA_TIMESTAMP_TOLERANCE_SECONDS = 150;

/** The configured skill, or null — Alexa is inert until a deployment sets it. */
export function alexaSkillId(env: Record<string, string | undefined> = process.env): string | null {
  const id = env.ALEXA_SKILL_ID?.trim();
  return id && /^amzn1\.ask\.skill\.[0-9a-f-]{36}$/.test(id) ? id : null;
}

export function certChainUrlAllowed(raw: string | null | undefined): boolean {
  if (!raw) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol.toLowerCase() !== "https:") return false;
  if (url.hostname.toLowerCase() !== "s3.amazonaws.com") return false;
  if (url.port !== "" && url.port !== "443") return false;
  // URL normalises "/echo.api/../x" to "/x", so a traversal fails here.
  if (!url.pathname.startsWith("/echo.api/")) return false;
  return true;
}

/** The PEM blocks of a certificate chain, leaf first. */
export function splitPemChain(pem: string): X509Certificate[] {
  const blocks = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];
  return blocks.map((block) => new X509Certificate(block));
}

let trustedRoots: X509Certificate[] | null = null;
function roots(): X509Certificate[] {
  trustedRoots ??= rootCertificates.map((pem) => new X509Certificate(pem));
  return trustedRoots;
}

export type CertCheck = { ok: true; leaf: X509Certificate } | { ok: false; reason: "empty" | "expired" | "wrong_domain" | "untrusted_chain" };

/**
 * The signing certificate is valid now, is Alexa's, and every link of the
 * chain is signed by the next — ending at a root Node itself trusts.
 * `trust` is injectable only so a test can supply its own root.
 */
export function checkAlexaCertificate(chain: readonly X509Certificate[], now: Date, trust: readonly X509Certificate[] = roots()): CertCheck {
  const leaf = chain[0];
  if (!leaf) return { ok: false, reason: "empty" };
  const time = now.getTime();
  for (const cert of chain) {
    if (time < new Date(cert.validFrom).getTime() || time > new Date(cert.validTo).getTime()) return { ok: false, reason: "expired" };
  }
  const names = (leaf.subjectAltName ?? "").split(",").map((entry) => entry.trim().toLowerCase());
  if (!names.includes("dns:echo-api.amazon.com")) return { ok: false, reason: "wrong_domain" };

  for (let index = 0; index < chain.length - 1; index += 1) {
    const cert = chain[index]!;
    const issuer = chain[index + 1]!;
    if (!cert.checkIssued(issuer) || !cert.verify(issuer.publicKey)) return { ok: false, reason: "untrusted_chain" };
  }
  const top = chain[chain.length - 1]!;
  const anchored = trust.some((root) => (top.fingerprint256 === root.fingerprint256) || (top.checkIssued(root) && top.verify(root.publicKey)));
  return anchored ? { ok: true, leaf } : { ok: false, reason: "untrusted_chain" };
}

export function signatureMatches(leaf: X509Certificate, signatureBase64: string | null | undefined, rawBody: string): boolean {
  if (!signatureBase64) return false;
  try {
    const verifier = createVerify("RSA-SHA256");
    verifier.update(rawBody, "utf8");
    return verifier.verify(leaf.publicKey, Buffer.from(signatureBase64, "base64"));
  } catch {
    return false;
  }
}

export function timestampFresh(timestamp: string | null | undefined, now: Date): boolean {
  if (!timestamp) return false;
  const at = Date.parse(timestamp);
  return Number.isFinite(at) && Math.abs(now.getTime() - at) <= ALEXA_TIMESTAMP_TOLERANCE_SECONDS * 1000;
}

// ---------------------------------------------------------------------------
// Reading a request
// ---------------------------------------------------------------------------

export type AlexaEnvelope = {
  requestId: string;
  timestamp: string;
  type: string;
  intent: string | null;
  /** What was said, when the intent carries it. */
  utterance: string | null;
  applicationId: string | null;
  accessToken: string | null;
  sessionId: string | null;
  locale: string | null;
};

type Json = Record<string, unknown>;
const obj = (value: unknown): Json => (value && typeof value === "object" ? (value as Json) : {});
const str = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null);

/**
 * The skill's own intents, and the word each one's samples start with.
 *
 * Alexa's free-text slot (AMAZON.SearchQuery) must sit behind a carrier
 * phrase, and the carrier is not part of the slot's value — "what's for
 * dinner" arrives as "for dinner" on the intent whose samples are
 * "what's {utterance}". So each carrier gets an intent of its own, and the
 * word is put back here before HomeTalk hears it. The interaction model in
 * `integrations/alexa/` is generated from this same table (and a test keeps
 * the two in step), so the two can never disagree.
 */
export const ALEXA_LEADS = [
  "what", "what's", "what is", "when", "when's", "when is", "who", "who's", "which", "where", "how", "how many", "how much",
  "is", "are", "do", "does", "did", "has", "have", "can", "should", "will",
  "add", "put", "remove", "take", "remind", "remind me", "plan", "mark", "move", "cancel",
  "the", "i", "i've", "i'm", "my", "we", "we're", "our",
] as const;

/** "what's" → WonderHomeWhatsIntent, "remind me" → WonderHomeRemindMeIntent. */
export function alexaIntentFor(lead: string): string {
  const pascal = lead
    .replace(/'/g, "")
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
  return `WonderHome${pascal}Intent`;
}

/** Intents whose slot is the whole request: "Alexa, ask WonderHome to tell me {…}". */
export const ALEXA_OPEN_INTENTS: Record<string, readonly string[]> = {
  WonderHomeQueryIntent: ["tell me {utterance}", "about {utterance}", "to tell me {utterance}", "for {utterance}"],
};

export const ALEXA_CARRIERS: Record<string, string> = Object.fromEntries(ALEXA_LEADS.map((lead) => [alexaIntentFor(lead), lead]));

/** The spoken request, with the carrier word the intent stood for put back. */
export function withCarrier(intent: string | null, utterance: string): string {
  const lead = intent ? ALEXA_CARRIERS[intent] : undefined;
  return lead ? `${lead} ${utterance}` : utterance;
}

/**
 * The skill's interaction model, for the Alexa developer console
 * (`integrations/alexa/skill-package/`). Generated from the tables above.
 */
export function alexaInteractionModel(invocationName = "wonder home"): unknown {
  const slot = [{ name: "utterance", type: "AMAZON.SearchQuery" }];
  return {
    interactionModel: {
      languageModel: {
        invocationName,
        intents: [
          ...Object.entries(ALEXA_OPEN_INTENTS).map(([name, samples]) => ({ name, slots: slot, samples })),
          ...ALEXA_LEADS.map((lead) => ({ name: alexaIntentFor(lead), slots: slot, samples: [`${lead} {utterance}`] })),
          { name: "AMAZON.YesIntent", samples: [] },
          { name: "AMAZON.NoIntent", samples: [] },
          { name: "AMAZON.HelpIntent", samples: [] },
          { name: "AMAZON.CancelIntent", samples: [] },
          { name: "AMAZON.StopIntent", samples: [] },
          { name: "AMAZON.FallbackIntent", samples: [] },
          { name: "AMAZON.NavigateHomeIntent", samples: [] },
        ],
        types: [],
      },
    },
  };
}

export function readAlexaEnvelope(rawBody: string): AlexaEnvelope | null {
  let parsed: Json;
  try {
    parsed = obj(JSON.parse(rawBody));
  } catch {
    return null;
  }
  const request = obj(parsed.request);
  const system = obj(obj(parsed.context).System);
  const session = obj(parsed.session);
  const requestId = str(request.requestId);
  const timestamp = str(request.timestamp);
  const type = str(request.type);
  if (!requestId || !timestamp || !type) return null;

  const intent = obj(request.intent);
  const intentName = str(intent.name);
  const slots = obj(intent.slots);
  const utterance = str(obj(slots.utterance).value) ?? str(obj(slots.query).value);
  const applicationId = str(obj(system.application).applicationId) ?? str(obj(session.application).applicationId);
  const accessToken = str(obj(system.user).accessToken) ?? str(obj(session.user).accessToken);

  return {
    requestId,
    timestamp,
    type,
    intent: intentName,
    utterance: utterance ? utterance.slice(0, 500) : null,
    applicationId,
    accessToken,
    sessionId: str(session.sessionId),
    locale: str(request.locale),
  };
}

export type AlexaTurn =
  /** Ask HomeTalk. */
  | { kind: "hometalk"; text: string }
  /** Answer without HomeTalk: a welcome, help, goodbye, or nothing at all. */
  | { kind: "local"; speech: string | null; endSession: boolean };

export const ALEXA_WELCOME = "WonderHome here. What would you like to know or do?";
export const ALEXA_HELP = "You can ask what's happening tomorrow, what's for dinner, or add something to the grocery list. What would you like?";

/** What an Alexa request asks for, in HomeTalk's terms. */
export function alexaTurn(envelope: AlexaEnvelope): AlexaTurn {
  switch (envelope.type) {
    case "LaunchRequest":
      return { kind: "local", speech: ALEXA_WELCOME, endSession: false };
    case "SessionEndedRequest":
      return { kind: "local", speech: null, endSession: true };
    case "IntentRequest":
      break;
    default:
      return { kind: "local", speech: null, endSession: true };
  }
  switch (envelope.intent) {
    case "AMAZON.HelpIntent":
      return { kind: "local", speech: ALEXA_HELP, endSession: false };
    case "AMAZON.CancelIntent":
    case "AMAZON.StopIntent":
      return { kind: "local", speech: "Okay.", endSession: true };
    // A spoken yes or no is HomeTalk's short reply to what it just proposed.
    case "AMAZON.YesIntent":
      return { kind: "hometalk", text: "yes" };
    case "AMAZON.NoIntent":
      return { kind: "hometalk", text: "no" };
    case "AMAZON.FallbackIntent":
      return { kind: "local", speech: "Sorry, I didn't catch that. What would you like?", endSession: false };
    default:
      return envelope.utterance ? { kind: "hometalk", text: withCarrier(envelope.intent, envelope.utterance) } : { kind: "local", speech: "Sorry, I didn't catch that. What would you like?", endSession: false };
  }
}

// ---------------------------------------------------------------------------
// Rendering a response
// ---------------------------------------------------------------------------

export type AlexaResponse = {
  version: "1.0";
  response: {
    outputSpeech?: { type: "PlainText"; text: string };
    reprompt?: { outputSpeech: { type: "PlainText"; text: string } };
    card?: { type: "LinkAccount" };
    shouldEndSession: boolean;
  };
};

/** Short, plain, heard once: Alexa rejects very long speech, and nobody wants it. */
function spoken(text: string): string {
  const clean = text.replace(/[<>&]/g, " ").replace(/\s{2,}/g, " ").trim();
  return clean.length > 600 ? `${clean.slice(0, clean.lastIndexOf(" ", 590))}…` : clean;
}

export function localAlexaResponse(speech: string | null, endSession: boolean): AlexaResponse {
  return {
    version: "1.0",
    response: {
      ...(speech ? { outputSpeech: { type: "PlainText", text: spoken(speech) } } : {}),
      ...(speech && !endSession ? { reprompt: { outputSpeech: { type: "PlainText", text: "What would you like?" } } } : {}),
      shouldEndSession: endSession,
    },
  };
}

/** Not linked (or no longer): Alexa's own account-linking card, and nothing about the home. */
export function linkAccountResponse(): AlexaResponse {
  return {
    version: "1.0",
    response: {
      outputSpeech: { type: "PlainText", text: "Please link your WonderHome account in the Alexa app before I can help with your home." },
      card: { type: "LinkAccount" },
      shouldEndSession: true,
    },
  };
}

/**
 * A HomeTalk answer, as Alexa says it. A question back or a proposal waiting
 * for a yes keeps the session open for the answer; everything else closes
 * it. "Done" is whatever HomeTalk's speech says — this never adds one.
 */
export function alexaResponseFor(answer: HomeTalkResponse): AlexaResponse {
  const waiting = answer.status === "clarification_required" || answer.status === "approval_required";
  const speech = answer.speech || (answer.status === "failed" ? "I couldn't do that right now. Nothing was changed." : "Okay.");
  return {
    version: "1.0",
    response: {
      outputSpeech: { type: "PlainText", text: spoken(speech) },
      ...(waiting ? { reprompt: { outputSpeech: { type: "PlainText", text: answer.status === "approval_required" ? "Should I go ahead? Say yes or no." : "What would you like?" } } } : {}),
      shouldEndSession: !waiting,
    },
  };
}
