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
} from "lucide-react";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";

import type { ActionPreview as ActionPreviewShape } from "@wonderhome/core/conversation/proposal";
import { plainText } from "@wonderhome/core/conversation/reply-format";
import { ActionPreview } from "@wonderhome/core/ui/action-preview";
import { messageDay, messageDayLabel, messageTime } from "@wonderhome/core/conversation/message-time";
import { AiOrb, ChatDayDivider, ChatMessage, SuggestionChips } from "@wonderhome/core/ui/ai-message";
import { Button } from "@wonderhome/core/ui/button";
import { TalkComposer, type TalkComposerState } from "@wonderhome/core/ui/talk-composer";
import { Pill } from "@wonderhome/core/ui/pill";
import { ReplyText } from "@wonderhome/core/ui/reply-text";

import { HomeSendSheet } from "../_components/home-send-sheet";

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
  action?: { id: string; status: ActionState; preview: ActionPreviewShape | null; unchanged?: boolean; fingerprint?: string | null } | null;
  /** A preview WonderHome showed without recording an action (e.g. prepared). */
  preview?: ActionPreviewShape | null;
  proposal?: string;
  /** Who said this, spelled out — set only for a live conversation's turns. */
  speaker?: string;
  /** When it was said (ISO 8601). Unset only on the "thinking" placeholder. */
  at?: string;
};

/** Far enough back to be deliberate rather than a stray touch. */
const BACK_AT_LEAST = 120;

const SUGGESTIONS = [
  { label: "Plan a family outing this weekend", utterance: "Plan a family outing this weekend.", icon: <CalendarHeart aria-hidden className="size-4 text-[var(--wh-tone-people)]" /> },
  { label: "Add coriander to the grocery list", utterance: "Add coriander to the grocery list.", icon: <ShoppingBasket aria-hidden className="size-4 text-[var(--wh-tone-care)]" /> },
  { label: "How is Anaya's project coming along?", utterance: "How is Anaya's project coming along?", icon: <GraduationCap aria-hidden className="size-4 text-[var(--wh-tone-school)]" /> },
  { label: "Show me tomorrow's schedule", utterance: "Show me tomorrow's schedule.", icon: <Sparkles aria-hidden className="size-4 text-[var(--wh-tone-ai)]" /> },
  { label: "Pay the electricity bill", utterance: "Pay the electricity bill.", icon: <Wallet aria-hidden className="size-4 text-[var(--wh-tone-money)]" /> },
  { label: "Priya handles the school run from now on", utterance: "Priya handles the school run from now on.", icon: <ListChecks aria-hidden className="size-4 text-[var(--wh-primary)]" /> },
];

export function Assistant({
  householdId,
  memberName,
  firstName,
  initialMessages,
  initialQuery,
  liveConversationAvailable = false,
  serverVoice = false,
  voiceLanguage = "en-IN",
  liveEngine = "wonderhome",
  geminiLive = { available: false },
  kids = [],
  canAddChild = false,
  timeZone = "Asia/Kolkata",
}: {
  householdId: string;
  memberName: string;
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
  geminiLive?: { available: boolean; reason?: string };
  /** For HomeSend's school-item confirm step ("who is this for"). */
  kids?: { id: string; displayName: string }[];
  /** Whether the viewer may add a child from a school notice (story 08-009). */
  canAddChild?: boolean;
  /** The household's own zone, which every message time and date divider is shown in. */
  timeZone?: string;
}) {
  const [messages, setMessages] = useState<AssistantMessage[]>(initialMessages);
  const [busy, setBusy] = useState(false);
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
  /**
   * Whether the reader has scrolled back through the conversation.
   *
   * In a `flex-col-reverse` scroller the newest message sits at scrollTop 0
   * and scrolling back moves away from it — negative in most engines,
   * positive in some — so the distance is what matters, never the sign.
   */
  const [scrolledBack, setScrolledBack] = useState(false);
  /** The first member message of the live session in progress, for the recap once it ends. */
  const liveStartMessageId = useRef<string | null>(null);

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

      try {
        const response = await fetch(`/api/v1/households/${householdId}/conversation`, {
          method: "POST",
          headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
          body: JSON.stringify({ utterance, channel, transcriptConfidence, editMessageId }),
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload?.error?.message ?? "WonderHome could not answer just now.");
        }

        if (live && payload.memberMessageId && !liveStartMessageId.current) {
          liveStartMessageId.current = payload.memberMessageId;
        }

        // A request with several parts comes back as one reply per part,
        // each with its own preview (Wave 4 §10); anything else is one.
        const replies: { id: string; text: string; action?: AssistantMessage["action"]; preview?: ActionPreviewShape | null; proposal?: string }[] =
          Array.isArray(payload.replies) && payload.replies.length > 0 ? payload.replies : [payload.reply];
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
                speaker: speaker?.assistant,
                at: new Date().toISOString(),
              })),
            ),
        );
        return replies.map((reply) => reply.text).join("\n\n");
      } catch (caught) {
        setMessages((current) => current.filter((message) => message.id !== `${optimisticId}-pending`));
        setError(caught instanceof Error ? caught.message : "WonderHome could not answer just now.");
        setFailed({ utterance, channel, transcriptConfidence, key: idempotencyKey, editMessageId });
        return "";
      } finally {
        setBusy(false);
      }
    },
    [busy, householdId, firstName],
  );

  /** A live turn: send what was heard, and read back what to say (never throws — the hook's own contract). */
  const handleLiveUtterance = useCallback(
    async (transcript: string, confidence: number): Promise<string> => {
      const replyText = await send(transcript, "voice", confidence, undefined, undefined, true);
      return replyText ? plainText(replyText) : "";
    },
    [send],
  );

  /**
   * Gemini Live's words on each side, as they were said. HomeTalk keeps its
   * own record of every tool call it answered; these are what was heard and
   * spoken around them, shown so the conversation reads on screen too.
   */
  const handleLiveTranscript = useCallback(
    (entry: { role: "member" | "assistant"; text: string }) => {
      setMessages((current) =>
        current.concat({
          id: `live-${Date.now()}-${current.length}`,
          role: entry.role,
          text: entry.text,
          speaker: entry.role === "member" ? firstName : "WonderHome",
          at: new Date().toISOString(),
        }),
      );
    },
    [firstName],
  );

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
        if (!response.ok) throw new Error(payload?.error?.message ?? "Could not say what that document did.");
        setMessages((current) => (current.some((message) => message.id === payload.reply.id) ? current : current.concat({ id: payload.reply.id, role: "assistant", text: payload.reply.text, at: new Date().toISOString() })));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not say what that document did.");
      }
    },
    [householdId],
  );

  /** Ends a live session: fetches the recap for everything said since it began, and posts it as a message. */
  const endLiveSession = useCallback(async () => {
    const startId = liveStartMessageId.current;
    liveStartMessageId.current = null;
    if (!startId) return;
    try {
      const response = await fetch(`/api/v1/households/${householdId}/conversation`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ summarizeSince: startId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? "Could not summarise that conversation.");
      setMessages((current) => current.concat({ id: payload.reply.id, role: "assistant", text: payload.reply.text, at: new Date().toISOString() }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not summarise that conversation.");
    }
  }, [householdId]);

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
        if (!response.ok) throw new Error(payload?.error?.message ?? "That decision did not go through.");

        setMessages((current) =>
          current
            .map((message) =>
              message.action?.id === actionId ? { ...message, action: { ...message.action, status: payload.reply.action?.status ?? decision } } : message,
            )
            .concat({ id: payload.reply.id, role: "assistant", text: payload.reply.text, at: new Date().toISOString() }),
        );
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "That decision did not go through.");
      } finally {
        setBusy(false);
      }
    },
    [busy, householdId],
  );

  useEffect(() => {
    if (initialQuery && !sentInitial.current) {
      sentInitial.current = true;
      void send(initialQuery, "text");
    }
  }, [initialQuery, send]);

  const quiet = messages.length === 0;

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
            Hi {firstName}! <span aria-hidden>👋</span>
            <br />
            How can I help you today?
          </h1>
          <p className="mt-2 max-w-sm text-sm text-[var(--wh-foreground-muted)]">
            Ask in your own words. I will check the household, propose what I would do, and wait for
            your OK before anything that matters.
          </p>
          <p className="mt-6 mb-2 text-[0.6875rem] font-semibold tracking-wide text-[var(--wh-foreground-subtle)] uppercase">
            Here are some things you can ask
          </p>
          <SuggestionChips suggestions={SUGGESTIONS} onPick={(utterance) => void send(utterance, "text")} className="justify-center" />
        </div>
        </div>
      ) : (
        <div
          ref={scrollerRef}
          onScroll={onScroll}
          className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto overscroll-contain [scrollbar-width:thin]"
          aria-live="polite"
        >
          <div className="space-y-4 py-2">
          {messages.map((message, index) => (
            <Fragment key={message.id}>
            {/* A date between the days, as a messaging app shows it. */}
            {message.at && dayChanges(messages, index, timeZone) ? <ChatDayDivider label={messageDayLabel(new Date(message.at), timeZone)} /> : null}
            <ChatMessage
              id={`message-${message.id}`}
              role={message.role}
              name={memberName}
              speaker={message.speaker}
              pending={message.pending}
              sentAt={message.at ? { label: messageTime(new Date(message.at), timeZone), dateTime: message.at } : undefined}
              aside={
                message.action?.preview || message.preview ? (
                  <ActionPreview
                    state={stateOf(message)}
                    understood={(message.action?.preview ?? message.preview)!.summary}
                    plan={message.action?.unchanged ? ["It was already on record, so nothing was added or changed."] : (message.action?.preview ?? message.preview)!.changes}
                    impact={(message.action?.preview ?? message.preview)!.because}
                    reversible={(message.action?.preview ?? message.preview)!.reversible}
                    controls={
                      message.action?.status === "proposed" ? (
                        <>
                          <Button onClick={() => void decide(message.action!.id, "approved", message.action!.fingerprint ?? null)} disabled={busy}>
                            Confirm
                          </Button>
                          <Pill type="button" tone="quiet" onClick={() => void send("Actually, let me change that.", "text")} disabled={busy}>
                            Change
                          </Pill>
                          <Pill type="button" tone="quiet" onClick={() => void decide(message.action!.id, "rejected")} disabled={busy}>
                            Cancel
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
                      aria-label="Edit your last message"
                      className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-[var(--wh-foreground-subtle)] transition-colors hover:bg-[var(--wh-surface-muted)] hover:text-[var(--wh-foreground)] disabled:opacity-40"
                    >
                      <Pencil aria-hidden className="size-3" /> Edit
                    </button>
                  </div>
                ) : null
              }
            >
              {message.role === "assistant" ? <ReplyText text={message.text} /> : message.text}
            </ChatMessage>
            </Fragment>
          ))}
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
              Try again
            </Pill>
          ) : null}
        </div>
      ) : null}

      {/* A plain flex child below the scroller — nothing is stacked over anything, so nothing can show through it. */}
      <div className="relative shrink-0 pt-1.5">
        {/* Only while the reader is actually back up the conversation —
            otherwise it is a button that does nothing, over the one thing
            on this screen somebody came to use. */}
        {scrolledBack ? (
          <button
            type="button"
            onClick={jumpToLatest}
            aria-label="Jump to the latest message"
            title="Jump to the latest message"
            className="wh-rise absolute -top-11 left-1/2 z-10 grid size-10 -translate-x-1/2 place-items-center rounded-full border border-[var(--wh-border)] bg-[var(--wh-surface)] text-[var(--wh-foreground-muted)] shadow-[var(--wh-shadow-float)] transition-colors hover:border-[var(--wh-primary)] hover:text-[var(--wh-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]"
          >
            <ArrowDown aria-hidden className="size-5" />
          </button>
        ) : null}
        {editing ? (
          <div className="mb-2 flex items-center justify-between rounded-[var(--wh-radius-sm)] bg-[var(--wh-primary-soft)] px-3 py-1.5 text-xs font-medium text-[var(--wh-primary)]">
            <span>Editing your message</span>
            <button
              type="button"
              onClick={() => setEditing(null)}
              aria-label="Cancel editing"
              className="grid size-5 place-items-center rounded-full hover:bg-[var(--wh-primary)]/10"
            >
              <X aria-hidden className="size-3.5" />
            </button>
          </div>
        ) : null}
        <TalkComposer
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
        />
        <p className="mt-1.5 text-center text-[0.6875rem] leading-snug text-[var(--wh-foreground-subtle)]">
          WonderHome proposes and, only with your OK, acts. Payments and access changes always ask.
        </p>
      </div>

      <HomeSendSheet householdId={householdId} kids={kids} canAddChild={canAddChild} open={homeSendOpen} onOpenChange={setHomeSendOpen} onDocumentApplied={postDocumentReceipt} />
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
