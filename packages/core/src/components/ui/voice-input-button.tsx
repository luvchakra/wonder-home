"use client";

import { Mic, MicOff, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "../../lib/cn";

/**
 * The microphone.
 *
 * Speech is recognised by the browser's own Web Speech API where it exists.
 * Nothing is uploaded from here: the transcript — and how sure the recogniser
 * was of it — go to the same conversation endpoint text does, because voice and
 * text are one engine with the channel as metadata (module 04).
 *
 * Where the API is missing, the button says so rather than pretending to
 * listen. Permission refusals are surfaced the same way.
 */
export type VoiceResult = { transcript: string; confidence: number };

type RecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type RecognitionConstructor = new () => RecognitionLike;

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const candidate = (window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor });
  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null;
}

export type VoiceState = "unsupported" | "idle" | "listening" | "denied";

const SIZE = {
  md: { button: "size-11", icon: "size-5", iconListening: "size-4" },
  lg: { button: "size-16", icon: "size-7", iconListening: "size-6" },
  /** The composer's own mic — voice is the P0 way into WonderHome, so it is the largest thing in the bar. */
  xl: { button: "size-[4.75rem]", icon: "size-8", iconListening: "size-7" },
} as const;

export function VoiceInputButton({
  onResult,
  onStateChange,
  lang = "en-IN",
  size = "md",
  className,
}: {
  onResult: (result: VoiceResult) => void;
  onStateChange?: (state: VoiceState) => void;
  lang?: string;
  size?: "md" | "lg" | "xl";
  className?: string;
}) {
  const [state, setState] = useState<VoiceState>("idle");
  const recognitionRef = useRef<RecognitionLike | null>(null);

  useEffect(() => {
    if (!recognitionConstructor()) setState("unsupported");
  }, []);

  useEffect(() => {
    onStateChange?.(state);
  }, [state, onStateChange]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Recognition = recognitionConstructor();
    if (!Recognition) {
      setState("unsupported");
      return;
    }

    const recognition = new Recognition();
    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const best = event.results[0]?.[0];
      if (best?.transcript) {
        onResult({ transcript: best.transcript.trim(), confidence: Number.isFinite(best.confidence) ? best.confidence : 0.5 });
      }
    };
    recognition.onerror = (event) => {
      setState(event.error === "not-allowed" || event.error === "service-not-allowed" ? "denied" : "idle");
    };
    recognition.onend = () => {
      setState((current) => (current === "listening" ? "idle" : current));
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    setState("listening");
    try {
      recognition.start();
    } catch {
      setState("idle");
    }
  }, [lang, onResult]);

  useEffect(() => () => recognitionRef.current?.abort(), []);

  const listening = state === "listening";
  const disabled = state === "unsupported" || state === "denied";
  const label =
    state === "unsupported"
      ? "Voice is not available in this browser"
      : state === "denied"
        ? "Microphone access was refused"
        : listening
          ? "Stop listening"
          : "Tap to speak";
  const dims = SIZE[size];
  const retro = size === "xl";

  return (
    <button
      type="button"
      onClick={listening ? stop : start}
      disabled={disabled}
      aria-label={label}
      aria-pressed={listening}
      title={label}
      className={cn(
        "relative grid shrink-0 place-items-center rounded-full text-[var(--wh-primary-foreground)] transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)] disabled:cursor-not-allowed disabled:opacity-50",
        dims.button,
        listening ? "scale-105" : "hover:scale-105",
        retro && !listening && !disabled && "wh-mic-idle",
        className,
      )}
      style={{
        background: listening ? "var(--wh-gradient-orb)" : "var(--wh-gradient-primary)",
        boxShadow: retro
          ? "var(--wh-shadow-raised), inset 0 2px 3px oklch(1 0 0 / 0.35), inset 0 -4px 8px oklch(0.2 0.05 262 / 0.3)"
          : undefined,
      }}
    >
      {/* The retro touch: a faint concentric grille, like an old ribbon mic's mesh, and one soft highlight for a glassy dome rather than a flat disc. */}
      {retro ? (
        <>
          <span
            aria-hidden
            className="absolute inset-[14%] rounded-full opacity-30"
            style={{
              backgroundImage:
                "repeating-radial-gradient(circle at 50% 50%, transparent 0, transparent 4px, oklch(1 0 0 / 0.6) 4px, oklch(1 0 0 / 0.6) 5px)",
            }}
          />
          <span aria-hidden className="absolute top-[16%] left-[20%] h-[26%] w-[32%] rounded-full bg-white/55 blur-[3px]" />
        </>
      ) : null}
      {retro && !listening && !disabled ? (
        <span aria-hidden className="wh-mic-halo absolute inset-0 rounded-full bg-[var(--wh-primary)]/30" />
      ) : null}
      {listening ? (
        <>
          <span aria-hidden className="absolute inset-0 rounded-full bg-[var(--wh-tone-ai)]/30 [animation:wh-pulse-ring_1.4s_ease-out_infinite]" />
          {retro ? (
            <span aria-hidden className="absolute inset-0 rounded-full bg-[var(--wh-tone-ai)]/20 [animation:wh-pulse-ring_1.4s_ease-out_0.4s_infinite]" />
          ) : null}
          <Square className={dims.iconListening} fill="currentColor" />
        </>
      ) : disabled ? (
        <MicOff className={dims.icon} />
      ) : (
        <Mic className={dims.icon} />
      )}
    </button>
  );
}

/** Five bars that rise and fall while listening — decoration, not data. */
export function Waveform({ active, className }: { active: boolean; className?: string }) {
  return (
    <span aria-hidden className={cn("inline-flex h-6 items-center gap-1", className)}>
      {[0, 1, 2, 3, 4].map((index) => (
        <span
          key={index}
          className={cn(
            "block w-1 rounded-full bg-[var(--wh-tone-ai)] origin-center",
            active ? "h-6 [animation:wh-wave_0.9s_ease-in-out_infinite]" : "h-2",
          )}
          style={{ animationDelay: `${index * 110}ms` }}
        />
      ))}
    </span>
  );
}
