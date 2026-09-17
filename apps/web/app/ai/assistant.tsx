"use client";

import {
  CalendarHeart,
  GraduationCap,
  ListChecks,
  ShoppingBasket,
  Sparkles,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ActionPreview as ActionPreviewShape } from "@wonderhome/core/conversation/proposal";
import { ActionPreview } from "@wonderhome/core/ui/action-preview";
import { AiOrb, ChatMessage, SuggestionChips } from "@wonderhome/core/ui/ai-message";
import { Button } from "@wonderhome/core/ui/button";
import { ChatComposer } from "@wonderhome/core/ui/chat-composer";
import { Pill } from "@wonderhome/core/ui/pill";

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
  const endRef = useRef<HTMLDivElement>(null);
  const sentInitial = useRef(false);

  const scrollToEnd = useCallback(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (messages.length > 0) scrollToEnd();
  }, [messages.length, scrollToEnd]);

  const send = useCallback(
    async (utterance: string, channel: "text" | "voice", transcriptConfidence?: number) => {
      if (busy) return;
      setBusy(true);
      setError(null);

      const optimisticId = `local-${Date.now()}`;
      setMessages((current) => [
        ...current,
        { id: optimisticId, role: "member", text: utterance },
        { id: `${optimisticId}-pending`, role: "assistant", text: "", pending: true },
      ]);

      try {
        const response = await fetch(`/api/v1/households/${householdId}/conversation`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ utterance, channel, transcriptConfidence }),
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
      } finally {
        setBusy(false);
      }
    },
    [busy, householdId],
  );

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

  return (
    <div className="flex min-h-[calc(100dvh-var(--wh-header-height)-var(--wh-tabbar-height)-2rem)] flex-col lg:min-h-[calc(100dvh-var(--wh-header-height)-3rem)]">
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
        <div className="flex-1 space-y-4 py-2" aria-live="polite">
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
                ) : null
              }
            >
              {message.text}
            </ChatMessage>
          ))}
          <div ref={endRef} />
        </div>
      )}

      {error ? (
        <p role="alert" className="mb-2 rounded-[var(--wh-radius-sm)] bg-[var(--wh-risk-soft)] px-3 py-2 text-sm text-[var(--wh-risk)]">
          {error}
        </p>
      ) : null}

      <div className="sticky bottom-[calc(var(--wh-tabbar-height)+0.75rem)] z-20 pt-2 lg:bottom-4">
        {!quiet ? (
          <SuggestionChips
            suggestions={SUGGESTIONS.slice(0, 3)}
            onPick={(utterance) => void send(utterance, "text")}
            className="mb-2 [&_button]:min-h-8 [&_button]:text-xs"
          />
        ) : null}
        <ChatComposer onSend={send} disabled={busy} placeholder="Type a message, or tap the mic to speak…" />
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
