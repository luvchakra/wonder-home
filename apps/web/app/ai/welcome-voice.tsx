"use client";

import { Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { speakable } from "@wonderhome/core/conversation/speech";
import { pickVoice } from "@wonderhome/core/ui/use-live-voice";

/**
 * Says HomeTalk's welcome out loud as the page opens (task: the
 * conversation after setup). A browser that will not play sound before the
 * person has touched the page gets one button instead, "Hear the welcome" —
 * the words are on screen either way, so nothing depends on the sound.
 * Speech goes through the household's voice provider when it has one,
 * otherwise the browser's own voice, and always through `speakable`.
 */
export function WelcomeVoice({ householdId, texts, serverVoice, language, label }: { householdId: string; texts: string[]; serverVoice: boolean; language: string; label: string }) {
  const [blocked, setBlocked] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const started = useRef(false);

  const speakAll = useCallback(async (): Promise<boolean> => {
    const words = texts.map(speakable).filter(Boolean).join(" ");
    if (!words) return true;
    setSpeaking(true);
    try {
      if (serverVoice) {
        const response = await fetch(`/api/v1/households/${householdId}/voice`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ speak: words }),
        });
        const payload = await response.json().catch(() => null);
        if (response.ok && payload?.audio) {
          const audio = new Audio(`data:${payload.mimeType};base64,${payload.audio}`);
          await audio.play();
          await new Promise<void>((resolve) => {
            audio.onended = () => resolve();
            audio.onerror = () => resolve();
          });
          return true;
        }
      }
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return true;
      return await new Promise<boolean>((resolve) => {
        const utterance = new SpeechSynthesisUtterance(words);
        const voice = pickVoice(window.speechSynthesis.getVoices(), language);
        if (voice) utterance.voice = voice;
        utterance.lang = language;
        utterance.onend = () => resolve(true);
        // "not-allowed" is the browser asking for a tap first.
        utterance.onerror = (event) => resolve(event.error !== "not-allowed");
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      });
    } catch {
      // A play() refused before any tap.
      return false;
    } finally {
      setSpeaking(false);
    }
  }, [householdId, language, serverVoice, texts]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void speakAll().then((spoke) => {
      if (!spoke) setBlocked(true);
    });
  }, [speakAll]);

  if (!blocked) return null;
  return (
    <div className="flex justify-center px-4 pt-3">
      <button
        type="button"
        disabled={speaking}
        onClick={() => {
          setBlocked(false);
          void speakAll();
        }}
        className="inline-flex min-h-10 items-center gap-2 rounded-[var(--wh-radius-pill)] bg-[var(--wh-primary-soft)] px-4 text-sm font-semibold text-[var(--wh-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]"
      >
        <Volume2 aria-hidden className="size-4" /> {label}
      </button>
    </div>
  );
}
