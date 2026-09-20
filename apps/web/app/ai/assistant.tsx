"use client";

import {
  CalendarHeart,
  GraduationCap,
  ListChecks,
  Pencil,
  ShoppingBasket,
  Sparkles,
  Wallet,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ActionPreview as ActionPreviewShape } from "@wonderhome/core/conversation/proposal";
import { ActionPreview } from "@wonderhome/core/ui/action-preview";
import { AiOrb, ChatMessage, SuggestionChips } from "@wonderhome/core/ui/ai-message";
import { Button } from "@wonderhome/core/ui/button";
import { ChatComposer } from "@wonderhome/core/ui/chat-composer";
import { Pill } from "@wonderhome/core/ui/pill";
import { ReplyText } from "@wonderhome/core/ui/reply-text";

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
  action?: { id: string; status: ActionState; preview: ActionPreviewShape | null } | null;
  /** A preview WonderHome showed without recording an action (e.g. prepared). */
  preview?: ActionPreviewShape | null;
  proposal?: string;
};

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
}: {
  householdId: string;
  memberName: string;
  firstName: string;
  initialMessages: AssistantMessage[];
  initialQuery?: string;
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
  const sentInitial = useRef(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

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
    if (scroller) scroller.scrollTop = 0;
  }, [messages.length]);

  const send = useCallback(
    async (utterance: string, channel: "text" | "voice", transcriptConfidence?: number, retryKey?: string, editMessageId?: string) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      setFailed(null);

      const idempotencyKey = retryKey ?? newIdempotencyKey();

      const optimisticId = `local-${Date.now()}`;
      setMessages((current) => {
        // Editing replaces the edited message and everything that followed
        // it — ordinarily just its own reply — with the new turn, the same
        // truncation the server applies before it regenerates a reply.
        const editedIndex = editMessageId ? current.findIndex((message) => message.id === editMessageId) : -1;
        const base = editedIndex === -1 ? current : current.slice(0, editedIndex);
        return [
          ...base,
          { id: optimisticId, role: "member", text: utterance },
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

        setMessages((current) =>
          current
            .filter((message) => message.id !== `${optimisticId}-pending`)
            .map((message) => (message.id === optimisticId ? { ...message, id: payload.memberMessageId ?? message.id } : message))
            .concat({
              id: payload.reply.id,
              role: "assistant",
              text: payload.reply.text,
              action: payload.reply.action ?? null,
              preview: payload.reply.preview ?? null,
              proposal: payload.reply.proposal,
            }),
        );
      } catch (caught) {
        setMessages((current) => current.filter((message) => message.id !== `${optimisticId}-pending`));
        setError(caught instanceof Error ? caught.message : "WonderHome could not answer just now.");
        setFailed({ utterance, channel, transcriptConfidence, key: idempotencyKey, editMessageId });
      } finally {
        setBusy(false);
      }
    },
    [busy, householdId],
  );

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
    async (actionId: string, decision: "approved" | "rejected") => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        const response = await fetch(`/api/v1/households/${householdId}/conversation`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ actionId, decision }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error?.message ?? "That decision did not go through.");

        setMessages((current) =>
          current
            .map((message) =>
              message.action?.id === actionId ? { ...message, action: { ...message.action, status: decision } } : message,
            )
            .concat({ id: payload.reply.id, role: "assistant", text: payload.reply.text }),
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
  const editableMessageId = lastMemberIndex !== -1 && !editLocked ? messages[lastMemberIndex]!.id : null;

  return (
    // Exactly the space between the header and main's own bottom padding (which
    // already clears the tab bar and its raised button), so the page itself
    // never scrolls: the conversation does, inside.
    <div className="flex h-[calc(100dvh-var(--wh-header-height)-env(safe-area-inset-top)-var(--wh-tabbar-height)-var(--wh-tabbar-raised-clearance)-1rem)] min-h-0 flex-col lg:h-[calc(100dvh-var(--wh-header-height)-4.5rem)]">
      {quiet ? (
        <div className="wh-rise flex flex-1 flex-col items-center justify-center px-2 py-8 text-center">
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
      ) : (
        <div
          ref={scrollerRef}
          className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto overscroll-contain [scrollbar-width:thin]"
          aria-live="polite"
        >
          <div className="space-y-4 py-2">
          {messages.map((message) => (
            <ChatMessage
              key={message.id}
              role={message.role}
              name={memberName}
              pending={message.pending}
              aside={
                message.action?.preview || message.preview ? (
                  <ActionPreview
                    state={stateOf(message)}
                    understood={(message.action?.preview ?? message.preview)!.summary}
                    plan={(message.action?.preview ?? message.preview)!.changes}
                    impact={(message.action?.preview ?? message.preview)!.because}
                    reversible={(message.action?.preview ?? message.preview)!.reversible}
                    controls={
                      message.action?.status === "proposed" ? (
                        <>
                          <Button onClick={() => void decide(message.action!.id, "approved")} disabled={busy}>
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
      <div className="shrink-0 pt-2">
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
        <ChatComposer
          key={editing?.id ?? "compose"}
          onSend={handleComposerSend}
          disabled={busy}
          placeholder="Type a message, or tap the mic to speak…"
          initialValue={editing?.text ?? ""}
          autoFocus={Boolean(editing)}
        />
        <p className="mt-2 text-center text-[0.6875rem] text-[var(--wh-foreground-subtle)]">
          WonderHome proposes and, only with your OK, acts. Payments and access changes always ask.
        </p>
      </div>
    </div>
  );
}

function stateOf(message: AssistantMessage): "prepared" | "needs_approval" | "approved" | "rejected" | "executed" | "refused" {
  if (message.action) {
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
