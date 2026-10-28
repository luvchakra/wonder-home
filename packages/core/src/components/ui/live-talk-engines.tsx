"use client";

import { useEffect } from "react";

import { useGeminiLive } from "./use-gemini-live";
import { useLiveVoice } from "./use-live-voice";

/** What the provider needs from either engine: its state and its buttons. */
export type LiveEngine = {
  state: "idle" | "connecting" | "listening" | "thinking" | "speaking" | "denied" | "unsupported";
  active: boolean;
  paused: boolean;
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
};

export type LiveEngines = {
  own: LiveEngine;
  gemini: LiveEngine & { voiceStream: () => MediaStream | null; releaseVoice: () => void };
};

/**
 * Both live engines — WonderHome's own listen/speak loop and Gemini Live —
 * in a module of their own, so their code loads only once a screen that can
 * start a conversation asks for them (performance audit B2), not on every
 * page. Renders nothing; hands the engines back to `LiveTalkProvider` after
 * every render, and stays mounted for as long as the app is open so a
 * conversation outlives the screen it started on.
 */
export default function LiveTalkEngines({
  lang,
  server,
  householdId,
  onUtterance,
  onTranscript,
  onTranscriptRevised,
  onError,
  onNavigate,
  onChanged,
  onEngines,
}: {
  lang: string;
  server: { householdId: string } | null;
  householdId: string;
  onUtterance: (transcript: string, confidence: number) => Promise<string>;
  onTranscript: (entry: { role: "member" | "assistant"; text: string; id?: string }) => void;
  onTranscriptRevised: (entry: { id: string; text: string }) => void;
  onError: (message: string) => void;
  onNavigate: (href: string) => void;
  onChanged: () => void;
  onEngines: (engines: LiveEngines) => void;
}) {
  const own = useLiveVoice({ lang, server, onUtterance, onError });
  const gemini = useGeminiLive({ householdId, onTranscript, onTranscriptRevised, onError, onNavigate, onChanged });
  useEffect(() => {
    onEngines({ own, gemini });
  });
  return null;
}
