import { formatDate } from "../context/format";
import { isUsable } from "../context/freshness";
import { explainProvenance } from "../context/provenance";
import { mentionedItems, resolvePerson } from "../context/resolution";
import { getRecentChanges } from "../context/retrieval";
import type { HouseholdContextItem } from "../context/types";

/**
 * "Why?" as a first-class capability (Wave 2 §10).
 *
 * "Why are you asking me this?", "Where did this date come from?", "What
 * did I just send you?" are answered from observable evidence only — the
 * proposal WonderHome recorded and the reason it recorded with it, the
 * question it asked and what prompted it, the rows a fact came from, the
 * HomeSend intake a record was routed from. Never a model's reasoning, and
 * never anything a model composed: these answers are assembled here, from
 * the same viewer-scoped facts every other answer uses, so they cannot
 * invent and cannot reach past what this person may see.
 */

export const WHY_TOPICS = ["why_approval", "why_not_done", "why_person", "why_question", "changed_after_send", "sent", "source", "recent_changes"] as const;
export type WhyTopic = (typeof WHY_TOPICS)[number];

export type WhyQuestion = { topic: WhyTopic; subject: string | null };

const PATTERNS: readonly { topic: WhyTopic; pattern: RegExp; subject?: (match: RegExpMatchArray, text: string) => string | null }[] = [
  {
    topic: "why_approval",
    pattern: /\bwhy\b.*\b(?:approv\w*|permission|(?:need|want|ask(?:ing)? for) (?:my |a |the )?(?:yes|ok|okay|go-?ahead|confirmation|sign-?off)|ask(?:ing)? (?:me )?(?:first|before))/,
  },
  {
    topic: "why_not_done",
    pattern: /\bwhy (?:didn'?t|did not|haven'?t|have not|wasn'?t|isn'?t|won'?t|couldn'?t|can'?t|hasn'?t) (?:you |it |that |this |anything )?(?:\w+ )?(?:add|added|do|done|book|booked|pay|paid|order|ordered|schedule|scheduled|put|save|saved|remember|change|changed|update|updated|go through|happen|work|get added)\b/,
  },
  {
    topic: "why_person",
    pattern: /\bwhy (?:do|did|would|are) you (?:think|say|saying|assume|believe|decide|decided)\b.*\b(?:for|about|belongs? to|is|was)\s+([a-z][a-z'-]+?)(?:'s)?$/,
    subject: (match) => match[1] ?? null,
  },
  {
    topic: "why_question",
    pattern: /^why (?:are|did|do|were|would) you (?:ask|asking|need to know|want to know|asked)\b/,
  },
  {
    topic: "changed_after_send",
    pattern: /\bwhat did (?:wonderhome|you|homesend|it) (?:change|do|add|update|make|create)\b.*\b(?:after|when|from|with)\b.*\b(?:i|we) (?:sent|send|shared|forwarded|uploaded)\b|\bwhat (?:happened|changed) (?:to|with|after|from) (?:what|the thing|the \w+|it) (?:i|we) (?:sent|shared|forwarded|uploaded)\b/,
  },
  {
    topic: "sent",
    pattern: /\bwhat did (?:i|we) (?:just |last )?(?:send|share|forward|upload)\b|\bwhat (?:was|is) the last thing (?:i|we) (?:sent|shared|forwarded|uploaded)\b|\bdid you get what (?:i|we) (?:sent|shared)\b/,
  },
  {
    topic: "source",
    pattern: /\bwhere (?:did|does|do|is|was) (?:this|that|these|those|the|it|you get|you find)\b.*\b(?:come from|coming from|from|get|find)\b|\bhow (?:do|did) you know\b|\bwhat(?:'s| is) (?:the|your) source\b|\bwhere did you (?:get|find|see|read)\b|\bsource (?:for|of) (?:this|that)\b/,
    subject: (_match, text) => (/\b(?:date|when|day|time)\b/.test(text) ? "date" : /\b(?:amount|cost|price|much)\b/.test(text) ? "amount" : null),
  },
  {
    topic: "recent_changes",
    pattern: /\bwhat(?:'s| has| have)? changed\b|\bwhat(?:'s| is) (?:new|different) since\b|\banything (?:new|changed|different) since\b/,
  },
];

/** Reads an explanation request, or null when the utterance is not one. */
export function readWhyQuestion(utterance: string): WhyQuestion | null {
  const text = utterance.toLowerCase().replace(/[’]/g, "'").replace(/[?!.]+$/, "").replace(/\s+/g, " ").trim();
  for (const { topic, pattern, subject } of PATTERNS) {
    const match = text.match(pattern);
    if (match) return { topic, subject: subject ? subject(match, text) : null };
  }
  return null;
}

/** The last thing HomeTalk proposed or did in this conversation, as it was recorded. */
export type RecordedAction = {
  summary: string | null;
  actionType: string;
  /** The stored approval status: proposed, approved, rejected, executed, failed. */
  status: string;
  /** What the engine decided: answer, prepared, needs_approval, executed, refused. */
  kind: string | null;
  /** The reason recorded with the preview — the autonomy decision, in words. */
  because: string | null;
  /** Why it did not go through, when it did not. */
  failure: string | null;
};

export type WhyInput = WhyQuestion & {
  /** Every fact this viewer may see — the same viewer-filtered snapshot as any answer. */
  items: readonly HouseholdContextItem[];
  viewerMemberId: string;
  timezone: string;
  now: Date;
  lastAssistantText: string | null;
  lastAction: RecordedAction | null;
  /** The question WonderHome asked last turn, if it asked one. */
  clarifying: { question: string; utterance: string; action: string } | null;
};

export type WhyAnswer = { text: string; evidenceIds: string[] };

export function explain(input: WhyInput): WhyAnswer {
  switch (input.topic) {
    case "why_approval":
      return whyApproval(input);
    case "why_not_done":
      return whyNotDone(input);
    case "why_question":
      return whyQuestion(input);
    case "why_person":
    case "source":
      return whereFrom(input);
    case "sent":
      return lastSent(input);
    case "changed_after_send":
      return changedAfterSend(input);
    case "recent_changes":
      return recentChanges(input);
  }
}

function whyApproval({ lastAction }: WhyInput): WhyAnswer {
  if (!lastAction || lastAction.status !== "proposed") {
    return { text: lastAction?.status === "executed" && lastAction.summary ? `Nothing is waiting for your approval — the last thing ("${lastAction.summary}") was already done.` : "Nothing is waiting for your approval right now.", evidenceIds: [] };
  }
  const what = lastAction.summary ? ` — "${lastAction.summary}" —` : "";
  const because = lastAction.because ? lowerFirst(lastAction.because) : "this household's setting for it is to ask first";
  if (lastAction.kind === "prepared") {
    return { text: `I prepared it${what} rather than doing it, because ${ensurePeriod(because)} It is waiting for you.`, evidenceIds: [] };
  }
  return { text: `I asked before doing it${what} because ${ensurePeriod(because)} Nothing happens until someone says yes.`, evidenceIds: [] };
}

function whyNotDone({ lastAction, lastAssistantText, clarifying }: WhyInput): WhyAnswer {
  if (lastAction) {
    const what = lastAction.summary ? `"${lastAction.summary}"` : "that";
    switch (lastAction.status) {
      case "failed":
        return { text: `I tried ${what}, and it did not go through${lastAction.failure ? `: ${ensurePeriod(lastAction.failure)}` : "."}`, evidenceIds: [] };
      case "executed":
        return { text: `It was done: ${what}.`, evidenceIds: [] };
      case "rejected":
        return { text: lastAssistantText ? `I did not, because: ${lastAssistantText}` : `I did not do ${what} — it was turned down.`, evidenceIds: [] };
      case "proposed":
        return lastAction.kind === "prepared"
          ? { text: `I prepared ${what} but did not do it${lastAction.because ? `, because ${ensurePeriod(lowerFirst(lastAction.because))}` : "."} It is waiting for you.`, evidenceIds: [] }
          : { text: `It is waiting for a yes: ${what}. Say yes and I will do it.`, evidenceIds: [] };
    }
  }
  if (clarifying) return { text: `I did not change anything because I needed to know more first: ${clarifying.question}`, evidenceIds: [] };
  return { text: "I did not change anything because I was not sure what you wanted. Tell me again what to add and I will take it from there.", evidenceIds: [] };
}

function whyQuestion({ clarifying, lastAssistantText }: WhyInput): WhyAnswer {
  if (clarifying) {
    const missing = clarifying.action === "unknown" ? "match anything I know how to do yet" : "tell me enough to be sure what you meant";
    return { text: `I asked "${clarifying.question}" because "${clarifying.utterance}" did not ${missing}. I only ask when going ahead could mean doing the wrong thing.`, evidenceIds: [] };
  }
  if (lastAssistantText?.trim().endsWith("?")) return { text: "I asked because I was not sure enough to go ahead without checking with you first.", evidenceIds: [] };
  return { text: "I have not asked you anything just now.", evidenceIds: [] };
}

const NOT_EVIDENCE = new Set(["household", "member", "pet", "state"]);

function whereFrom(input: WhyInput): WhyAnswer {
  const said = input.lastAssistantText ?? "";
  let candidates = said ? mentionedItems(said, input.items).filter((item) => !NOT_EVIDENCE.has(item.entityType) && isUsable(item)) : [];
  // A reply that paraphrased a fact names none of its aliases exactly; the
  // fact whose own words it mostly repeats is the one it came from.
  if (candidates.length === 0 && said) candidates = paraphrased(said, input.items);

  let person: { memberId: string; displayName: string } | null = null;
  if (input.topic === "why_person" && input.subject) {
    person = resolvePerson(input.subject, input.items, { viewerMemberId: input.viewerMemberId }).selected;
    if (person) {
      const about = candidates.filter((item) => item.subjectMemberIds.includes(person!.memberId));
      if (about.length > 0) candidates = about;
    }
  }
  if (input.subject === "date") {
    const dated = candidates.filter((item) => typeof item.attributes.date === "string");
    if (dated.length > 0) candidates = dated;
  }
  if (input.subject === "amount") {
    const priced = candidates.filter((item) => typeof item.attributes.amountMinor === "number");
    if (priced.length > 0) candidates = priced;
  }

  if (candidates.length === 0) {
    return {
      text: "I cannot point to a record behind that. If it came from something said in this conversation, it is not a household fact until it has been recorded or confirmed.",
      evidenceIds: [],
    };
  }

  const lines = candidates.slice(0, 3).map((item) => {
    const who = person && item.subjectMemberIds.includes(person.memberId) ? ` It is recorded for ${person.displayName.split(/\s+/)[0]}.` : "";
    return `- ${item.summary.replace(/\.$/, "")}. ${explainProvenance(item, input.timezone)}${who}`;
  });
  return { text: `Here is where that comes from:\n${lines.join("\n")}`, evidenceIds: candidates.slice(0, 3).map((item) => item.id) };
}

const STOP_WORDS = new Set(["the", "a", "an", "is", "are", "was", "on", "in", "at", "by", "for", "to", "of", "and", "or", "with", "it", "its", "this", "that", "has", "have", "be"]);

function contentWords(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((word) => word.length > 1 && !STOP_WORDS.has(word));
}

function paraphrased(said: string, items: readonly HouseholdContextItem[]): HouseholdContextItem[] {
  const spoken = new Set(contentWords(said));
  return items
    .filter((item) => !NOT_EVIDENCE.has(item.entityType) && isUsable(item))
    .map((item) => {
      const words = contentWords(item.summary);
      const shared = words.filter((word) => spoken.has(word)).length;
      return { item, overlap: words.length > 0 ? shared / words.length : 0, shared };
    })
    .filter((entry) => entry.shared >= 3 && entry.overlap >= 0.6)
    .sort((a, b) => b.overlap - a.overlap)
    .map((entry) => entry.item);
}

function latestSentBy(input: WhyInput): HouseholdContextItem | null {
  return (
    input.items
      .filter((item) => item.entityType === "homesend_item" && item.subjectMemberIds.includes(input.viewerMemberId))
      .sort((a, b) => Date.parse(b.source.capturedAt ?? b.freshnessAt) - Date.parse(a.source.capturedAt ?? a.freshnessAt))[0] ?? null
  );
}

function lastSent(input: WhyInput): WhyAnswer {
  const item = latestSentBy(input);
  if (!item) return { text: "I do not see anything you have sent to HomeSend yet.", evidenceIds: [] };
  return { text: `The last thing you sent: ${item.summary}`, evidenceIds: [item.id] };
}

function changedAfterSend(input: WhyInput): WhyAnswer {
  const sent = latestSentBy(input);
  if (!sent) return { text: "I do not see anything you have sent to HomeSend yet, so nothing has changed because of it.", evidenceIds: [] };

  const status = String(sent.attributes.status ?? "");
  const when = sent.source.capturedAt ? ` on ${formatDate(new Date(sent.source.capturedAt), input.timezone)}` : "";
  if (status === "received" || status === "classified") return { text: `Nothing yet. What you sent${when} is waiting for someone to confirm it before anything is added.`, evidenceIds: [sent.id] };
  if (status === "dismissed") return { text: `Nothing. What you sent${when} was set aside, so nothing was added from it.`, evidenceIds: [sent.id] };
  if (status === "undone") return { text: `What you sent${when} was added and later undone, so nothing from it is on record now.`, evidenceIds: [sent.id] };

  const routedId = typeof sent.attributes.routedId === "string" ? sent.attributes.routedId : null;
  const made = input.items.filter(
    (item) => item.id !== sent.id && (item.evidence.some((ref) => ref.type === "homesend_intake" && ref.sourceId === sent.entityId) || (routedId !== null && item.entityId === routedId)),
  );
  if (made.length === 0) return { text: `What you sent${when} was added to the household's records.`, evidenceIds: [sent.id] };
  return {
    text: `After you sent it${when}, WonderHome added:\n${made.slice(0, 4).map((item) => `- ${item.summary}`).join("\n")}`,
    evidenceIds: [sent.id, ...made.slice(0, 4).map((item) => item.id)],
  };
}

function recentChanges(input: WhyInput): WhyAnswer {
  const since = new Date(input.now.getTime() - 24 * 3_600_000);
  const changes = getRecentChanges({ items: [...input.items] }, { since }).filter((item) => !NOT_EVIDENCE.has(item.entityType));
  if (changes.length === 0) {
    return { text: "Nothing on record has changed since yesterday. (I can only see changes that carry a time — a new message, something sent to HomeSend, an order, a proposal.)", evidenceIds: [] };
  }
  return {
    text: `Since yesterday:\n${changes.slice(0, 8).map((item) => `- ${item.summary}`).join("\n")}`,
    evidenceIds: changes.slice(0, 8).map((item) => item.id),
  };
}

function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function ensurePeriod(value: string): string {
  const trimmed = value.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}
