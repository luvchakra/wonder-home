/**
 * Why a live conversation (or a tap on the talk button) could not start or
 * stopped, in the few kinds a person can act on. The words for each live in
 * the composer's labels, in the viewer's language; this module only sorts.
 *
 * - `denied`: the browser refused the microphone for this site (a per-site
 *   permission: allowing it on one web address does not allow it on another).
 * - `unsupported`: this browser cannot record or listen at all.
 * - `setup`: WonderHome's voice service refused for this home (its plan, its
 *   speech settings, a key, an allowance) — an Admin's Settings → Voice.
 * - `failed`: anything else; tapping again or typing is the way on.
 *
 * Story: the owner's "talk button does nothing on one account" (2026-11-20):
 * every one of these used to end the session without a word on HomeTalk.
 */
export type LiveFailureKind = "denied" | "unsupported" | "setup" | "failed";

export type LiveFailure = { kind: LiveFailureKind; message: string };

/** The voice route answered with an error: its status decides the kind. */
export class VoiceRouteError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "VoiceRouteError";
  }
}

const DENIED = /permission|denied|notallowed|not-allowed|service-not-allowed/i;
const UNSUPPORTED = /cannot record|cannot listen|not supported|unsupported|notfound|no microphone|requested device not found/i;

export function liveFailureKind(thrown: unknown): LiveFailureKind {
  if (thrown instanceof VoiceRouteError) {
    return thrown.status === 400 || thrown.status === 402 || thrown.status === 403 ? "setup" : "failed";
  }
  const name = typeof thrown === "object" && thrown !== null && "name" in thrown ? String((thrown as { name: unknown }).name) : "";
  const message = thrown instanceof Error ? thrown.message : typeof thrown === "string" ? thrown : "";
  if (name === "NotAllowedError" || name === "SecurityError" || DENIED.test(message)) return "denied";
  if (name === "NotFoundError" || name === "NotSupportedError" || UNSUPPORTED.test(message)) return "unsupported";
  return "failed";
}
