"use client";

import { ArrowUp, AudioLines, ChevronDown, ChevronRight, LoaderCircle, Maximize2, Mic, PictureInPicture2, Plus, Square, X } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, createContext, useContext } from "react";

import { cn } from "../../lib/cn";
import { resolveInitialEngine } from "../../voice/live-engine";
import { setTalkActivity } from "../shell/talk-activity";
import { BrandMark } from "./brand";
import { useLiveTalk } from "./live-talk";
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

/**
 * The composer's own words (story 22-004). English by default; a screen that
 * knows the viewer's language passes its catalog's wording in `labels`.
 */
export type TalkComposerLabels = {
  /** The text box's accessible name. */
  messageLabel: string;
  /** The floating live bar on other screens: its way back to the conversation. */
  openHomeTalk: string;
  /** Float HomeTalk as a small window over other apps (04-020); `unfloat` brings it back. */
  floatLive: string;
  unfloat: string;
  /** The phone would not open the window; the conversation is still here. */
  floatFailed: string;
  /** The floating window's label over what the person said. */
  you: string;
  /** A live session still opening (Gemini Live takes a few seconds): do not speak yet. */
  getReady: string;
  /** `{who}` is HomeTalk or Gemini Live. */
  getReadyHint: string;
  /** Said once the session can hear, for a moment. */
  speakNow: string;
  placeholder: string;
  placeholderShort: string;
  attach: string;
  stopTranscribing: string;
  stopListening: string;
  endLive: string;
  speak: string;
  send: string;
  /** `{engine}` is the engine's name. */
  startLive: string;
  engineTrigger: string;
  enginePicker: string;
  transcribing: string;
  listening: string;
  paused: string;
  thinking: string;
  speaking: string;
  /** `{who}` is HomeTalk or Gemini Live. */
  whoListening: string;
  resumeConversation: string;
  pauseConversation: string;
  resume: string;
  pause: string;
  tapToResume: string;
  tapToPause: string;
  stepListening: string;
  stepTranscribing: string;
  stepReady: string;
};

export const TALK_COMPOSER_LABELS: TalkComposerLabels = {
  messageLabel: "Message WonderHome",
  placeholder: "Ask WonderHome anything…",
  placeholderShort: "Ask anything…",
  attach: "Send a photo or paste something — WonderHome reads it and asks you to confirm",
  stopTranscribing: "Stop transcribing",
  stopListening: "Stop listening",
  endLive: "End voice conversation",
  speak: "Speak — your words go in the box for review",
  send: "Send message",
  startLive: "Start a voice conversation with {engine} — it answers out loud",
  engineTrigger: "Live conversation with {engine}. Change",
  enginePicker: "Who answers a live conversation",
  transcribing: "Transcribing…",
  listening: "Listening…",
  paused: "Paused",
  thinking: "Thinking…",
  speaking: "Speaking…",
  whoListening: "{who} is listening…",
  resumeConversation: "Resume the voice conversation",
  pauseConversation: "Pause the voice conversation",
  resume: "Resume",
  pause: "Pause",
  tapToResume: "Tap to resume",
  tapToPause: "Tap to pause",
  stepListening: "Listening",
  stepTranscribing: "Transcribing",
  stepReady: "Ready to send",
  openHomeTalk: "Back to the HomeTalk conversation",
  floatLive: "Float HomeTalk over other apps — it keeps listening while you do something else",
  unfloat: "Bring HomeTalk back",
  floatFailed: "Your phone couldn't open the floating window. The conversation is still going here.",
  you: "You",
  getReady: "Getting ready… don't speak yet",
  getReadyHint: "{who} is connecting. Start speaking when it says it's listening.",
  speakNow: "Ready — speak now",
};

const LabelsContext = createContext<TalkComposerLabels>(TALK_COMPOSER_LABELS);

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => values[name] ?? "");
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
  labels: labelOverrides,
  placeholder: placeholderProp,
  placeholderShort: placeholderShortProp,
  initialValue = "",
  autoFocus = false,
  liveConversationAvailable = false,
  serverVoice = false,
  voiceLanguage = "en-IN",
  liveEngine = "wonderhome",
  liveEngineExplicit = false,
  onEngineChange,
  geminiLive: geminiLiveAvailability = { available: false },
  onLiveTranscript,
  onLiveTranscriptRevised,
  extraAction,
  className,
}: {
  /** The composer's words in the viewer's language; English when absent. */
  labels?: Partial<TalkComposerLabels>;
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
   * Whether `liveEngine` is this member's own saved choice (true) or just the
   * household default they have not overridden yet (false). When false, the
   * composer migrates the browser's old localStorage choice up to the server
   * once, so a member who picked an engine before it was server-side keeps it.
   */
  liveEngineExplicit?: boolean;
  /**
   * Persist this member's engine choice to the server — the one value Settings
   * reads too, so the two surfaces cannot drift. Memoise it: the composer calls
   * it from an effect. Omit to keep the choice on this device only.
   */
  onEngineChange?: (engine: LiveEngineChoice) => void;
  /**
   * Whether Gemini Live may run for this household now, and if not, why —
   * the server's own check. The picker offers it only when it may; the
   * token route checks again on every session regardless.
   */
  /** `fix` links to where an Admin can make Gemini Live available, and comes back. */
  geminiLive?: { available: boolean; reason?: string; fix?: { href: string; label: string } };
  /** Gemini Live only: each side's words, once per utterance, for the conversation on screen. */
  onLiveTranscript?: (entry: { role: "member" | "assistant"; text: string; id?: string }) => void;
  /** A live line written down properly afterwards: replace the shown line with this id. */
  onLiveTranscriptRevised?: (entry: { id: string; text: string }) => void;
  /**
   * One more round control in the button row, just left of the microphone
   * (HomeTalk's Ask me about family, 2026-10-21). Shown only while composing;
   * the caller decides whether it exists at all and what it does. Icon-only,
   * so `label` is its accessible name and its tooltip.
   */
  extraAction?: { label: string; icon: React.ReactNode; onClick: () => void; disabled?: boolean } | null;
  className?: string;
}) {
  const labels: TalkComposerLabels = { ...TALK_COMPOSER_LABELS, ...labelOverrides };
  const placeholder = placeholderProp ?? labels.placeholder;
  const placeholderShort = placeholderShortProp ?? labels.placeholderShort;
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

  // The live conversation itself lives at the root of the app (`LiveTalkProvider`),
  // so it carries on when the person goes to another screen. This composer
  // configures it, and takes its turns while HomeTalk's page is open.
  const talk = useLiveTalk();
  const [engine, setEngine] = useLiveEnginePreference(householdId, liveEngine, liveEngineExplicit, geminiLiveAvailability.available, onEngineChange);
  const liveBarLabels = useMemo(
    () => ({
      connecting: labels.getReady,
      listening: labels.listening,
      thinking: labels.thinking,
      speaking: labels.speaking,
      paused: labels.paused,
      pause: labels.pauseConversation,
      resume: labels.resumeConversation,
      end: labels.endLive,
      open: labels.openHomeTalk,
      float: labels.floatLive,
      unfloat: labels.unfloat,
      floatFailed: labels.floatFailed,
      you: labels.you,
    }),
    [
      labels.getReady,
      labels.listening,
      labels.thinking,
      labels.speaking,
      labels.paused,
      labels.pauseConversation,
      labels.resumeConversation,
      labels.endLive,
      labels.openHomeTalk,
      labels.floatLive,
      labels.unfloat,
      labels.floatFailed,
      labels.you,
    ],
  );
  useEffect(() => {
    talk?.configure({ householdId, lang: voiceLanguage, serverVoice, labels: liveBarLabels });
  }, [talk, householdId, voiceLanguage, serverVoice, liveBarLabels]);
  const turnHandler = useRef({ onLiveTurn, onLiveTranscript, onLiveTranscriptRevised });
  turnHandler.current = { onLiveTurn, onLiveTranscript, onLiveTranscriptRevised };
  useEffect(
    () =>
      talk?.register({
        onUtterance: (transcript, confidence) => turnHandler.current.onLiveTurn?.(transcript, confidence) ?? Promise.resolve(""),
        onTranscript: (entry) => turnHandler.current.onLiveTranscript?.(entry),
        onTranscriptRevised: (entry) => turnHandler.current.onLiveTranscriptRevised?.(entry),
      }),
    [talk],
  );
  // One live control either way; only what runs behind it differs.
  const shared = talk?.view(engine) ?? { state: "idle" as const, active: false, paused: false };
  const live = {
    ...shared,
    start: () => talk?.start(engine),
    pause: () => talk?.pause(),
    resume: () => talk?.resume(),
    stop: () => talk?.stop(),
  };

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

  // The tab bar's raised HomeTalk button shows dictation in progress; a live
  // conversation is the provider's to show, on every screen.
  const liveActive = live.active;
  useEffect(() => {
    if (liveActive) return;
    setTalkActivity(state === "listening" || state === "transcribing" ? "listening" : "idle");
  }, [state, liveActive]);
  const liveActiveRef = useRef(liveActive);
  liveActiveRef.current = liveActive;
  useEffect(() => () => {
    if (!liveActiveRef.current) setTalkActivity("idle");
  }, []);

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
    talk?.stop();
    onLiveEnd?.();
  }, [talk, onLiveEnd]);

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
    <LabelsContext.Provider value={labels}>
    <form onSubmit={onSubmit} className={cn("w-full", className)}>
      <div
        className={cn(
          "rounded-[1.75rem] border border-[var(--wh-border)] bg-[var(--wh-surface)] p-1.5 shadow-[var(--wh-shadow-raised)] transition-colors",
          composing && "focus-within:border-[var(--wh-primary)]",
        )}
      >
        {/* What is being said: the words, the microphone, or the live
            conversation. Always the full width, so a long message has room. */}
        <div className="flex min-h-10 px-2">
          {voiceBusy ? (
            <ListeningField transcribing={state === "transcribing"} />
          ) : inLive ? (
            <LiveField
              paused={state === "paused"}
              connecting={live.state === "connecting"}
              speaking={live.state === "speaking"}
              thinking={live.state === "thinking"}
              engine={engine}
              notice={talk?.notice ?? null}
              onToggle={() => (live.paused ? live.resume() : live.pause())}
            />
          ) : (
            <>
              <label htmlFor="wh-composer" className="sr-only">
                {labels.messageLabel}
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
                  className="max-h-36 min-h-10 w-full resize-none bg-transparent py-2 text-[0.9375rem] leading-snug outline-none disabled:opacity-60"
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
        <div className="@container flex min-w-0 items-center gap-1 sm:gap-2">
          {composing ? (
            <>
              {onAttach ? (
                <RoundButton
                  tone="soft"
                  label={labels.attach}
                  onClick={onAttach}
                  disabled={disabled}
                >
                  <Plus className="size-5" />
                </RoundButton>
              ) : null}
              {liveConversationAvailable ? (
                <LiveEnginePicker value={engine} onChange={setEngine} geminiLive={geminiLiveAvailability} disabled={disabled} compact={Boolean(extraAction)} />
              ) : null}
            </>
          ) : null}

          <span aria-hidden className="flex-1" />

          {voiceBusy ? (
            <RoundButton
              tone="listening"
              label={state === "transcribing" ? labels.stopTranscribing : labels.stopListening}
              onClick={() => (state === "transcribing" ? speech.cancel() : speech.stop())}
            >
              <Square className="size-4" fill="currentColor" />
            </RoundButton>
          ) : inLive ? (
            <>
              {/* Float (04-020): the same conversation as a small window over
                  other apps. Only where the phone can actually do it (rule 10). */}
              {talk?.floatable ? (
                <RoundButton tone="soft" label={talk.floating ? labels.unfloat : labels.floatLive} onClick={talk.floating ? talk.unfloat : talk.float}>
                  {talk.floating ? <Maximize2 className="size-5" /> : <PictureInPicture2 className="size-5" />}
                </RoundButton>
              ) : null}
              <RoundButton tone="danger" label={labels.endLive} onClick={endLive}>
                <X className="size-5" />
              </RoundButton>
            </>
          ) : (
            <>
              {extraAction ? (
                <RoundButton tone="soft" label={extraAction.label} onClick={extraAction.onClick} disabled={disabled || extraAction.disabled}>
                  {extraAction.icon}
                </RoundButton>
              ) : null}
              {speech.available ? (
                <RoundButton
                  tone="soft"
                  label={labels.speak}
                  onClick={speech.start}
                  disabled={disabled}
                >
                  <Mic className="size-5" />
                </RoundButton>
              ) : null}

              {state === "typing" || !liveConversationAvailable ? (
                <RoundButton tone="primary" label={labels.send} type="submit" disabled={disabled || !value.trim()}>
                  <ArrowUp className="size-5" />
                </RoundButton>
              ) : (
                <RoundButton
                  tone="primary"
                  label={fill(labels.startLive, { engine: LIVE_ENGINE_NAMES[engine] })}
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
    </LabelsContext.Provider>
  );
}

export type LiveEngineChoice = "wonderhome" | "gemini_live";

const LIVE_ENGINE_NAMES: Record<LiveEngineChoice, string> = { wonderhome: "WonderHome", gemini_live: "Gemini Live" };

/**
 * Which engine this person talks to. One per-member value, server-side (see
 * `voice/live-engine.ts` and `household_members.live_engine`): the composer
 * and Settings -> Voice read and write the same thing, so they cannot drift,
 * and the choice follows the member across devices.
 *
 * `serverEngine` is the effective engine the page resolved (the member's own
 * choice, else the household default); `explicit` says whether that is their
 * own saved choice yet. localStorage is only a fast cache now: on load the
 * server wins, except that a member who chose an engine in the browser before
 * it was server-side (no explicit row) has that one cached choice adopted and
 * migrated up to the server once. Gemini Live is never left as the running
 * choice once the server says it may not run.
 */
function useLiveEnginePreference(
  householdId: string,
  serverEngine: LiveEngineChoice,
  explicit: boolean,
  geminiAvailable: boolean,
  persist?: (engine: LiveEngineChoice) => void,
) {
  const key = `wh:live-engine:${householdId}`;
  const [choice, setChoice] = useState<LiveEngineChoice>(serverEngine);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(key);
    } catch {
      // Storage can be unavailable (a private window); the server value stands.
    }
    const { engine, migrate } = resolveInitialEngine({ server: serverEngine, explicit, stored, geminiAvailable });
    setChoice(engine);
    try {
      // Keep the cache in step: the chosen (or migrated) value, so a reload
      // before the next server read still shows it.
      window.localStorage.setItem(key, migrate ?? serverEngine);
    } catch {
      // No cache; the server value is still authoritative next load.
    }
    if (migrate) persist?.(migrate);
    // `persist` is intentionally omitted: it is a stable, memoised callback and
    // re-running on its identity would re-migrate. The server value and flags
    // are what should drive reconciliation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, serverEngine, explicit, geminiAvailable]);

  const update = useCallback(
    (next: LiveEngineChoice) => {
      setChoice(next);
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // Still chosen for this visit.
      }
      persist?.(next);
    },
    [key, persist],
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
  compact = false,
}: {
  value: LiveEngineChoice;
  onChange: (engine: LiveEngineChoice) => void;
  geminiLive: { available: boolean; reason?: string; fix?: { href: string; label: string } };
  disabled?: boolean;
  /**
   * The row also carries another control: where the row is too narrow for
   * the engine's name as well (a 360px phone), the pill keeps its icon and
   * chevron and the name stays in its accessible label — never clipped.
   */
  compact?: boolean;
}) {
  const labels = useContext(LabelsContext);
  const options: { engine: LiveEngineChoice; available: boolean; note?: string }[] = [
    { engine: "wonderhome", available: true },
    { engine: "gemini_live", available: geminiLive.available, note: geminiLive.available ? undefined : geminiLive.reason },
  ];

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        disabled={disabled}
        aria-label={fill(labels.engineTrigger, { engine: LIVE_ENGINE_NAMES[value] })}
        className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-[var(--wh-primary-soft)] pr-2 pl-1 text-sm sm:h-11 sm:gap-2 sm:pr-2.5 sm:pl-1.5 font-semibold text-[var(--wh-foreground)] transition-colors hover:bg-[var(--wh-info-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span className="grid size-8 place-items-center rounded-full bg-[var(--wh-surface)]">
          <EngineIcon engine={value} size={value === "gemini_live" ? 18 : 22} />
        </span>
        <span className={cn("whitespace-nowrap", compact && "hidden @[22.5rem]:inline")}>{LIVE_ENGINE_NAMES[value]}</span>
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
          <DropdownMenu.Label className="sr-only">{labels.enginePicker}</DropdownMenu.Label>
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
          {!geminiLive.available && geminiLive.fix ? (
            <DropdownMenu.Item asChild>
              <a
                href={geminiLive.fix.href}
                className="flex min-h-11 items-center gap-1.5 border-t border-[var(--wh-border)] px-4 py-2.5 text-sm font-semibold text-[var(--wh-primary)] outline-none data-[highlighted]:bg-[var(--wh-surface-muted)]"
              >
                {geminiLive.fix.label}
                <ChevronRight aria-hidden className="size-4 rtl:rotate-180" />
              </a>
            </DropdownMenu.Item>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** The field while the microphone is open: what is happening, where the words will appear. */
function ListeningField({ transcribing }: { transcribing: boolean }) {
  const labels = useContext(LabelsContext);
  return (
    <div
      className="flex min-h-11 min-w-0 flex-1 items-center gap-3 self-center rounded-full bg-[var(--wh-primary-soft)] px-3.5"
      role="status"
      aria-live="polite"
    >
      <Bars active={!transcribing} tone="primary" />
      <span className="min-w-0 text-[0.9375rem] font-medium text-[var(--wh-primary)]">
        {transcribing ? labels.transcribing : labels.listening}
      </span>
    </div>
  );
}

/**
 * The field during a live conversation, and the tap target that pauses it.
 * A notice (a window that would not open) takes the hint's line.
 *
 * While the session is still opening — Gemini Live takes a few seconds to
 * reach Google — the field says so in amber, with a turning ring and no
 * moving bars, so nobody starts talking to a microphone that cannot hear
 * yet (the owner, 2026-10-18). The moment it can, it says "speak now" in
 * green for a few seconds, then settles into the usual listening line.
 */
function LiveField({
  paused,
  connecting,
  speaking,
  thinking,
  engine,
  notice,
  onToggle,
}: {
  paused: boolean;
  connecting: boolean;
  speaking: boolean;
  thinking: boolean;
  engine: LiveEngineChoice;
  notice: string | null;
  onToggle: () => void;
}) {
  const labels = useContext(LabelsContext);
  const who = engine === "gemini_live" ? "Gemini Live" : "HomeTalk";
  const [justReady, setJustReady] = useState(false);
  const wasConnecting = useRef(connecting);
  useEffect(() => {
    if (wasConnecting.current && !connecting && !paused) {
      setJustReady(true);
      const timer = setTimeout(() => setJustReady(false), 3000);
      wasConnecting.current = connecting;
      return () => clearTimeout(timer);
    }
    wasConnecting.current = connecting;
  }, [connecting, paused]);

  if (connecting) {
    return (
      <div
        role="status"
        aria-live="assertive"
        className="flex min-h-11 min-w-0 flex-1 items-center gap-3 self-center rounded-[1.25rem] bg-[var(--wh-attention-soft)] px-3.5 py-2"
      >
        <LoaderCircle aria-hidden className="size-6 shrink-0 text-[var(--wh-attention)] motion-safe:animate-spin" />
        <span className="min-w-0">
          <span className="block text-[0.9375rem] font-semibold text-[var(--wh-foreground)]">{labels.getReady}</span>
          <span className="block text-xs text-[var(--wh-foreground-muted)]">{fill(labels.getReadyHint, { who })}</span>
        </span>
      </div>
    );
  }

  const status = paused ? labels.paused : thinking ? labels.thinking : speaking ? labels.speaking : justReady ? labels.speakNow : fill(labels.whoListening, { who });
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={paused ? labels.resumeConversation : labels.pauseConversation}
      title={paused ? labels.resume : labels.pause}
      className={cn(
        "flex min-h-11 min-w-0 flex-1 items-center gap-3 self-center rounded-full px-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]",
        justReady && "bg-[var(--wh-handled-soft)] px-3",
      )}
    >
      <Bars active={!paused} tone="primary" tall />
      <span className="min-w-0" role="status" aria-live="polite">
        <span className={cn("block text-[0.9375rem] font-semibold", justReady ? "text-[var(--wh-handled)]" : "text-[var(--wh-primary)]")}>{status}</span>
        <span className="block text-xs text-[var(--wh-foreground-subtle)]">{notice ?? (paused ? labels.tapToResume : labels.tapToPause)}</span>
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
  const labels = useContext(LabelsContext);
  const steps = [
    { label: labels.stepListening, done: true },
    { label: labels.stepTranscribing, done: transcribing },
    { label: labels.stepReady, done: false },
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
