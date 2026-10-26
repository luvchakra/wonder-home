"use client";

import {
  ArrowDown,
  CalendarHeart,
  GraduationCap,
  ListChecks,
  Pencil,
  ShoppingBasket,
  Sparkles,
  Wallet,
  X,
  Square,
  Users,
} from "lucide-react";
import Link from "next/link";
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import type { ActionPreview as ActionPreviewShape } from "@wonderhome/core/conversation/proposal";
import type { PlaceSuggestion } from "@wonderhome/core/homeplaces/service";
import { spokenSummary } from "@wonderhome/core/conversation/speech";
import { ActionPreview } from "@wonderhome/core/ui/action-preview";
import { AnswerChoices } from "@wonderhome/core/ui/answer-choices";
import { PreviewInfo } from "@wonderhome/core/ui/preview-info";
import { combinedSay, type HomeTalkChoices } from "@wonderhome/core/hometalk/choices";
import { messageDay, messageDayLabel, messageTime } from "@wonderhome/core/conversation/message-time";
import { AiOrb, ChatDayDivider, ChatMessage, ChatTimeRoom, SuggestionChips } from "@wonderhome/core/ui/ai-message";
import { Button } from "@wonderhome/core/ui/button";
import { safeHref, useLiveTalk } from "@wonderhome/core/ui/live-talk";
import { TalkComposer, type TalkComposerState } from "@wonderhome/core/ui/talk-composer";

import type { AssistantLabels, SuggestionKey } from "./hometalk-labels";
import { Pill } from "@wonderhome/core/ui/pill";
import { ReplyText } from "@wonderhome/core/ui/reply-text";

import { HomeSendSheet } from "../_components/home-send-sheet";
import { PlaceCards, type PlaceMark } from "./place-cards";
import type { HomeSendReviewLabels } from "../_lib/homesend-labels";

/**
 * The conversation itself.
 *
 * Every turn is a request to the same governed endpoint whether it was typed
 * or spoken. What comes back is text plus, sometimes, an action preview; the
 * preview's Confirm and Cancel are themselves requests naming the action, so
 * consent is a thing the server records rather than a thing the client claims.
 */
type ActionState = "proposed" | "approved" | "rejected" | "executed" | "failed" | "expired";

export type AssistantMessage = {
  id: string;
  role: "member" | "assistant";
  text: string;
  pending?: boolean;
  action?: { id: string; status: ActionState; preview: ActionPreviewShape | null; unchanged?: boolean; fingerprint?: string | null; awaitingAdult?: string | null } | null;
  /** A preview WonderHome showed without recording an action (e.g. prepared). */
  preview?: ActionPreviewShape | null;
  proposal?: string;
  /** Who said this, spelled out — set only for a live conversation's turns. */
  speaker?: string;
  /** When it was said (ISO 8601). Unset only on the "thinking" placeholder. */
  at?: string;
  /** Places a HomePlaces answer offered, shown as cards under it. */
  places?: PlaceSuggestion[] | null;
  /** An Ask me about family question still waiting: the part of the app it fills. */
  amaf?: { section: string; href: string; left: number } | null;
  /** The answers its question offers to pick (rule 20); open only while it is the latest message. */
  choices?: HomeTalkChoices | null;
  /** Only asked something: no preview card under a question. */
  questionOnly?: boolean;
};

/** Far enough back to be deliberate rather than a stray touch. */
const BACK_AT_LEAST = 120;
/** How long a typed or spoken turn is waited for before HomeTalk stops waiting and says so. */
const REPLY_WAIT_MS = 45_000;

const SUGGESTIONS: { key: SuggestionKey; utterance: string; icon: ReactNode }[] = [
  { key: "outing", utterance: "Plan a family outing this weekend.", icon: <CalendarHeart aria-hidden className="size-4 text-[var(--wh-tone-people)]" /> },
  { key: "coriander", utterance: "Add coriander to the grocery list.", icon: <ShoppingBasket aria-hidden className="size-4 text-[var(--wh-tone-care)]" /> },
  { key: "project", utterance: "How is Anaya's project coming along?", icon: <GraduationCap aria-hidden className="size-4 text-[var(--wh-tone-school)]" /> },
  { key: "schedule", utterance: "Show me tomorrow's schedule.", icon: <Sparkles aria-hidden className="size-4 text-[var(--wh-tone-ai)]" /> },
  { key: "bill", utterance: "Pay the electricity bill.", icon: <Wallet aria-hidden className="size-4 text-[var(--wh-tone-money)]" /> },
  { key: "schoolRun", utterance: "Priya handles the school run from now on.", icon: <ListChecks aria-hidden className="size-4 text-[var(--wh-primary)]" /> },
];


export function Assistant({
  householdId,
  memberName,
  memberAvatarUrl,
  firstName,
  initialMessages,
  initialQuery,
  liveConversationAvailable = false,
  serverVoice = false,
  voiceLanguage = "en-IN",
  liveEngine = "wonderhome",
  geminiLive = { available: false },
  kids = [],
  needsAdult = false,
  canAddChild = false,
  timeZone = "Asia/Kolkata",
  labels,
  homeSendLabels,
  placeMarks = {},
}: {
  householdId: string;
  memberName: string;
  /** Their photo from Family, beside their own messages. */
  memberAvatarUrl?: string | null;
  firstName: string;
  initialMessages: AssistantMessage[];
  initialQuery?: string;
  /** The deployment's rollout flag and this household's plan both say yes. */
  liveConversationAvailable?: boolean;
  /** This household has a speech provider configured, so the server does the listening. */
  serverVoice?: boolean;
  voiceLanguage?: string;
  /** Who runs a live conversation: WonderHome's own loop, or Gemini Live calling HomeTalk's tools (voice phase 3). */
  liveEngine?: "wonderhome" | "gemini_live";
  /** Whether Gemini Live may run now, and why not — the composer's picker offers only what can. */
  geminiLive?: { available: boolean; reason?: string; fix?: { href: string; label: string } };
  /** For HomeSend's school-item confirm step ("who is this for"). */
  kids?: { id: string; displayName: string }[];
  /** A child or helper: their "go ahead" sends the request to a grown-up for the final OK. */
  needsAdult?: boolean;
  /** Whether the viewer may add a child from a school notice (story 08-009). */
  canAddChild?: boolean;
  /** The household's own zone, which every message time and date divider is shown in. */
  timeZone?: string;
  /** The screen's own words in the viewer's language (story 22-004). */
  labels: AssistantLabels;
  /** The paperclip's HomeSend sheet in the viewer's language; English when not given. */
  homeSendLabels: HomeSendReviewLabels;
  /** What the household already said about places (saved, not for us), by place id. */
  placeMarks?: Readonly<Record<string, PlaceMark>>;
}) {
  const errorWords = labels.error;
  const [messages, setMessages] = useState<AssistantMessage[]>(initialMessages);
  const [busy, setBusy] = useState(false);
  // A reply that hangs can be stopped (the owner, 2026-10-20: "give an option to
  // stop such a scenario"), and one that takes past REPLY_WAIT_MS stops itself.
  // Stopping stops the waiting only: a turn the server already began is still on
  // record, so the words say to look before asking again.
  const inFlight = useRef<{ controller: AbortController; why: "stopped" | "tooLong" | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * The turn that did not get through, kept so it can be sent again — with
   * the same idempotency key (story 15-005). A retry after a request that
   * actually reached the server must not leave the household with the turn
   * recorded twice, so the key belongs to the attempt rather than the click.
   */
  const [failed, setFailed] = useState<{ utterance: string; channel: "text" | "voice"; transcriptConfidence?: number; key: string; editMessageId?: string } | null>(
    null,
  );
  /** The household's own message being reworded, and its original text (story 04-003, as a structural edit). */
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  /** HomeSend: a photo, file or pasted forward — the composer's second door (rule 13). */
  const [homeSendOpen, setHomeSendOpen] = useState(false);
  const sentInitial = useRef(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  /** "Another day…": the answer is typed, so the cursor goes to the text box. */
  const focusComposer = useCallback(() => composerRef.current?.querySelector("textarea")?.focus(), []);
  /**
   * Whether the reader has scrolled back through the conversation.
   *
   * In a `flex-col-reverse` scroller the newest message sits at scrollTop 0
   * and scrolling back moves away from it — negative in most engines,
   * positive in some — so the distance is what matters, never the sign.
   */
  const [scrolledBack, setScrolledBack] = useState(false);
  /**
   * The first member message of the live session in progress, for the recap
   * once it ends. Kept by the app-wide live session, so a conversation that
   * wandered off to the grocery list and came back still recaps from its start.
   */
  const talk = useLiveTalk();

  /**
   * Nothing scrolls the page here. The message list is its own scroll
   * container laid out bottom-up (`flex-col-reverse`), so it opens already at
   * the newest message on the very first server-rendered paint — no
   * scrollIntoView, and no jump when hydration lands a moment later, which
   * is what every earlier "scroll to the end" attempt could not avoid. This
   * only re-pins it after a new turn, in case the reader had scrolled up.
   * In a column-reverse scroller the end is scrollTop 0.
   */
  useEffect(() => {
    const scroller = scrollerRef.current;
    // Only re-pin a reader who was already at the newest message. Yanking
    // somebody back down mid-sentence because a reply arrived is the thing
    // the arrow below exists to let them choose instead.
    if (scroller && !scrolledBack) scroller.scrollTop = 0;
  }, [messages.length, scrolledBack]);

  const onScroll = useCallback(() => {
    const scroller = scrollerRef.current;
    if (scroller) setScrolledBack(Math.abs(scroller.scrollTop) > BACK_AT_LEAST);
  }, []);

  const jumpToLatest = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    scroller.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  }, []);

  const send = useCallback(
    async (
      utterance: string,
      channel: "text" | "voice",
      transcriptConfidence?: number,
      retryKey?: string,
      editMessageId?: string,
      live?: boolean,
    ): Promise<string> => {
      if (busy) return "";
      setBusy(true);
      setError(null);
      setFailed(null);

      const idempotencyKey = retryKey ?? newIdempotencyKey();

      const optimisticId = `local-${Date.now()}`;
      const speaker = live ? { member: firstName, assistant: "WonderHome" } : null;
      setMessages((current) => {
        // Editing replaces the edited message and everything that followed
        // it — ordinarily just its own reply — with the new turn, the same
        // truncation the server applies before it regenerates a reply.
        const editedIndex = editMessageId ? current.findIndex((message) => message.id === editMessageId) : -1;
        const base = editedIndex === -1 ? current : current.slice(0, editedIndex);
        return [
          ...base,
          { id: optimisticId, role: "member", text: utterance, speaker: speaker?.member, at: new Date().toISOString() },
          { id: `${optimisticId}-pending`, role: "assistant", text: "", pending: true },
        ];
      });

      const flight = { controller: new AbortController(), why: null as "stopped" | "tooLong" | null };
      inFlight.current = flight;
      const timer = window.setTimeout(() => {
        flight.why = "tooLong";
        flight.controller.abort();
      }, REPLY_WAIT_MS);
      try {
        const response = await fetch(`/api/v1/households/${householdId}/conversation`, {
          method: "POST",
          headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
          body: JSON.stringify({ utterance, channel, transcriptConfidence, editMessageId }),
          signal: flight.controller.signal,
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload?.error?.message ?? errorWords.answer);
        }

        if (live && payload.memberMessageId) talk?.markStart(payload.memberMessageId);

        // A request with several parts comes back as one reply per part,
        // each with its own preview (Wave 4 §10); anything else is one.
        const replies: {
          id: string;
          text: string;
          action?: AssistantMessage["action"];
          preview?: ActionPreviewShape | null;
          proposal?: string;
          places?: PlaceSuggestion[];
          navigate?: string;
          amaf?: AssistantMessage["amaf"];
          choices?: HomeTalkChoices | null;
          questionOnly?: boolean;
        }[] = Array.isArray(payload.replies) && payload.replies.length > 0 ? payload.replies : [payload.reply];
        setMessages((current) =>
          current
            .filter((message) => message.id !== `${optimisticId}-pending`)
            .map((message) => (message.id === optimisticId ? { ...message, id: payload.memberMessageId ?? message.id } : message))
            .concat(
              replies.map((reply) => ({
                id: reply.id,
                role: "assistant" as const,
                text: reply.text,
                action: reply.action ?? null,
                preview: reply.preview ?? null,
                proposal: reply.proposal,
                places: reply.places ?? null,
                amaf: reply.amaf ?? null,
                choices: reply.choices ?? null,
                questionOnly: reply.questionOnly === true,
                speaker: speaker?.assistant,
                at: new Date().toISOString(),
              })),
            ),
        );
        // "Take me to the grocery list": go there. A live conversation carries
        // on from that screen; a typed one leaves its answer here to come back to.
        const href = replies.map((reply) => safeHref(reply.navigate)).find(Boolean);
        if (href) talk?.navigate(href);
        return replies.map((reply) => reply.text).join("\n\n");
      } catch (caught) {
        if (flight.why) {
          // Stopped, by the person or the clock: said in the conversation, not as a failure.
          const words = flight.why === "stopped" ? labels.stopped : labels.tooLong;
          setMessages((current) =>
            current
              .filter((message) => message.id !== `${optimisticId}-pending`)
              .concat({ id: `${optimisticId}-stopped`, role: "assistant", text: words, at: new Date().toISOString() }),
          );
          return "";
        }
        setMessages((current) => current.filter((message) => message.id !== `${optimisticId}-pending`));
        setError(caught instanceof Error ? caught.message : errorWords.answer);
        setFailed({ utterance, channel, transcriptConfidence, key: idempotencyKey, editMessageId });
        return "";
      } finally {
        window.clearTimeout(timer);
        if (inFlight.current === flight) inFlight.current = null;
        setBusy(false);
      }
    },
    [busy, householdId, firstName, errorWords, talk, labels.stopped, labels.tooLong],
  );

  /** A live turn: send what was heard, and read back what to say (never throws — the hook's own contract). */
  const handleLiveUtterance = useCallback(
    async (transcript: string, confidence: number): Promise<string> => {
      const replyText = await send(transcript, "voice", confidence, undefined, undefined, true);
      // Heard as a short summary (the owner, 2026-10-20); the whole reply stays on screen.
      return replyText
        ? spokenSummary(replyText, { language: labels.time.locale, tail: labels.restOnScreen, more: (count) => labels.andMore.replace("{count}", String(count)) })
        : "";
    },
    [send, labels.time.locale, labels.restOnScreen, labels.andMore],
  );

  /**
   * Gemini Live's words on each side, as they were said. HomeTalk keeps its
   * own record of every tool call it answered; these are what was heard and
   * spoken around them, shown so the conversation reads on screen too.
   */
  const handleLiveTranscript = useCallback(
    (entry: { role: "member" | "assistant"; text: string; id?: string }) => {
      setMessages((current) =>
        current.concat({
          id: entry.id ?? `live-${Date.now()}-${current.length}`,
          role: entry.role,
          text: entry.text,
          speaker: entry.role === "member" ? firstName : "WonderHome",
          at: new Date().toISOString(),
        }),
      );
    },
    [firstName],
  );

  // Gemini Live's own transcriber misspells; the same turn written down from its audio replaces the line.
  const handleLiveTranscriptRevised = useCallback((entry: { id: string; text: string }) => {
    setMessages((current) => current.map((message) => (message.id === entry.id ? { ...message, text: entry.text } : message)));
  }, []);

  /**
   * A document applied from the paperclip (DDU 2.0 §32): HomeTalk says what
   * it actually did, from the stored receipt — the same pipeline and writes
   * HomeSend's own screen uses, only told in the conversation.
   */
  const postDocumentReceipt = useCallback(
    async (itemId: string) => {
      try {
        const response = await fetch(`/api/v1/households/${householdId}/conversation`, {
          method: "POST",
          headers: { "content-type": "application/json", "idempotency-key": `document-${itemId}` },
          body: JSON.stringify({ documentReceipt: itemId }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error?.message ?? errorWords.document);
        setMessages((current) => (current.some((message) => message.id === payload.reply.id) ? current : current.concat({ id: payload.reply.id, role: "assistant", text: payload.reply.text, at: new Date().toISOString() })));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : errorWords.document);
      }
    },
    [householdId, errorWords],
  );

  /** Ends a live session: fetches the recap for everything said since it began, and posts it as a message. */
  const endLiveSession = useCallback(async () => {
    const startId = talk?.takeStart() ?? null;
    if (!startId) return;
    try {
      const response = await fetch(`/api/v1/households/${householdId}/conversation`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ summarizeSince: startId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? errorWords.summary);
      setMessages((current) => current.concat({ id: payload.reply.id, role: "assistant", text: payload.reply.text, at: new Date().toISOString() }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : errorWords.summary);
    }
  }, [householdId, errorWords, talk]);

  /**
   * What the composer is doing. The screen only needs this for one
   * decision — whether the Edit pill makes sense — so it is a single
   * piece of state rather than the whole voice machine repeated up here.
   */
  const [composerState, setComposerState] = useState<TalkComposerState>("idle");
  const voiceInProgress = composerState !== "idle" && composerState !== "typing";

  const onComposerState = useCallback((next: TalkComposerState) => {
    setComposerState(next);
    // Starting to talk clears a half-finished reword: the two are
    // different intentions and one should not silently ride on the other.
    if (next === "live") {
      setEditing(null);
      setError(null);
    }
  }, []);

  /** The composer's own submit — routed through whichever message, if any, is being reworded. */
  const handleComposerSend = useCallback(
    (text: string, channel: "text" | "voice", transcriptConfidence?: number) => {
      const editMessageId = editing?.id;
      setEditing(null);
      void send(text, channel, transcriptConfidence, undefined, editMessageId);
    },
    [editing, send],
  );

  const startEdit = useCallback((message: AssistantMessage) => {
    setError(null);
    setEditing({ id: message.id, text: message.text });
  }, []);

  const decide = useCallback(
    async (actionId: string, decision: "approved" | "rejected", fingerprint: string | null = null) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        const response = await fetch(`/api/v1/households/${householdId}/conversation`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          // What this card showed (Wave 5 §20): an approval is only for
          // that exact version of the proposal.
          body: JSON.stringify({ actionId, decision, ...(fingerprint ? { fingerprint } : {}) }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error?.message ?? errorWords.decision);

        setMessages((current) =>
          current
            .map((message) =>
              message.action?.id === actionId ? { ...message, action: { ...message.action, status: payload.reply.action?.status ?? decision, awaitingAdult: payload.reply.action?.awaitingAdult ?? message.action.awaitingAdult ?? null } } : message,
            )
            .concat({ id: payload.reply.id, role: "assistant", text: payload.reply.text, at: new Date().toISOString() }),
        );
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : errorWords.decision);
      } finally {
        setBusy(false);
      }
    },
    [busy, householdId, errorWords],
  );

  useEffect(() => {
    if (initialQuery && !sentInitial.current) {
      sentInitial.current = true;
      void send(initialQuery, "text");
    }
  }, [initialQuery, send]);

  const quiet = messages.length === 0;
  // Ask me about family is waiting on an answer only while its question is the last thing said.
  const lastMessage = messages.at(-1);
  const amafNow = lastMessage && lastMessage.role === "assistant" && !lastMessage.pending ? (lastMessage.amaf ?? null) : null;

  // The one message that may still be reworded: the household's own last
  // word, and only while nothing has come of it yet — an approved or
  // executed action is a thing that happened, not a draft.
  let lastMemberIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]!.role === "member") {
      lastMemberIndex = index;
      break;
    }
  }
  const editLocked = messages
    .slice(lastMemberIndex + 1)
    .some((message) => message.action?.status === "approved" || message.action?.status === "executed");
  // A structural edit part-way through speaking would confuse a
  // conversation that is otherwise flowing by voice, so the pill only
  // appears while the composer is back to typing.
  const editableMessageId = lastMemberIndex !== -1 && !editLocked && !voiceInProgress ? messages[lastMemberIndex]!.id : null;

  return (
    // Exactly the space between the header and main's own bottom padding (which
    // already clears the tab bar and its raised button), so the page itself
    // never scrolls: the conversation does, inside.
    <div className="flex h-[calc(100dvh-var(--wh-header-height)-env(safe-area-inset-top)-var(--wh-tabbar-height)-var(--wh-tabbar-raised-overhang)-1rem)] min-h-0 flex-col lg:h-[calc(100dvh-var(--wh-header-height)-4.5rem)]">
      {quiet ? (
        // Scrolls inside itself when a short phone cannot fit it all, so the
        // composer below keeps its place above the tab bar; `m-auto` centres
        // it when there is room without clipping the top when there is not.
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain [scrollbar-width:thin]">
        <div className="wh-rise m-auto flex flex-col items-center px-2 py-8 text-center">
          <AiOrb size={88} />
          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-balance">
            {labels.greeting.replace("{name}", firstName)} <span aria-hidden>👋</span>
            <br />
            {labels.helpQuestion}
          </h1>
          <p className="mt-2 max-w-sm text-sm text-[var(--wh-foreground-muted)]">{labels.intro}</p>
          <p className="mt-6 mb-2 text-[0.6875rem] font-semibold tracking-wide text-[var(--wh-foreground-subtle)] uppercase">
            {labels.suggestionsHeading}
          </p>
          <SuggestionChips
            suggestions={[
              ...SUGGESTIONS.map(({ key, utterance, icon }) => ({ label: labels.suggestions[key], utterance, icon })),
              ...(needsAdult ? [] : [{ label: labels.amaf.start, utterance: "Ask me about my family", icon: <Users aria-hidden className="size-4 text-[var(--wh-tone-people)]" /> }]),
            ]} onPick={(utterance) => void send(utterance, "text")} className="justify-center" />
        </div>
        </div>
      ) : (
        <div
          ref={scrollerRef}
          onScroll={onScroll}
          className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto overscroll-contain [scrollbar-width:thin]"
          aria-live="polite"
        >
          <div className="space-y-2.5 pt-2 pb-1">
          {messages.map((message, index) => {
            const sentAt = message.at ? { label: messageTime(new Date(message.at), timeZone, labels.time), dateTime: message.at } : undefined;
            const withPlaces = Boolean(message.places && message.places.length > 0);
            // A settled turn's preview sits behind an "i" beside its time; one still waiting for a decision stays inline (the owner, 2026-10-26).
            const preview = message.role === "assistant" ? (message.action?.preview ?? message.preview ?? null) : null;
            const deciding = message.action?.status === "proposed";
            const info = preview && !deciding ? (
              <PreviewInfo
                label={labels.previewDetails}
                preview={{
                  labels: labels.preview,
                  state: stateOf(message),
                  understood: preview.summary,
                  plan: message.action?.unchanged ? [labels.alreadyOnRecord] : preview.changes,
                  impact: preview.because,
                  // "Can be undone" only when something was done and it is true; never under a question.
                  reversible: !message.questionOnly && stateOf(message) === "executed" ? preview.reversible : undefined,
                }}
              />
            ) : null;
            return (
            <Fragment key={message.id}>
            {/* A date between the days, as a messaging app shows it. */}
            {message.at && dayChanges(messages, index, timeZone) ? <ChatDayDivider label={messageDayLabel(new Date(message.at), timeZone, new Date(), labels.time)} /> : null}
            <ChatMessage
              id={`message-${message.id}`}
              role={message.role}
              name={memberName}
              avatarUrl={memberAvatarUrl}
              speaker={message.speaker}
              pending={message.pending}
              sentAt={sentAt}
              timeTail={message.role === "assistant" && !withPlaces}
              timeLead={info}
              aside={
                preview && deciding ? (
                  <ActionPreview
                    labels={labels.preview}
                    state={stateOf(message)}
                    understood={(message.action?.preview ?? message.preview)!.summary}
                    plan={message.action?.unchanged ? [labels.alreadyOnRecord] : (message.action?.preview ?? message.preview)!.changes}
                    impact={(message.action?.preview ?? message.preview)!.because}
                    reversible={(message.action?.preview ?? message.preview)!.reversible}
                    stateLabel={message.action?.status === "proposed" && message.action.awaitingAdult ? labels.waitingFor.replace("{name}", message.action.awaitingAdult) : undefined}
                    controls={
                      message.action?.status === "proposed" && message.action.awaitingAdult ? (
                        <Pill type="button" tone="quiet" onClick={() => void decide(message.action!.id, "rejected")} disabled={busy}>
                          {labels.cancel}
                        </Pill>
                      ) : message.action?.status === "proposed" ? (
                        <>
                          <Button onClick={() => void decide(message.action!.id, "approved", message.action!.fingerprint ?? null)} disabled={busy}>
                            {needsAdult ? labels.askAdult : labels.confirm}
                          </Button>
                          <Pill type="button" tone="quiet" onClick={() => void send("Actually, let me change that.", "text")} disabled={busy}>
                            {labels.change}
                          </Pill>
                          <Pill type="button" tone="quiet" onClick={() => void decide(message.action!.id, "rejected")} disabled={busy}>
                            {labels.cancel}
                          </Pill>
                        </>
                      ) : null
                    }
                  />
                ) : message.id === editableMessageId ? (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => startEdit(message)}
                      disabled={busy || editing?.id === message.id}
                      aria-label={labels.editAria}
                      className="relative inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium before:absolute before:inset-x-0 before:-inset-y-2.5 before:content-[''] text-[var(--wh-foreground-subtle)] transition-colors hover:bg-[var(--wh-surface-muted)] hover:text-[var(--wh-foreground)] disabled:opacity-40"
                    >
                      <Pencil aria-hidden className="size-3" /> {labels.edit}
                    </button>
                  </div>
                ) : null
              }
            >
              {message.role === "assistant" ? (
                withPlaces ? (
                  <div className="space-y-2">
                    {/* The cards say what the list said; the words around it stay. */}
                    <ReplyText text={withoutList(message.text, message.places!)} className="space-y-1.5" />
                    <PlaceCards householdId={householdId} messageId={message.id} places={message.places!} marks={placeMarks} labels={labels.places} />
                  </div>
                ) : (
                  <ReplyText text={message.text} className="space-y-1.5" tail={sentAt ? <ChatTimeRoom label={sentAt.label} lead={Boolean(info)} /> : null} />
                )
              ) : (
                message.text
              )}
            </ChatMessage>
              {message.role === "assistant" && message.choices ? (
                <div className="ps-12">
                  <AnswerChoices
                    legend={labels.choices.legend}
                    sendLabel={labels.choices.send}
                    name={`choices-${message.id}`}
                    mode={message.choices.mode}
                    choices={message.choices.choices}
                    also={message.choices.also}
                    // Open only on the latest message: once anything follows it, it was answered.
                    disabled={busy || index !== messages.length - 1}
                    onPick={(say) => (say ? void send(say, "text") : focusComposer())}
                    onSend={(says) => void send(combinedSay(says), "text")}
                  />
                </div>
              ) : null}
              {message.pending ? (
              <div className="ps-12">
                <Pill
                  type="button"
                  tone="quiet"
                  aria-label={labels.stopLabel}
                  onClick={() => {
                    const flight = inFlight.current;
                    if (!flight) return;
                    flight.why = "stopped";
                    flight.controller.abort();
                  }}
                >
                  <Square aria-hidden className="size-3 fill-current" /> {labels.stop}
                </Pill>
              </div>
            ) : null}
            </Fragment>
            );
          })}
          </div>
        </div>
      )}

      {error ? (
        <div role="alert" className="mb-2 flex flex-wrap items-center gap-2 rounded-[var(--wh-radius-sm)] bg-[var(--wh-risk-soft)] px-3 py-2 text-sm text-[var(--wh-risk)]">
          <span className="min-w-0 flex-1">{error}</span>
          {failed ? (
            <Pill
              type="button"
              tone="quiet"
              disabled={busy}
              onClick={() => void send(failed.utterance, failed.channel, failed.transcriptConfidence, failed.key, failed.editMessageId)}
            >
              {labels.tryAgain}
            </Pill>
          ) : null}
        </div>
      ) : null}

      {/* A plain flex child below the scroller — nothing is stacked over anything, so nothing can show through it. */}
      <div ref={composerRef} className="relative shrink-0 pt-1">
        {/* Only while the reader is actually back up the conversation —
            otherwise it is a button that does nothing, over the one thing
            on this screen somebody came to use. */}
        {scrolledBack ? (
          <button
            type="button"
            onClick={jumpToLatest}
            aria-label={labels.jumpLatest}
            title={labels.jumpLatest}
            className="wh-rise absolute -top-11 left-1/2 z-10 grid size-10 -translate-x-1/2 place-items-center rounded-full border border-[var(--wh-border)] bg-[var(--wh-surface)] text-[var(--wh-foreground-muted)] shadow-[var(--wh-shadow-float)] transition-colors hover:border-[var(--wh-primary)] hover:text-[var(--wh-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]"
          >
            <ArrowDown aria-hidden className="size-5" />
          </button>
        ) : null}
        {/* Ask me about family (the owner, 2026-10-20): subtle — one quiet line while a
            question waits: which part of the app the answer fills, how many are left,
            Skip and Stop. Otherwise, for an adult, the way in is the round people
            button beside the microphone (2026-10-21), passed to the composer below. */}
        {!editing && !voiceInProgress && amafNow ? (
            <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-xs text-[var(--wh-foreground-muted)]">
              <Users aria-hidden className="size-3.5 shrink-0 text-[var(--wh-tone-people)]" />
              <span className="font-semibold text-[var(--wh-foreground)]">{labels.amaf.mode}</span>
              <span aria-hidden>·</span>
              <Link href={amafNow.href} className="underline-offset-2 hover:underline">
                {amafNow.section}
              </Link>
              {amafNow.left > 0 ? (
                <>
                  <span aria-hidden>·</span>
                  <span>{amafNow.left === 1 ? labels.amaf.leftOne : labels.amaf.left.replace("{count}", String(amafNow.left))}</span>
                </>
              ) : null}
              <span className="ms-auto flex gap-1">
                <button type="button" disabled={busy} onClick={() => void send("skip", "text")} className="min-h-8 rounded-full px-2.5 font-semibold text-[var(--wh-primary)] hover:bg-[var(--wh-primary-soft)] disabled:opacity-50">
                  {labels.amaf.skip}
                </button>
                <button type="button" disabled={busy} onClick={() => void send("stop", "text")} className="min-h-8 rounded-full px-2.5 font-semibold text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)] disabled:opacity-50">
                  {labels.amaf.stop}
                </button>
              </span>
            </div>
        ) : null}
        {editing ? (
          <div className="mb-2 flex items-center justify-between rounded-[var(--wh-radius-sm)] bg-[var(--wh-primary-soft)] px-3 py-1.5 text-xs font-medium text-[var(--wh-primary)]">
            <span>{labels.editing}</span>
            <button
              type="button"
              onClick={() => setEditing(null)}
              aria-label={labels.cancelEditing}
              className="grid size-5 place-items-center rounded-full hover:bg-[var(--wh-primary)]/10"
            >
              <X aria-hidden className="size-3.5" />
            </button>
          </div>
        ) : null}
        <TalkComposer
          labels={labels.composer}
          key={editing?.id ?? "compose"}
          householdId={householdId}
          onSend={handleComposerSend}
          onLiveTurn={handleLiveUtterance}
          onLiveEnd={() => void endLiveSession()}
          onError={(message) => setError(message)}
          onStateChange={onComposerState}
          onAttach={() => setHomeSendOpen(true)}
          disabled={busy}
          initialValue={editing?.text ?? ""}
          autoFocus={Boolean(editing)}
          liveConversationAvailable={liveConversationAvailable}
          serverVoice={serverVoice}
          voiceLanguage={voiceLanguage}
          liveEngine={liveEngine}
          geminiLive={geminiLive}
          onLiveTranscript={handleLiveTranscript}
          onLiveTranscriptRevised={handleLiveTranscriptRevised}
          extraAction={
            !editing && !voiceInProgress && !amafNow && !needsAdult && !quiet
              ? { label: labels.amaf.start, icon: <Users aria-hidden className="size-5 text-[var(--wh-tone-people)]" />, onClick: () => void send("Ask me about my family", "text"), disabled: busy }
              : null
          }
        />
        <p className="mt-1 text-center text-[0.6875rem] leading-snug text-[var(--wh-foreground-subtle)]">
          {labels.footer}
        </p>
      </div>

      <HomeSendSheet householdId={householdId} kids={kids} canAddChild={canAddChild} open={homeSendOpen} onOpenChange={setHomeSendOpen} onDocumentApplied={postDocumentReceipt} labels={homeSendLabels} />
    </div>
  );
}


/**
 * Whether a divider goes above this message: it is the first with a time, or
 * the first on a new day in the household's zone. The "thinking" placeholder
 * has no time and never starts a day.
 */
function dayChanges(messages: AssistantMessage[], index: number, timeZone: string): boolean {
  const at = messages[index]?.at;
  if (!at) return false;
  for (let before = index - 1; before >= 0; before -= 1) {
    const earlier = messages[before]?.at;
    if (earlier) return messageDay(new Date(earlier), timeZone) !== messageDay(new Date(at), timeZone);
  }
  return true;
}

function stateOf(message: AssistantMessage): "prepared" | "needs_approval" | "approved" | "rejected" | "executed" | "unchanged" | "refused" {
  if (message.action) {
    if (message.action.status === "executed" && message.action.unchanged) return "unchanged";
    switch (message.action.status) {
      case "proposed":
        return "needs_approval";
      case "approved":
        return "approved";
      case "rejected":
      case "expired":
        return "rejected";
      case "executed":
        return "executed";
      case "failed":
        return "refused";
    }
  }
  if (message.proposal === "prepared") return "prepared";
  if (message.proposal === "executed") return "executed";
  if (message.proposal === "refused") return "refused";
  return "needs_approval";
}

/**
 * One key per attempt at a turn.
 *
 * `crypto.randomUUID` needs a secure context, which every page this runs on
 * is; the fallback keeps a retry working rather than silently becoming a
 * second turn if it is ever absent.
 */
function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `turn-${crypto.randomUUID()}`;
  }
  return `turn-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * A reply without the bullets the place cards repeat, for when the same places
 * are shown as cards. Only a bullet that names one of the cards goes: an answer
 * that also lists free weekends (the long weekends beside where to go) keeps
 * its own list.
 */
function withoutList(text: string, places: readonly { name: string }[]): string {
  const names = places.map((place) => `**${place.name}**`);
  const kept: string[] = [];
  for (const line of text.split("\n")) {
    const isPlace = /^\s*[-*•]\s/.test(line) && names.some((name) => line.includes(name));
    if (!isPlace) {
      kept.push(line);
      continue;
    }
    // A lead-in that introduced the list ends the sentence instead.
    const last = kept.length - 1;
    if (last >= 0 && /:\s*$/.test(kept[last]!)) kept[last] = kept[last]!.replace(/:\s*$/, ".");
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
