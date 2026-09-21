"use client";

import { ArrowUp, AudioLines, Mic, Paperclip, Square, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { cn } from "../../lib/cn";
import { BrandMark } from "./brand";
import { useLiveVoice } from "./use-live-voice";
import { useSpeechToText, type SpeechToTextState } from "./use-speech-to-text";

/**
 * HomeTalk — where a household talks to WonderHome — one control, four states.
 *
 * The design sheet's point, and the reason this replaced a composer with a
 * toggle bolted under the Send button: **speaking and conversing are two
 * different intentions and get two different buttons.** The microphone
 * puts what you said in the box so you can check it before it counts. The
 * waveform beside it starts a real back-and-forth where WonderHome answers
 * out loud. One tap could never tell those apart, which is what made the
 * old arrangement confusing.
 *
 * The state machine is explicit rather than derived from four booleans,
 * because the illegal combinations are what break this kind of component:
 * listening while a live conversation runs, a Send button during
 * transcription, a live session left open behind a composer that looks
 * idle. `state` below is the single answer to "what is happening", and
 * every control reads it.
 *
 *   idle ⇄ typing                     text in the box, or not
 *   idle/typing → listening           the microphone
 *   listening → transcribing → typing what was heard, for review
 *   idle/typing → live ⇄ paused       the conversation
 *
 * Nothing here is authorization: whether voice runs at all is the
 * `conversation.voice` entitlement and the rollout flag, both checked
 * server-side on every request this makes.
 */

export type TalkComposerState =
  | "idle"
  | "typing"
  | "listening"
  | "transcribing"
  | "live"
  | "paused";

/**
 * The one answer to "what is happening", from the three things that can
 * independently claim to be happening.
 *
 * Precedence is the whole point, and it is deliberate: a live conversation
 * outranks the microphone, and the microphone outranks whatever is in the
 * box. Text typed before somebody started speaking is not lost — it is
 * still there underneath — but it must not put a Send button on screen
 * while the microphone is open, because then one control would be
 * committing words the person is still in the middle of saying.
 *
 * Pure, and exported, so every combination can be checked without a
 * browser: this is the part that breaks if anyone adds a fourth thing.
 */
export function talkComposerState(input: {
  live: { active: boolean; paused: boolean };
  speech: SpeechToTextState;
  hasText: boolean;
}): TalkComposerState {
  if (input.live.active) return input.live.paused ? "paused" : "live";
  if (input.speech === "listening") return "listening";
  if (input.speech === "transcribing") return "transcribing";
  return input.hasText ? "typing" : "idle";
}

export function TalkComposer({
  onSend,
  onLiveTurn,
  onLiveEnd,
  onError,
  onStateChange,
  onAttach,
  householdId,
  disabled = false,
  placeholder = "Ask WonderHome anything…",
  placeholderShort = "Ask anything…",
  initialValue = "",
  autoFocus = false,
  liveConversationAvailable = false,
  serverVoice = false,
  voiceLanguage = "en-IN",
  className,
}: {
  onSend: (text: string, channel: "text" | "voice", confidence?: number) => void;
  /** One spoken turn of a live conversation; resolves with what to say back. */
  onLiveTurn?: (transcript: string, confidence: number) => Promise<string>;
  /** The live conversation ended — the caller posts the recap. */
  onLiveEnd?: () => void;
  onError?: (message: string) => void;
  /** What the composer is doing now, so the screen around it can react. */
  onStateChange?: (state: TalkComposerState) => void;
  /**
   * A photo, file or pasted forward, as a second way into this same door
   * (HomeSend) — never a separate "Ask AI" control (rule 13). Omit to leave
   * the composer exactly as before; the caller owns the sheet this opens.
   */
  onAttach?: () => void;
  householdId: string;
  disabled?: boolean;
  placeholder?: string;
  /** Used where the full one would not fit — a phone, chiefly. */
  placeholderShort?: string;
  initialValue?: string;
  autoFocus?: boolean;
  /** The deployment's rollout flag and this household's plan both say yes. */
  liveConversationAvailable?: boolean;
  /** A speech provider is configured, so the server listens and speaks. */
  serverVoice?: boolean;
  voiceLanguage?: string;
  className?: string;
}) {
  const [value, setValue] = useState(initialValue);
  /** Set only while `value` is exactly what speech produced, untouched since. */
  const [spokenConfidence, setSpokenConfidence] = useState<number | undefined>(undefined);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const server = useMemo(() => (serverVoice ? { householdId } : null), [serverVoice, householdId]);

  const speech = useSpeechToText({
    lang: voiceLanguage,
    server,
    onTranscript: (transcript, confidence) => {
      // Into the field for review, never straight out. Send is still what
      // makes it count, the same bargain WonderHome asks of any
      // consequential action, extended to the words themselves.
      setValue(transcript);
      setSpokenConfidence(confidence);
      textareaRef.current?.focus();
    },
    onError,
  });

  const live = useLiveVoice({
    lang: voiceLanguage,
    server,
    onUtterance: onLiveTurn ?? (async () => ""),
    onError,
  });

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "0px";
    element.style.height = `${Math.min(element.scrollHeight, 140)}px`;
  }, [value]);

  const state = talkComposerState({
    live: { active: live.active, paused: live.paused },
    speech: speech.state,
    hasText: Boolean(value.trim()),
  });

  const composing = state === "idle" || state === "typing";

  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;
  useEffect(() => {
    onStateChangeRef.current?.(state);
  }, [state]);

  const submit = useCallback(() => {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text, spokenConfidence !== undefined ? "voice" : "text", spokenConfidence);
    setValue("");
    setSpokenConfidence(undefined);
  }, [value, disabled, spokenConfidence, onSend]);

  const endLive = useCallback(() => {
    live.stop();
    onLiveEnd?.();
  }, [live, onLiveEnd]);

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

  // Escape gets out of anything voice-related, from anywhere in the
  // composer — the one key somebody reaches for when a microphone is open
  // and they have changed their mind.
  useEffect(() => {
    if (composing) return;
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (live.active) endLive();
      else speech.cancel();
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [composing, live.active, endLive, speech]);

  return (
    <form onSubmit={onSubmit} className={cn("w-full", className)}>
      <div
        className={cn(
          "flex items-center gap-2 rounded-[2rem] border border-[var(--wh-border)] bg-[var(--wh-surface)] py-2 pr-2 pl-3 shadow-[var(--wh-shadow-raised)] transition-colors sm:gap-3 sm:pl-4",
          composing && "focus-within:border-[var(--wh-primary)]",
        )}
      >
        {/* The assistant's own face, and the one place the mark appears
            inside a control: this is the door to WonderHome rather than a
            row about something else. */}
        <BrandMark size={28} className="shrink-0" />
        <span aria-hidden className="h-8 w-px shrink-0 bg-[var(--wh-border)]" />

        {state === "listening" || state === "transcribing" ? (
          <ListeningField transcribing={state === "transcribing"} />
        ) : state === "live" || state === "paused" ? (
          <LiveField
            paused={state === "paused"}
            speaking={live.state === "speaking"}
            thinking={live.state === "thinking"}
            onToggle={() => (live.paused ? live.resume() : live.pause())}
          />
        ) : (
          <>
            <label htmlFor="wh-composer" className="sr-only">
              Message WonderHome
            </label>
            <div className="relative min-w-0 flex-1 self-center">
              <textarea
                ref={textareaRef}
                id="wh-composer"
                rows={1}
                value={value}
                onChange={(event) => {
                  setValue(event.target.value);
                  // A hand-typed change means what will be sent is no longer
                  // exactly what speech produced.
                  setSpokenConfidence(undefined);
                }}
                onKeyDown={onKeyDown}
                disabled={disabled}
                autoFocus={autoFocus}
                enterKeyHint="send"
                className="max-h-36 min-h-11 w-full resize-none bg-transparent py-2.5 text-[0.9375rem] leading-snug outline-none disabled:opacity-60"
              />
              {value === "" ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 left-0 flex items-center truncate text-[0.9375rem] text-[var(--wh-foreground-subtle)]"
                >
                  <span className="sm:hidden">{placeholderShort}</span>
                  <span className="hidden sm:inline">{placeholder}</span>
                </span>
              ) : null}
            </div>
          </>
        )}

        {/* Right-hand controls. Which ones exist is the state's decision,
            never a disabled row of everything. */}
        {state === "listening" || state === "transcribing" ? (
          <RoundButton
            tone="listening"
            label={state === "transcribing" ? "Stop transcribing" : "Stop listening"}
            onClick={() => (state === "transcribing" ? speech.cancel() : speech.stop())}
          >
            <Square className="size-4" fill="currentColor" />
          </RoundButton>
        ) : state === "live" || state === "paused" ? (
          <RoundButton tone="danger" label="End voice conversation" onClick={endLive}>
            <X className="size-5" />
          </RoundButton>
        ) : (
          <>
            {onAttach ? (
              <RoundButton
                tone="outline"
                label="Send a photo or paste something — WonderHome reads it and asks you to confirm"
                onClick={onAttach}
                disabled={disabled}
              >
                <Paperclip className="size-5" />
              </RoundButton>
            ) : null}

            {speech.available ? (
              <RoundButton
                tone="outline"
                label="Speak — your words go in the box for review"
                onClick={speech.start}
                disabled={disabled}
              >
                <Mic className="size-5" />
              </RoundButton>
            ) : null}

            {state === "typing" || !liveConversationAvailable ? (
              <RoundButton tone="primary" label="Send message" type="submit" disabled={disabled || !value.trim()}>
                <ArrowUp className="size-5" />
              </RoundButton>
            ) : (
              <RoundButton
                tone="primary"
                label="Start a voice conversation — WonderHome answers out loud"
                onClick={live.start}
                disabled={disabled}
              >
                <AudioLines className="size-5" />
              </RoundButton>
            )}
          </>
        )}
      </div>

      {state === "listening" || state === "transcribing" ? <Steps transcribing={state === "transcribing"} /> : null}

    </form>
  );
}

/** The field while the microphone is open: what is happening, where the words will appear. */
function ListeningField({ transcribing }: { transcribing: boolean }) {
  return (
    <div
      className="flex min-h-11 min-w-0 flex-1 items-center gap-3 self-center rounded-full bg-[var(--wh-primary-soft)] px-3.5"
      role="status"
      aria-live="polite"
    >
      <Bars active={!transcribing} tone="primary" />
      <span className="min-w-0 text-[0.9375rem] font-medium text-[var(--wh-primary)]">
        {transcribing ? "Transcribing…" : "Listening…"}
      </span>
    </div>
  );
}

/** The field during a live conversation, and the tap target that pauses it. */
function LiveField({
  paused,
  speaking,
  thinking,
  onToggle,
}: {
  paused: boolean;
  speaking: boolean;
  thinking: boolean;
  onToggle: () => void;
}) {
  const status = paused ? "Paused" : thinking ? "Thinking…" : speaking ? "Speaking…" : "HomeTalk is listening…";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={paused ? "Resume the voice conversation" : "Pause the voice conversation"}
      title={paused ? "Resume" : "Pause"}
      className="flex min-h-11 min-w-0 flex-1 items-center gap-3 self-center rounded-full px-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]"
    >
      <Bars active={!paused} tone="primary" tall />
      <span className="min-w-0">
        <span className="block text-[0.9375rem] font-semibold text-[var(--wh-primary)]">{status}</span>
        <span className="block text-xs text-[var(--wh-foreground-subtle)]">{paused ? "Tap to resume" : "Tap to pause"}</span>
      </span>
    </button>
  );
}

/**
 * Where a spoken message has got to.
 *
 * Three named steps rather than a spinner, because the wait has real parts
 * and somebody who says something and sees nothing cannot tell a slow
 * transcription from a microphone that never opened.
 */
function Steps({ transcribing }: { transcribing: boolean }) {
  const steps = [
    { label: "Listening", done: true },
    { label: "Transcribing", done: transcribing },
    { label: "Ready to send", done: false },
  ];

  return (
    <ol className="mt-1.5 flex items-center justify-between gap-1 px-2 text-[0.6875rem]">
      {steps.map((step, index) => (
        <li key={step.label} className="flex min-w-0 flex-1 items-center gap-1 last:flex-none">
          <span
            aria-hidden
            className={cn(
              "size-2 shrink-0 rounded-full",
              step.done ? "bg-[var(--wh-primary)]" : "border border-[var(--wh-border-strong)] bg-[var(--wh-surface)]",
            )}
          />
          <span className={cn("truncate", step.done ? "font-medium text-[var(--wh-primary)]" : "text-[var(--wh-foreground-subtle)]")}>
            {step.label}
          </span>
          {index < steps.length - 1 ? (
            <span aria-hidden className="h-px min-w-2 flex-1 border-t border-dashed border-[var(--wh-border-strong)]" />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/** Five bars that rise and fall. Decoration for a state the words already name. */
function Bars({ active, tone, tall = false }: { active: boolean; tone: "primary"; tall?: boolean }) {
  return (
    <span aria-hidden className={cn("inline-flex shrink-0 items-center gap-[3px]", tall ? "h-8" : "h-5")}>
      {[0, 1, 2, 3, 4].map((index) => (
        <span
          key={index}
          className={cn(
            "block w-[3px] rounded-full",
            tone === "primary" && "bg-[var(--wh-primary)]",
            active ? (tall ? "h-8 [animation:wh-wave_0.9s_ease-in-out_infinite]" : "h-5 [animation:wh-wave_0.9s_ease-in-out_infinite]") : "h-1.5",
          )}
          style={{ animationDelay: `${index * 110}ms` }}
        />
      ))}
    </span>
  );
}

/** The circular controls. One shape, three jobs, never more than two at once. */
function RoundButton({
  tone,
  label,
  children,
  onClick,
  disabled,
  type = "button",
}: {
  tone: "primary" | "outline" | "listening" | "danger";
  label: string;
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-full transition-[transform,opacity,background-color] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)] disabled:cursor-not-allowed disabled:opacity-40",
        !disabled && "hover:scale-105",
        tone === "primary" && "bg-[var(--wh-primary)] text-[var(--wh-primary-foreground)] shadow-[var(--wh-shadow-card)]",
        tone === "outline" &&
          "border border-[var(--wh-border-strong)] bg-[var(--wh-surface)] text-[var(--wh-foreground-muted)] hover:border-[var(--wh-primary)] hover:text-[var(--wh-primary)]",
        tone === "listening" && "border-2 border-[var(--wh-primary)] bg-[var(--wh-surface)] text-[var(--wh-primary)]",
        tone === "danger" && "bg-[var(--wh-risk)] text-white shadow-[var(--wh-shadow-card)]",
      )}
    >
      {children}
    </button>
  );
}
