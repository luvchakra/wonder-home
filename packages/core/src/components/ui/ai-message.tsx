import type { ReactNode } from "react";

import { cn } from "../../lib/cn";
import { Avatar } from "./avatar";

/**
 * The WonderHome orb: the assistant's face. A soft radial gradient that
 * breathes gently while it is thinking and holds still otherwise. Pure CSS, so
 * it costs nothing and vanishes under reduced motion.
 */
export function AiOrb({
  size = 40,
  thinking = false,
  listening = false,
  className,
}: {
  size?: number;
  thinking?: boolean;
  listening?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("relative inline-grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size }}
    >
      {listening ? (
        <>
          <span className="absolute inset-0 rounded-full bg-[var(--wh-tone-ai)]/25 [animation:wh-pulse-ring_1.6s_ease-out_infinite]" />
          <span className="absolute inset-0 rounded-full bg-[var(--wh-tone-ai)]/20 [animation:wh-pulse-ring_1.6s_ease-out_0.5s_infinite]" />
        </>
      ) : null}
      <span
        className={cn(
          "relative block h-full w-full rounded-full shadow-[0_8px_24px_-8px_oklch(0.5_0.16_285/0.6)]",
          thinking && "[animation:wh-breathe_1.8s_ease-in-out_infinite]",
        )}
        style={{ background: "var(--wh-gradient-orb)" }}
      >
        <span className="absolute top-[18%] left-[20%] h-[28%] w-[34%] rounded-full bg-white/60 blur-[2px]" />
      </span>
    </span>
  );
}

export type MessageRole = "assistant" | "member";

/**
 * One turn of the conversation. The assistant speaks from the left beside its
 * orb; the person from the right beside their avatar. Both are plain text
 * bubbles — what the assistant is *doing* is shown separately in an action
 * preview, never smuggled into a sentence.
 */
export function ChatMessage({
  role,
  name,
  speaker,
  children,
  aside,
  sentAt,
  pending = false,
  className,
}: {
  role: MessageRole;
  /** The member's name, for the avatar. */
  name?: string;
  /**
   * Who said this, spelled out above the bubble — a live conversation's own
   * transcript convention (product-direction v4 §7), where a back-and-forth
   * exchange benefits from reading like one even after the fact. Ordinary
   * turns leave this unset: colour, alignment and the avatar already say
   * who is speaking, and repeating a name inside every bubble would be
   * noise on a normal conversation.
   */
  speaker?: string;
  children: ReactNode;
  /** Something attached beneath the bubble: an action preview, suggestions. */
  aside?: ReactNode;
  /**
   * When it was said, shown small in the bubble's bottom corner, as a
   * messaging app does. The caller formats it in the household's time zone;
   * `dateTime` is the machine-readable instant.
   */
  sentAt?: { label: string; dateTime: string };
  pending?: boolean;
  className?: string;
}) {
  const fromAssistant = role === "assistant";

  return (
    <div className={cn("wh-rise flex gap-2.5", fromAssistant ? "flex-row" : "flex-row-reverse", className)}>
      {!fromAssistant && name ? <Avatar name={name} size="sm" className="mt-0.5" /> : null}
      <div className={cn("flex min-w-0 max-w-[85%] flex-col gap-2", fromAssistant ? "items-start" : "items-end")}>
        <div
          className={cn(
            "rounded-[var(--wh-radius)] px-3.5 py-2.5 text-[0.9375rem] leading-relaxed",
            fromAssistant
              ? "rounded-tl-[var(--wh-radius-xs)] border border-[var(--wh-border)] bg-[var(--wh-surface)] shadow-[var(--wh-shadow-card)]"
              : "rounded-tr-[var(--wh-radius-xs)] bg-[var(--wh-primary)] text-[var(--wh-primary-foreground)]",
          )}
        >
          {speaker ? (
            <p className={cn("mb-0.5 text-[0.6875rem] font-semibold", fromAssistant ? "text-[var(--wh-foreground-subtle)]" : "text-[var(--wh-primary-foreground)]/75")}>
              {speaker}
            </p>
          ) : null}
          {pending ? (
            <ThinkingDots />
          ) : sentAt ? (
            // The time sits beside a short message's last words and drops to
            // its own line, still in the corner, when the text needs the width.
            <div className="flex flex-wrap items-end justify-end gap-x-2.5">
              <div className="min-w-0 flex-auto">{children}</div>
              <time
                dateTime={sentAt.dateTime}
                className={cn(
                  "shrink-0 translate-y-0.5 text-[0.6875rem] leading-none whitespace-nowrap tabular-nums",
                  fromAssistant ? "text-[var(--wh-foreground-subtle)]" : "text-[var(--wh-primary-foreground)]/75",
                )}
              >
                {sentAt.label}
              </time>
            </div>
          ) : (
            children
          )}
        </div>
        {aside ? <div className="w-full">{aside}</div> : null}
      </div>
    </div>
  );
}

/**
 * Where one day's messages end and the next begin: the date, centred in a
 * small pill between them ("Today", "Yesterday", "September 7, 2026").
 */
export function ChatDayDivider({ label }: { label: string }) {
  return (
    <div role="separator" aria-label={label} className="flex justify-center py-1">
      <span className="rounded-full bg-[var(--wh-surface-muted)] px-3 py-1 text-xs font-medium text-[var(--wh-foreground-muted)] shadow-[var(--wh-shadow-card)]">
        {label}
      </span>
    </div>
  );
}

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1" role="status" aria-label="WonderHome is thinking">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="size-1.5 rounded-full bg-[var(--wh-foreground-subtle)] [animation:wh-wave_1s_ease-in-out_infinite]"
          style={{ animationDelay: `${index * 140}ms` }}
        />
      ))}
    </span>
  );
}

/** Tappable example requests, shown when the conversation is quiet. */
export function SuggestionChips({
  suggestions,
  onPick,
  className,
}: {
  suggestions: readonly { label: string; utterance: string; icon?: ReactNode }[];
  onPick: (utterance: string) => void;
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-wrap gap-2", className)}>
      {suggestions.map((suggestion) => (
        <li key={suggestion.utterance}>
          <button
            type="button"
            onClick={() => onPick(suggestion.utterance)}
            className="inline-flex min-h-10 items-center gap-2 rounded-[var(--wh-radius-pill)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3.5 text-[0.8125rem] font-medium text-[var(--wh-foreground)] shadow-[var(--wh-shadow-card)] transition-colors hover:border-[var(--wh-primary)] hover:bg-[var(--wh-primary-soft)]"
          >
            {suggestion.icon}
            {suggestion.label}
          </button>
        </li>
      ))}
    </ul>
  );
}
