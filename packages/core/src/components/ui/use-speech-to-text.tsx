"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { captureUtterance, microphoneAvailable } from "../../voice/capture";
import { recognitionConstructor, type RecognitionLike } from "../../voice/recognition";

/**
 * Speaking instead of typing — and nothing more than that.
 *
 * This is deliberately not `useLiveVoice`. Tapping the microphone means
 * "put what I say in the box so I can check it", which ends at a transcript
 * the person can edit and send. A hands-free conversation is a different
 * act with a different control, and the two never turn into each other:
 * that is what made the old single-microphone design confusing, because
 * one tap could not tell the two intents apart.
 *
 * Two ways to hear, same shape either way. With a speech provider
 * configured the audio goes through our own server (better recognition,
 * every browser, the household's own language and phrase hints); without
 * one the browser's `SpeechRecognition` does it for free. `available` says
 * whether either is possible, so the caller never offers a microphone that
 * cannot listen.
 */

export type SpeechToTextState = "idle" | "listening" | "transcribing" | "denied" | "unsupported";

export function useSpeechToText(input: {
  lang?: string;
  /** The household whose configured provider should transcribe, if it has one. */
  server?: { householdId: string } | null;
  /** What was heard, once. The caller decides what to do with it — here, fills the field. */
  onTranscript: (transcript: string, confidence: number) => void;
  /** A problem worth telling somebody about. Cancelling is not one. */
  onError?: (message: string) => void;
}): {
  state: SpeechToTextState;
  available: boolean;
  start: () => void;
  /** Stop listening and transcribe what was said so far. */
  stop: () => void;
  /** Drop the whole attempt — nothing is transcribed and nothing is sent. */
  cancel: () => void;
} {
  const { lang = "en-IN", server = null, onTranscript, onError } = input;
  const [state, setState] = useState<SpeechToTextState>("idle");
  const [available, setAvailable] = useState(true);
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const householdId = server?.householdId ?? null;

  useEffect(() => {
    // Whether anything here can work at all, decided once on the client so
    // the button is never rendered live on a browser that cannot listen.
    setAvailable(householdId ? microphoneAvailable() : recognitionConstructor() !== null);
  }, [householdId]);

  const finish = useCallback((transcript: string, confidence: number) => {
    setState("idle");
    const text = transcript.trim();
    if (text) onTranscriptRef.current(text, confidence);
  }, []);

  const startWithProvider = useCallback(async () => {
    cancelledRef.current = false;
    abortRef.current = new AbortController();
    setState("listening");

    try {
      const heard = await captureUtterance({ signal: abortRef.current.signal });
      if (cancelledRef.current) {
        setState("idle");
        return;
      }
      // Silence. Nothing to transcribe, nothing to say about it — the
      // person simply did not speak, and telling them so is noise.
      if (!heard) {
        setState("idle");
        return;
      }

      setState("transcribing");
      const response = await fetch(`/api/v1/households/${householdId}/voice`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ audio: heard.clip.base64, mimeType: heard.clip.mimeType }),
      });
      const payload = await response.json();
      if (cancelledRef.current) {
        setState("idle");
        return;
      }
      if (!response.ok) throw new Error(payload?.error?.message ?? "That could not be transcribed.");

      finish(String(payload.transcript ?? ""), Number(payload.confidence) || 0.5);
    } catch (thrown) {
      if (cancelledRef.current) {
        setState("idle");
        return;
      }
      const message = thrown instanceof Error ? thrown.message : "That could not be transcribed.";
      const denied = /permission|denied|notallowed/i.test(message);
      setState(denied ? "denied" : "idle");
      onErrorRef.current?.(denied ? "Microphone access was refused." : message);
    }
  }, [householdId, finish]);

  const startInBrowser = useCallback(() => {
    const Recognition = recognitionConstructor();
    if (!Recognition) {
      setState("unsupported");
      onErrorRef.current?.("This browser cannot listen, so speaking is not available here.");
      return;
    }

    cancelledRef.current = false;
    const recognition = new Recognition();
    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const best = event.results[0]?.[0];
      if (cancelledRef.current) return;
      // The recogniser has stopped hearing and is settling on words. It is
      // brief, but it is a real step and the composer shows it as one.
      setState("transcribing");
      finish(best?.transcript ?? "", Number.isFinite(best?.confidence) ? (best?.confidence ?? 0.5) : 0.5);
    };
    recognition.onerror = (event) => {
      recognitionRef.current = null;
      if (cancelledRef.current) {
        setState("idle");
        return;
      }
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setState("denied");
        onErrorRef.current?.("Microphone access was refused.");
        return;
      }
      // "no-speech" is somebody thinking better of it, not a failure.
      setState("idle");
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setState((current) => (current === "listening" ? "idle" : current));
    };

    recognitionRef.current = recognition;
    setState("listening");
    try {
      recognition.start();
    } catch {
      setState("idle");
    }
  }, [lang, finish]);

  const start = useCallback(() => {
    if (householdId) void startWithProvider();
    else startInBrowser();
  }, [householdId, startWithProvider, startInBrowser]);

  const stop = useCallback(() => {
    // Ends the recording; whatever was said still gets transcribed, which
    // is the difference between this and `cancel`.
    abortRef.current?.abort();
    recognitionRef.current?.stop();
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    abortRef.current?.abort();
    abortRef.current = null;
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    setState("idle");
  }, []);

  useEffect(
    () => () => {
      cancelledRef.current = true;
      abortRef.current?.abort();
      recognitionRef.current?.abort();
    },
    [],
  );

  return { state, available, start, stop, cancel };
}
