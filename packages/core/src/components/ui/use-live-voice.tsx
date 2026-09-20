"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { recognitionConstructor, type RecognitionLike } from "./voice-input-button";

/**
 * A sustained, hands-free exchange: WonderHome listens, answers out loud,
 * and listens again — the "toggle it on and just talk" mode.
 *
 * Built entirely on the browser's own Web Speech APIs (the same recogniser
 * `VoiceInputButton` uses, plus `speechSynthesis` for the reply), because
 * that is what exists without inventing a credentialed voice provider
 * (CLAUDE.md: no live integration is claimed until one is actually
 * configured). That has real, honest limits worth stating rather than
 * hiding: browser support for continuous recognition varies (Safari's is
 * poor to absent), and a "male voice" is a best-effort pick from whatever
 * voices the device happens to expose — many platforms do not label voices
 * by gender at all, in which case this falls back to the device's own
 * default. `available` reflects exactly what this browser can do; the
 * caller never offers the toggle when it is false.
 *
 * One turn at a time, never overlapping: the microphone is off whenever
 * WonderHome is thinking or speaking, so it never hears its own reply and
 * a hands-free session never talks over itself. `onUtterance` does the
 * actual work — sending what was heard through the same governed endpoint
 * typing does — and must resolve with what to say back rather than throw;
 * this hook only owns the listen/think/speak cycle around it.
 */

export type LiveVoiceState = "idle" | "listening" | "thinking" | "speaking" | "denied" | "unsupported";

const MALE_NAME = /\b(male|david|daniel|alex|fred|george|mark|james|oliver|arthur|guy|ryan|rishi|aaron)\b/i;
const FEMALE_NAME = /\b(female|samantha|victoria|zira|susan|karen|moira|tessa|fiona|kate|amelia|salli|joanna|veena)\b/i;

/** Best-effort only — see the module doc comment. Exported for its own test. */
export function pickVoice<V extends { name: string; lang: string }>(voices: readonly V[], lang: string): V | null {
  if (voices.length === 0) return null;
  const prefix = lang.slice(0, 2).toLowerCase();
  const sameLanguage = voices.filter((voice) => voice.lang.toLowerCase().startsWith(prefix));
  const pool = sameLanguage.length > 0 ? sameLanguage : voices;
  return pool.find((voice) => MALE_NAME.test(voice.name)) ?? pool.find((voice) => !FEMALE_NAME.test(voice.name)) ?? pool[0] ?? null;
}

export function useLiveVoice(input: {
  lang?: string;
  /** What was heard, and how sure the recogniser was; resolves with what to say back. */
  onUtterance: (transcript: string, confidence: number) => Promise<string>;
  /** A fatal problem (denied microphone, unsupported browser) — never thrown. */
  onError?: (message: string) => void;
}): { state: LiveVoiceState; active: boolean; start: () => void; stop: () => void } {
  const { lang = "en-IN", onUtterance, onError } = input;
  const [state, setState] = useState<LiveVoiceState>("idle");
  const [active, setActive] = useState(false);
  const activeRef = useRef(false);
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const onUtteranceRef = useRef(onUtterance);
  onUtteranceRef.current = onUtterance;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const load = () => {
      voicesRef.current = window.speechSynthesis.getVoices();
    };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);

  const speak = useCallback(
    (text: string) =>
      new Promise<void>((resolve) => {
        if (typeof window === "undefined" || !("speechSynthesis" in window) || !text.trim()) {
          resolve();
          return;
        }
        const utterance = new SpeechSynthesisUtterance(text);
        const voice = pickVoice(voicesRef.current, lang);
        if (voice) utterance.voice = voice;
        utterance.lang = lang;
        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
        setState("speaking");
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      }),
    [lang],
  );

  const listenOnce = useCallback(() => {
    if (!activeRef.current) return;
    const Recognition = recognitionConstructor();
    if (!Recognition) {
      activeRef.current = false;
      setActive(false);
      setState("unsupported");
      onErrorRef.current?.("This browser cannot listen continuously, so live conversation is not available.");
      return;
    }

    const recognition = new Recognition();
    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const best = event.results[0]?.[0];
      if (best?.transcript?.trim()) {
        void handleUtterance(best.transcript.trim(), Number.isFinite(best.confidence) ? best.confidence : 0.5);
      } else if (activeRef.current) {
        listenOnce();
      }
    };
    recognition.onerror = (event) => {
      recognitionRef.current = null;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        activeRef.current = false;
        setActive(false);
        setState("denied");
        onErrorRef.current?.("Microphone access was refused, so live conversation stopped.");
        return;
      }
      // Silence ("no-speech") and our own abort() are ordinary pauses in a
      // hands-free conversation, not failures — just listen again.
      if (activeRef.current) listenOnce();
      else setState("idle");
    };
    recognition.onend = () => {
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    setState("listening");
    try {
      recognition.start();
    } catch {
      if (activeRef.current) listenOnce();
    }

    async function handleUtterance(transcript: string, confidence: number): Promise<void> {
      setState("thinking");
      let reply = "";
      try {
        reply = await onUtteranceRef.current(transcript, confidence);
      } catch {
        reply = "";
      }
      if (!activeRef.current) return;
      await speak(reply);
      if (activeRef.current) listenOnce();
      else setState("idle");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, speak]);

  const start = useCallback(() => {
    if (typeof window === "undefined" || !recognitionConstructor() || !("speechSynthesis" in window)) {
      setState("unsupported");
      return;
    }
    activeRef.current = true;
    setActive(true);
    listenOnce();
  }, [listenOnce]);

  const stop = useCallback(() => {
    activeRef.current = false;
    setActive(false);
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setState("idle");
  }, []);

  useEffect(
    () => () => {
      activeRef.current = false;
      recognitionRef.current?.abort();
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    },
    [],
  );

  return { state, active, start, stop };
}
