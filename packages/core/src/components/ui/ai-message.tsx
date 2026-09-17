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
  children,
  aside,
  pending = false,
  className,
}: {
  role: MessageRole;
  /** The member's name, for the avatar. */
  name?: string;
  children: ReactNode;
  /** Something attached beneath the bubble: an action preview, suggestions. */
  aside?: ReactNode;
  pending?: boolean;
  className?: string;
}) {
  const fromAssistant = role === "assistant";

  return (
    <div className={cn("wh-rise flex gap-2.5", fromAssistant ? "flex-row" : "flex-row-reverse", className)}>
      {fromAssistant ? <AiOrb size={32} thinking={pending} className="mt-0.5" /> : name ? <Avatar name={name} size="sm" className="mt-0.5" /> : null}
      <div className={cn("flex min-w-0 max-w-[85%] flex-col gap-2", fromAssistant ? "items-start" : "items-end")}>
        <div
          className={cn(
            "rounded-[var(--wh-radius)] px-3.5 py-2.5 text-[0.9375rem] leading-relaxed",
            fromAssistant
              ? "rounded-tl-[var(--wh-radius-xs)] border border-[var(--wh-border)] bg-[var(--wh-surface)] shadow-[var(--wh-shadow-card)]"
              : "rounded-tr-[var(--wh-radius-xs)] bg-[var(--wh-primary)] text-[var(--wh-primary-foreground)]",
          )}
        >
          {pending ? <ThinkingDots /> : children}
        </div>
        {aside ? <div className="w-full">{aside}</div> : null}
      </div>
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
