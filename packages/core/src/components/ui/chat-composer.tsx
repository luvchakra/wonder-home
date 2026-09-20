"use client";

import { ArrowUp } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { cn } from "../../lib/cn";
import { VoiceInputButton, Waveform, type VoiceResult, type VoiceState } from "./voice-input-button";

/**
 * Where a person talks to WonderHome: one field, one send, one microphone.
 *
 * Enter sends; Shift+Enter makes a new line. The field grows with the message
 * up to a few lines and never traps focus. Voice drops its transcript straight
 * into the same submit path, with its confidence attached.
 */
export function ChatComposer({
  onSend,
  disabled = false,
  placeholder = "Type a message…",
  initialValue = "",
  autoFocus = false,
  className,
}: {
  onSend: (text: string, channel: "text" | "voice", confidence?: number) => void;
  disabled?: boolean;
  placeholder?: string;
  initialValue?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const [value, setValue] = useState(initialValue);
  const [voice, setVoice] = useState<VoiceState>("idle");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "0px";
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
  }, [value]);

  const submit = useCallback(() => {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text, "text");
    setValue("");
  }, [value, disabled, onSend]);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit();
  };

  const onVoice = useCallback(
    (result: VoiceResult) => {
      if (!result.transcript) return;
      onSend(result.transcript, "voice", result.confidence);
    },
    [onSend],
  );

  const listening = voice === "listening";

  return (
    <form
      onSubmit={onSubmit}
      className={cn(
        "flex items-center gap-2 rounded-[var(--wh-radius-lg)] border border-[var(--wh-border)] bg-[var(--wh-surface)] p-1.5 pl-4 shadow-[var(--wh-shadow-raised)] focus-within:border-[var(--wh-primary)]",
        className,
      )}
    >
      <label htmlFor="wh-composer" className="sr-only">
        Message WonderHome
      </label>
      {listening ? (
        <div className="flex min-h-11 flex-1 items-center gap-3 text-sm text-[var(--wh-foreground-muted)]">
          <Waveform active />
          Listening…
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          id="wh-composer"
          rows={1}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          enterKeyHint="send"
          className="max-h-40 min-h-11 flex-1 resize-none bg-transparent py-3 text-[0.9375rem] leading-snug outline-none placeholder:text-[var(--wh-foreground-subtle)] disabled:opacity-60"
        />
      )}
      <VoiceInputButton onResult={onVoice} onStateChange={setVoice} size="xl" className="mb-0" />
      <button
        type="submit"
        disabled={disabled || value.trim().length === 0}
        aria-label="Send"
        className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--wh-foreground)] text-[var(--wh-surface)] transition-opacity disabled:opacity-30"
      >
        <ArrowUp className="size-5" />
      </button>
    </form>
  );
}
