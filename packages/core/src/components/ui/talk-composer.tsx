"use client";

import { ArrowUp, AudioLines, ChevronDown, Mic, Plus, Square, X } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { cn } from "../../lib/cn";
import { BrandMark } from "./brand";
import { useGeminiLive } from "./use-gemini-live";
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
  liveEngine = "wonderhome",
  geminiLive: geminiLiveAvailability = { available: false },
  onLiveTranscript,
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
  /**
   * Who runs a live conversation (voice phase 3): WonderHome's own listen/
   * speak loop, or Gemini Live calling HomeTalk's tools. The page decides,
   * from the household's setting and the server's own availability check.
   */
  liveEngine?: LiveEngineChoice;
  /**
   * Whether Gemini Live may run for this household now, and if not, why —
   * the server's own check. The picker offers it only when it may; the
   * token route checks again on every session regardless.
   */
  geminiLive?: { available: boolean; reason?: string };
  /** Gemini Live only: each side's words, once per utterance, for the conversation on screen. */
  onLiveTranscript?: (entry: { role: "member" | "assistant"; text: string }) => void;
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

  const ownLive = useLiveVoice({
    lang: voiceLanguage,
    server,
    onUtterance: onLiveTurn ?? (async () => ""),
    onError,
  });
  const geminiLive = useGeminiLive({ householdId, onTranscript: onLiveTranscript, onError });
  const [engine, setEngine] = useLiveEnginePreference(householdId, liveEngine, geminiLiveAvailability.available);
  // One live control either way; only what runs behind it differs.
  const live =
    engine === "gemini_live"
      ? { ...geminiLive, state: geminiLive.state === "connecting" ? ("thinking" as const) : geminiLive.state }
      : ownLive;

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

  const voiceBusy = state === "listening" || state === "transcribing";
  const inLive = state === "live" || state === "paused";

  return (
    <form onSubmit={onSubmit} className={cn("w-full", className)}>
      <div
        className={cn(
          "rounded-[1.75rem] border border-[var(--wh-border)] bg-[var(--wh-surface)] p-2 shadow-[var(--wh-shadow-raised)] transition-colors",
          composing && "focus-within:border-[var(--wh-primary)]",
        )}
      >
        {/* What is being said: the words, the microphone, or the live
            conversation. Always the full width, so a long message has room. */}
        <div className="flex min-h-12 px-2 pt-1">
          {voiceBusy ? (
            <ListeningField transcribing={state === "transcribing"} />
          ) : inLive ? (
            <LiveField
              paused={state === "paused"}
              speaking={live.state === "speaking"}
              thinking={live.state === "thinking"}
              engine={engine}
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
                    className="pointer-events-none absolute inset-y-0 left-0 flex items-center text-[0.9375rem] text-[var(--wh-foreground-subtle)]"
                  >
                    <span className="sm:hidden">{placeholderShort}</span>
                    <span className="hidden sm:inline">{placeholder}</span>
                  </span>
                ) : null}
              </div>
            </>
          )}
        </div>

        {/* The controls. Which ones exist is the state's decision, never a
            disabled row of everything. */}
        <div className="mt-1 flex items-center gap-1 sm:gap-2">
          {composing ? (
            <>
              {onAttach ? (
                <RoundButton
                  tone="soft"
                  label="Send a photo or paste something — WonderHome reads it and asks you to confirm"
                  onClick={onAttach}
                  disabled={disabled}
                >
                  <Plus className="size-5" />
                </RoundButton>
              ) : null}
              {liveConversationAvailable ? (
                <LiveEnginePicker value={engine} onChange={setEngine} geminiLive={geminiLiveAvailability} disabled={disabled} />
              ) : null}
            </>
          ) : null}

          <span aria-hidden className="flex-1" />

          {voiceBusy ? (
            <RoundButton
              tone="listening"
              label={state === "transcribing" ? "Stop transcribing" : "Stop listening"}
              onClick={() => (state === "transcribing" ? speech.cancel() : speech.stop())}
            >
              <Square className="size-4" fill="currentColor" />
            </RoundButton>
          ) : inLive ? (
            <RoundButton tone="danger" label="End voice conversation" onClick={endLive}>
              <X className="size-5" />
            </RoundButton>
          ) : (
            <>
              {speech.available ? (
                <RoundButton
                  tone="soft"
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
                  label={`Start a voice conversation with ${LIVE_ENGINE_NAMES[engine]} — it answers out loud`}
                  onClick={live.start}
                  disabled={disabled}
                >
                  <AudioLines className="size-5" />
                </RoundButton>
              )}
            </>
          )}
        </div>
      </div>

      {voiceBusy ? <Steps transcribing={state === "transcribing"} /> : null}
    </form>
  );
}

export type LiveEngineChoice = "wonderhome" | "gemini_live";

const LIVE_ENGINE_NAMES: Record<LiveEngineChoice, string> = { wonderhome: "WonderHome", gemini_live: "Gemini Live" };

/**
 * Which engine this person talks to, starting from the household's own
 * setting. A change here is theirs alone and stays on this device: the
 * household default is still an Admin's decision in Settings. Gemini Live is
 * never kept as the choice once the server says it may not run.
 */
function useLiveEnginePreference(householdId: string, householdDefault: LiveEngineChoice, geminiAvailable: boolean) {
  const key = `wh:live-engine:${householdId}`;
  const [choice, setChoice] = useState<LiveEngineChoice>(householdDefault);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(key);
      if (saved === "wonderhome" || saved === "gemini_live") setChoice(saved);
    } catch {
      // Storage can be unavailable (a private window); the default stands.
    }
  }, [key]);

  const update = useCallback(
    (next: LiveEngineChoice) => {
      setChoice(next);
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // Still chosen for this visit.
      }
    },
    [key],
  );

  return [choice === "gemini_live" && !geminiAvailable ? "wonderhome" : choice, update] as const;
}

/** Gemini's four-pointed spark, drawn in the kit's own blue-to-violet. */
function GeminiSpark({ size = 20 }: { size?: number }) {
  // Its own id per copy: the trigger and the menu both draw one, and a
  // gradient id that repeats paints nothing once the first copy unmounts.
  const id = `wh-gemini-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" className="shrink-0">
      <defs>
        <linearGradient id={id} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="var(--wh-info)" />
          <stop offset="1" stopColor="var(--wh-tone-school)" />
        </linearGradient>
      </defs>
      <path
        d="M12 1.5c.5 5.6 4.9 10 10.5 10.5-5.6.5-10 4.9-10.5 10.5C11.5 16.9 7.1 12.5 1.5 12 7.1 11.5 11.5 7.1 12 1.5Z"
        fill={`url(#${id})`}
      />
    </svg>
  );
}

function EngineIcon({ engine, size }: { engine: LiveEngineChoice; size: number }) {
  return engine === "gemini_live" ? <GeminiSpark size={size} /> : <BrandMark size={size} className="shrink-0" />;
}

/**
 * Who answers a live conversation: WonderHome's own voice, or Gemini Live
 * calling HomeTalk's tools. A picked choice, never typed (rule 20), and only
 * the engines this household can actually run are selectable.
 */
function LiveEnginePicker({
  value,
  onChange,
  geminiLive,
  disabled,
}: {
  value: LiveEngineChoice;
  onChange: (engine: LiveEngineChoice) => void;
  geminiLive: { available: boolean; reason?: string };
  disabled?: boolean;
}) {
  const options: { engine: LiveEngineChoice; available: boolean; note?: string }[] = [
    { engine: "wonderhome", available: true },
    { engine: "gemini_live", available: geminiLive.available, note: geminiLive.available ? undefined : geminiLive.reason },
  ];

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        disabled={disabled}
        aria-label={`Live conversation with ${LIVE_ENGINE_NAMES[value]}. Change`}
        className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-[var(--wh-primary-soft)] pr-2 pl-1 text-sm sm:h-11 sm:gap-2 sm:pr-2.5 sm:pl-1.5 font-semibold text-[var(--wh-foreground)] transition-colors hover:bg-[var(--wh-info-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span className="grid size-8 place-items-center rounded-full bg-[var(--wh-surface)]">
          <EngineIcon engine={value} size={value === "gemini_live" ? 18 : 22} />
        </span>
        <span>{LIVE_ENGINE_NAMES[value]}</span>
        <ChevronDown aria-hidden className="size-4 text-[var(--wh-foreground-muted)]" />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          align="start"
          sideOffset={10}
          collisionPadding={16}
          className="z-50 w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)] shadow-[var(--wh-shadow-float)]"
        >
          <DropdownMenu.Label className="sr-only">Who answers a live conversation</DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={value} onValueChange={(next) => onChange(next as LiveEngineChoice)}>
            {options.map((option, index) => (
              <DropdownMenu.RadioItem
                key={option.engine}
                value={option.engine}
                disabled={!option.available}
                className={cn(
                  "flex min-h-16 cursor-pointer items-center gap-3.5 px-4 py-3 outline-none data-[disabled]:cursor-not-allowed data-[highlighted]:bg-[var(--wh-surface-muted)]",
                  index > 0 && "border-t border-[var(--wh-border)]",
                )}
              >
                <span className="grid size-10 shrink-0 place-items-center">
                  <EngineIcon engine={option.engine} size={option.engine === "gemini_live" ? 30 : 38} />
                </span>
                <span className={cn("min-w-0 flex-1", !option.available && "opacity-60")}>
                  <span className="block text-[0.9375rem] font-medium">{LIVE_ENGINE_NAMES[option.engine]}</span>
                  {option.note ? <span className="block text-xs text-[var(--wh-foreground-subtle)]">{option.note}</span> : null}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full border-2",
                    value === option.engine ? "border-[var(--wh-primary)]" : "border-[var(--wh-foreground-subtle)]",
                    !option.available && "opacity-40",
                  )}
                >
                  <DropdownMenu.ItemIndicator className="size-3 rounded-full bg-[var(--wh-primary)]" />
                </span>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
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
  engine,
  onToggle,
}: {
  paused: boolean;
  speaking: boolean;
  thinking: boolean;
  engine: LiveEngineChoice;
  onToggle: () => void;
}) {
  const who = engine === "gemini_live" ? "Gemini Live" : "HomeTalk";
  const status = paused ? "Paused" : thinking ? "Thinking…" : speaking ? "Speaking…" : `${who} is listening…`;

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
  tone: "primary" | "soft" | "listening" | "danger";
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
        "grid size-10 shrink-0 place-items-center rounded-full sm:size-11 transition-[transform,opacity,background-color] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)] disabled:cursor-not-allowed disabled:opacity-40",
        !disabled && "hover:scale-105",
        tone === "primary" && "bg-[var(--wh-primary)] text-[var(--wh-primary-foreground)] shadow-[var(--wh-shadow-card)]",
        tone === "soft" && "bg-[var(--wh-surface-muted)] text-[var(--wh-foreground-muted)] hover:text-[var(--wh-primary)]",
        tone === "listening" && "border-2 border-[var(--wh-primary)] bg-[var(--wh-surface)] text-[var(--wh-primary)]",
        tone === "danger" && "bg-[var(--wh-risk)] text-white shadow-[var(--wh-shadow-card)]",
      )}
    >
      {children}
    </button>
  );
}
