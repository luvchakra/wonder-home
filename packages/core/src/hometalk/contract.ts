/**
 * The canonical HomeTalk contract (voice integration phase 1,
 * `design/voice-integration/01-hometalk-voice-gateway-foundation.md`).
 *
 * Every channel — the web and PWA composer, Gemini Voice, Alexa, whatever
 * comes next — asks HomeTalk the same way and gets the same structured
 * answer back. A channel adapter only renders that answer; it never decides
 * what happened. In particular `completed` is only ever read from the
 * governed executor's own result, so no surface can say "done" about a
 * change that did not happen.
 */

export const HOMETALK_CHANNELS = ["web", "mobile", "gemini_voice", "alexa"] as const;
export type HomeTalkChannel = (typeof HOMETALK_CHANNELS)[number];

export type HomeTalkRequest = {
  channel: HomeTalkChannel;
  householdId: string;
  memberId: string;
  /** Stable per delivery: a retried delivery carries the same id and runs once. */
  requestId: string;
  input: { text: string; locale?: string; modality: "text" | "voice"; transcriptConfidence?: number };
  device?: { provider: "gemini" | "amazon"; externalDeviceId?: string; deviceName?: string };
};

export const HOMETALK_STATUSES = ["answered", "clarification_required", "approval_required", "completed", "failed", "not_authorized"] as const;
export type HomeTalkStatus = (typeof HOMETALK_STATUSES)[number];

export type HomeTalkResponse = {
  requestId: string;
  status: HomeTalkStatus;
  /** What a voice surface says: short, heard once, no links or screen words. */
  speech: string;
  /** What a screen shows — the reply as HomeTalk wrote it. */
  displayText: string;
  action?: { proposed: boolean; executed: boolean; actionId?: string };
  clarification?: { question: string };
  approval?: { approvalId: string; expiresAt?: string };
  /** A screen the reply opens ("take me to the grocery list"): a same-app path, for a surface that has screens. */
  navigate?: string;
};

/** The part of a HomeTalk turn's result the contract reads. Nothing else leaves. */
export type TurnReply = {
  text: string;
  /** What the engine proposed: answer, clarify, confirm_transcript, needs_approval, prepared, executed, refused, summary… */
  proposal: string | null;
  action: { id: string; status: string; unchanged?: boolean; expiresAt?: string | Date | null } | null;
  navigate?: string;
};

/**
 * Reads a turn's reply into the canonical response. Pure.
 *
 *   - A question back is `clarification_required`.
 *   - A proposal waiting for a yes is `approval_required`, naming the action.
 *   - `completed` only when the executor recorded the action as executed.
 *     An execution that failed, or was proposed as executed but has no
 *     executed record, is `failed` — never "done".
 *   - A refusal (permission, plan, observe-only) is `not_authorized`.
 *   - Everything else is `answered`.
 */
export function toHomeTalkResponse(requestId: string, reply: TurnReply): HomeTalkResponse {
  const navigate = typeof reply.navigate === "string" && /^\/(?!\/)[a-z0-9/_-]*$/i.test(reply.navigate) ? reply.navigate : null;
  const base = { requestId, displayText: reply.text, speech: speechFrom(reply.text), ...(navigate ? { navigate } : {}) };
  const action = reply.action;
  switch (reply.proposal) {
    case "clarify":
    case "confirm_transcript":
      return { ...base, status: "clarification_required", clarification: { question: reply.text } };
    case "needs_approval":
      return action
        ? {
            ...base,
            status: "approval_required",
            action: { proposed: true, executed: false, actionId: action.id },
            approval: { approvalId: action.id, ...(action.expiresAt ? { expiresAt: new Date(action.expiresAt).toISOString() } : {}) },
          }
        : { ...base, status: "answered" };
    case "executed":
    case "approve":
      if (action?.status === "executed") return { ...base, status: "completed", action: { proposed: true, executed: true, actionId: action.id } };
      return { ...base, status: "failed", action: { proposed: true, executed: false, ...(action ? { actionId: action.id } : {}) } };
    case "refused":
      return { ...base, status: "not_authorized" };
    default:
      return { ...base, status: "answered", ...(action ? { action: { proposed: true, executed: action.status === "executed", actionId: action.id } } : {}) };
  }
}

/**
 * A heading with its list under it is one sentence when heard (HomeBrain
 * Sleep, the owner's "only Asmi's preferences" report): "**Asmi**" then
 * "- Asmi likes pasta", "- Asmi likes pizza" is read "Asmi likes pasta and
 * pizza." — so the whole family fits in what a voice surface reads out,
 * instead of the first person's lines and "and 10 more".
 */
export function groupedForSpeech(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index]!.trim().match(/^\*\*([^*]+)\*\*:?$/);
    const items: string[] = [];
    let next = index + 1;
    while (heading && next < lines.length && /^\s*[-*•]\s+/.test(lines[next]!)) {
      items.push(lines[next]!.replace(/^\s*[-*•]\s+/, "").replace(/\.$/, "").trim());
      next += 1;
    }
    if (!heading || items.length === 0) {
      out.push(lines[index]!);
      continue;
    }
    out.push(`${spokenGroup(heading[1]!.trim(), items)}.`);
    index = next - 1;
  }
  return out.join("\n");
}

/** "Asmi" + ["Asmi likes pasta", "Asmi likes pizza", "Asmi doesn't like okra"] → "Asmi likes pasta and pizza; doesn't like okra". */
function spokenGroup(name: string, items: readonly string[]): string {
  const first = name.split(/\s+/)[0]!;
  const rest = items.map((item) => item.replace(new RegExp(`^(?:${[name, first].map((entry) => entry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\s+`, "i"), "").replace(/\s*\([^)]*\)$/, ""));
  const verbs = ["likes", "loves", "prefers", "doesn't like", "does not like", "is allergic to", "avoids", "dislikes"];
  const groups: { verb: string | null; things: string[] }[] = [];
  for (const item of rest) {
    const verb = verbs.find((entry) => item.toLowerCase().startsWith(`${entry} `)) ?? null;
    const thing = verb ? item.slice(verb.length + 1) : item;
    const last = groups[groups.length - 1];
    if (last && verb && last.verb === verb) last.things.push(thing);
    else groups.push({ verb, things: [thing] });
  }
  const join = (things: string[]) => (things.length <= 1 ? (things[0] ?? "") : `${things.slice(0, -1).join(", ")} and ${things[things.length - 1]}`);
  const phrases = groups.map((group) => (group.verb ? `${group.verb} ${join(group.things)}` : join(group.things)));
  const startsWithVerb = groups[0]?.verb !== null;
  return startsWithVerb ? `${first} ${phrases.join("; ")}` : `${name}: ${phrases.join("; ")}`;
}

/** The longest thing a voice surface reads out in one go, in characters. */
export const MAX_SPEECH = 420;

/**
 * A reply as it should be heard: no markdown, no links, no "click", no
 * arrows or bullets — and short. A list is read as a sentence; what does not
 * fit is counted ("and 3 more"), never cut mid-sentence.
 */
export function speechFrom(text: string): string {
  const lines = groupedForSpeech(text)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/\s*→\s*[^\n.]*/g, "")
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim())
    .filter(Boolean)
    .filter((line) => !/^(?:tap|click|open|see)\b/i.test(line));

  const sentences = lines.map((line) => (/[.!?:]$/.test(line) ? line : `${line}.`));
  let spoken = "";
  let used = 0;
  for (const sentence of sentences) {
    const next = spoken ? `${spoken} ${sentence}` : sentence;
    if (next.length > MAX_SPEECH && spoken) break;
    spoken = next;
    used += 1;
  }
  const rest = sentences.length - used;
  const withoutScreenWords = spoken.replace(/\b(?:click|tap) (?:here|below|the button)\b[^.]*\.?/gi, "").replace(/\s{2,}/g, " ").trim();
  return rest > 0 ? `${withoutScreenWords} And ${rest} more — the WonderHome app has the full list.` : withoutScreenWords;
}
