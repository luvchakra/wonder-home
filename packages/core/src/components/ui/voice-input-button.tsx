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
  size?: "md" | "lg";
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
        size === "lg" ? "size-16" : "size-11",
        listening ? "scale-105" : "hover:scale-105",
        className,
      )}
      style={{ background: listening ? "var(--wh-gradient-orb)" : "var(--wh-gradient-primary)" }}
    >
      {listening ? (
        <>
          <span aria-hidden className="absolute inset-0 rounded-full bg-[var(--wh-tone-ai)]/30 [animation:wh-pulse-ring_1.4s_ease-out_infinite]" />
          <Square className={size === "lg" ? "size-6" : "size-4"} fill="currentColor" />
        </>
      ) : disabled ? (
        <MicOff className={size === "lg" ? "size-7" : "size-5"} />
      ) : (
        <Mic className={size === "lg" ? "size-7" : "size-5"} />
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
