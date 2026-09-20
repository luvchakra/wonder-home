"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { captureUtterance, microphoneAvailable, playClip } from "../../voice/capture";
import { recognitionConstructor, type RecognitionLike } from "../../voice/recognition";

/**
 * A sustained, hands-free exchange: WonderHome listens, answers out loud,
 * and listens again — the "toggle it on and just talk" mode.
 *
 * There are two ways to do that, and this hook runs whichever the
 * household has actually configured:
 *
 *   - **The browser's own** Web Speech APIs. Free, needs nothing set up,
 *     and genuinely limited: continuous recognition is poor to absent in
 *     Safari, and a "male voice" is a best-effort pick from whatever the
 *     device exposes, since many platforms do not label voices by gender
 *     at all.
 *   - **The household's speech provider** (Google Cloud Speech today),
 *     reached through our own server so the key never touches the page.
 *     Better recognition, a voice the household actually chose, and the
 *     same behaviour in every browser.
 *
 * One turn at a time either way, never overlapping: the microphone is off
 * whenever WonderHome is thinking or speaking, so it never hears its own
 * reply. `onUtterance` does the real work — sending what was heard through
 * the same governed endpoint typing uses — and must resolve with what to
 * say back rather than throw; this hook only owns the listen/think/speak
 * cycle around it.
 */

export type LiveVoiceState = "idle" | "listening" | "thinking" | "speaking" | "denied" | "unsupported";

const MALE_NAME = /\b(male|david|daniel|alex|fred|george|mark|james|oliver|arthur|guy|ryan|rishi|aaron)\b/i;
const FEMALE_NAME = /\b(female|samantha|victoria|zira|susan|karen|moira|tessa|fiona|kate|amelia|salli|joanna|veena)\b/i;

/**
 * Best-effort only, and only for the browser's own voices — a household
 * using a real provider picks a named voice instead of hoping. Exported
 * for its own test.
 */
export function pickVoice<V extends { name: string; lang: string }>(voices: readonly V[], lang: string): V | null {
  if (voices.length === 0) return null;
  const prefix = lang.slice(0, 2).toLowerCase();
  const sameLanguage = voices.filter((voice) => voice.lang.toLowerCase().startsWith(prefix));
  const pool = sameLanguage.length > 0 ? sameLanguage : voices;
  return pool.find((voice) => MALE_NAME.test(voice.name)) ?? pool.find((voice) => !FEMALE_NAME.test(voice.name)) ?? pool[0] ?? null;
}

export function useLiveVoice(input: {
  lang?: string;
  /**
   * The household whose configured provider should do the speaking and
   * listening. Null keeps everything in the browser, which is what a
   * household that has configured nothing gets.
   */
  server?: { householdId: string } | null;
  /** What was heard, and how sure the recogniser was; resolves with what to say back. */
  onUtterance: (transcript: string, confidence: number) => Promise<string>;
  /** A fatal problem (denied microphone, unsupported browser) — never thrown. */
  onError?: (message: string) => void;
}): {
  state: LiveVoiceState;
  active: boolean;
  /** On, but not listening — the session is still open and still gets its recap. */
  paused: boolean;
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
} {
  const { lang = "en-IN", server = null, onUtterance, onError } = input;
  const [state, setState] = useState<LiveVoiceState>("idle");
  const [active, setActive] = useState(false);
  const [paused, setPaused] = useState(false);
  const activeRef = useRef(false);
  /**
   * Paused is not stopped. `activeRef` stays true so the assistant keeps
   * the session — and the message the recap will be measured from — while
   * both loops below simply stop taking turns.
   */
  const pausedRef = useRef(false);
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const onUtteranceRef = useRef(onUtterance);
  onUtteranceRef.current = onUtterance;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const householdId = server?.householdId ?? null;

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const load = () => {
      voicesRef.current = window.speechSynthesis.getVoices();
    };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);

  const halt = useCallback((next: LiveVoiceState, message?: string) => {
    activeRef.current = false;
    pausedRef.current = false;
    setActive(false);
    setPaused(false);
    setState(next);
    if (message) onErrorRef.current?.(message);
  }, []);

  /** The browser's own voice, used when no provider is configured. */
  const speakHere = useCallback(
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

  /**
   * The provider's loop, which is a plain sequence because it can be:
   * record, transcribe, answer, play, again. The browser recogniser below
   * cannot be written this way — it hands control back through callbacks —
   * which is most of why the two are separate.
   */
  const runWithProvider = useCallback(async () => {
    if (!householdId) return;

    const speak = async (text: string): Promise<void> => {
      const response = await fetch(`/api/v1/households/${householdId}/voice`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ speak: text }),
      });
      const payload = await response.json();
      // Spoken replies being switched off is a setting, not a failure: the
      // conversation carries on in text and listens again.
      if (!response.ok) {
        if (response.status === 400) return;
        throw new Error(payload?.error?.message ?? "That reply could not be spoken.");
      }
      await playClip({ base64: payload.audio, mimeType: payload.mimeType }, abortRef.current?.signal);
    };

    while (activeRef.current && !pausedRef.current) {
      setState("listening");
      const heard = await captureUtterance({ signal: abortRef.current?.signal });
      if (!activeRef.current) break;
      // Nothing was said. Listen again rather than send silence to a
      // provider that would charge for it.
      if (!heard) continue;

      setState("thinking");
      const response = await fetch(`/api/v1/households/${householdId}/voice`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ audio: heard.clip.base64, mimeType: heard.clip.mimeType }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? "That could not be heard.");
      if (!activeRef.current) break;

      const transcript = String(payload.transcript ?? "").trim();
      if (!transcript) continue;

      let reply = "";
      try {
        reply = await onUtteranceRef.current(transcript, Number(payload.confidence) || 0.5);
      } catch {
        reply = "";
      }
      if (!activeRef.current) break;
      if (reply) await speak(reply);
    }
  }, [householdId]);

  /** The browser's own recogniser, one utterance at a time. */
  const listenHere = useCallback(() => {
    if (!activeRef.current || pausedRef.current) return;
    const Recognition = recognitionConstructor();
    if (!Recognition) {
      halt("unsupported", "This browser cannot listen continuously, so live conversation is not available.");
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
        void handle(best.transcript.trim(), Number.isFinite(best.confidence) ? best.confidence : 0.5);
      } else if (activeRef.current && !pausedRef.current) {
        listenHere();
      }
    };
    recognition.onerror = (event) => {
      recognitionRef.current = null;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        halt("denied", "Microphone access was refused, so live conversation stopped.");
        return;
      }
      // Silence ("no-speech") and our own abort() are ordinary pauses in a
      // hands-free conversation, not failures — just listen again.
      if (activeRef.current && !pausedRef.current) listenHere();
      else if (!activeRef.current) setState("idle");
    };
    recognition.onend = () => {
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    setState("listening");
    try {
      recognition.start();
    } catch {
      if (activeRef.current) listenHere();
    }

    async function handle(transcript: string, confidence: number): Promise<void> {
      setState("thinking");
      let reply = "";
      try {
        reply = await onUtteranceRef.current(transcript, confidence);
      } catch {
        reply = "";
      }
      if (!activeRef.current) return;
      await speakHere(reply);
      if (activeRef.current && !pausedRef.current) listenHere();
      else if (!activeRef.current) setState("idle");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, speakHere, halt]);

  /** Runs the provider loop until it is paused, stopped or fails. */
  const launchProvider = useCallback(() => {
      abortRef.current = new AbortController();

      void runWithProvider()
        .catch((thrown: unknown) => {
          const message = thrown instanceof Error ? thrown.message : "Live conversation stopped.";
          // A refused microphone reads as a permission problem however the
          // browser words it, and is worth naming as one.
          const denied = /permission|denied|notallowed/i.test(message);
          halt(denied ? "denied" : "idle", message);
        })
        .then(() => {
          if (!activeRef.current) setState((current) => (current === "denied" || current === "unsupported" ? current : "idle"));
        });
  }, [halt, runWithProvider]);

  const start = useCallback(() => {
    if (typeof window === "undefined") return;
    pausedRef.current = false;
    setPaused(false);

    if (householdId) {
      if (!microphoneAvailable()) {
        halt("unsupported", "This browser cannot record audio, so live conversation is not available.");
        return;
      }

      activeRef.current = true;
      setActive(true);
      launchProvider();
      return;
    }

    if (!recognitionConstructor() || !("speechSynthesis" in window)) {
      setState("unsupported");
      return;
    }
    activeRef.current = true;
    setActive(true);
    listenHere();
  }, [householdId, halt, launchProvider, listenHere]);

  /**
   * Stops taking turns without ending the session.
   *
   * The microphone closes and anything mid-sentence is cut off, because
   * "pause" has to actually stop listening to mean anything — but the
   * session stays open, so resuming continues the same conversation and
   * the recap at the end still covers all of it.
   */
  const pause = useCallback(() => {
    if (!activeRef.current) return;
    pausedRef.current = true;
    setPaused(true);
    abortRef.current?.abort();
    abortRef.current = null;
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setState("idle");
  }, []);

  const resume = useCallback(() => {
    if (!activeRef.current || !pausedRef.current) return;
    pausedRef.current = false;
    setPaused(false);
    if (householdId) launchProvider();
    else listenHere();
  }, [householdId, launchProvider, listenHere]);

  const stop = useCallback(() => {
    activeRef.current = false;
    pausedRef.current = false;
    setActive(false);
    setPaused(false);
    abortRef.current?.abort();
    abortRef.current = null;
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setState("idle");
  }, []);

  useEffect(
    () => () => {
      activeRef.current = false;
      abortRef.current?.abort();
      recognitionRef.current?.abort();
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    },
    [],
  );

  return { state, active, paused, start, pause, resume, stop };
}
