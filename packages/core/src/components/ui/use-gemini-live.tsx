"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { base64ToBytes, bytesToBase64, downsample, floatToPcm16, LIVE_INPUT_RATE, LIVE_OUTPUT_RATE, pcm16ToFloat } from "../../voice/pcm";
import { LiveTranscript, readLiveMessage, type LiveToolCall } from "../../voicelink/live-messages";

/**
 * Live conversation through Gemini Live (voice integration phase 3): the
 * same on/pause/off control as `useLiveVoice`, with Google's real-time voice
 * doing the listening and speaking.
 *
 * Gemini is a voice here and nothing more. The page asks WonderHome for a
 * short-lived token locked to WonderHome's instructions and tools, opens the
 * Live session with it, streams the microphone, and plays what comes back.
 * Every tool call Gemini makes is relayed to WonderHome's own tool route —
 * the member's session, HomeTalk's gates, HomeTalk's executors — and
 * whatever that decides is what Gemini is handed to say. The page never
 * decides anything and holds no key.
 *
 * Talking over a reply stops it (Gemini's own interruption signal); a tool
 * call Gemini cancels because of that is left alone on the server, so a
 * change WonderHome already made stays made. Nothing is recorded: audio
 * goes to Google and is played, never stored.
 */

export type GeminiLiveState = "idle" | "connecting" | "listening" | "thinking" | "speaking";

type LiveSession = {
  sendRealtimeInput: (input: { audio: { data: string; mimeType: string } }) => void;
  sendToolResponse: (input: { functionResponses: { id: string; name: string; response: Record<string, unknown> }[] }) => void;
  close: () => void;
};

/** How long opening the Live socket may take before the attempt is abandoned. */
const LIVE_CONNECT_TIMEOUT_MS = 15_000;

const FAILED_TOOL = { success: false, status: "failed", userMessage: "I couldn't do that right now. Nothing was changed." };

export function useGeminiLive(input: {
  householdId: string;
  /** What was said on each side, once per utterance, for the on-screen record. */
  onTranscript?: (entry: { role: "member" | "assistant"; text: string }) => void;
  /** A problem worth telling the person (no microphone, no session, the session ended) — never thrown. */
  onError?: (message: string) => void;
}): {
  state: GeminiLiveState;
  active: boolean;
  paused: boolean;
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
} {
  const { householdId, onTranscript, onError } = input;
  const [state, setState] = useState<GeminiLiveState>("idle");
  const [active, setActive] = useState(false);
  const [paused, setPaused] = useState(false);

  const callbacks = useRef({ onTranscript, onError });
  callbacks.current = { onTranscript, onError };

  const sessionRef = useRef<LiveSession | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const playingRef = useRef(new Set<AudioBufferSourceNode>());
  const playAtRef = useRef(0);
  const sendingRef = useRef(false);
  /** Set by stop(), so a close we asked for is not reported as a failure. */
  const closingRef = useRef(false);
  const pendingToolsRef = useRef(0);
  const transcriptRef = useRef<LiveTranscript | null>(null);
  /** Which start() is current. Teardown moves it on, so a slower, older attempt that settles later is closed, not adopted. */
  const attemptRef = useRef(0);

  const settle = useCallback(() => {
    if (pendingToolsRef.current > 0) setState("thinking");
    else if (playingRef.current.size > 0) setState("speaking");
    else setState("listening");
  }, []);

  const silence = useCallback(() => {
    for (const source of playingRef.current) {
      try {
        source.stop();
      } catch {
        // Already finished.
      }
    }
    playingRef.current.clear();
    playAtRef.current = 0;
  }, []);

  const teardown = useCallback(() => {
    attemptRef.current += 1;
    sendingRef.current = false;
    silence();
    transcriptRef.current?.finish();
    transcriptRef.current = null;
    try {
      sessionRef.current?.close();
    } catch {
      // Already closed.
    }
    sessionRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void inputContextRef.current?.close().catch(() => undefined);
    void outputContextRef.current?.close().catch(() => undefined);
    inputContextRef.current = null;
    outputContextRef.current = null;
    pendingToolsRef.current = 0;
    setActive(false);
    setPaused(false);
    setState("idle");
  }, [silence]);

  const play = useCallback(
    (base64: string) => {
      const context = outputContextRef.current;
      if (!context) return;
      const samples = pcm16ToFloat(base64ToBytes(base64));
      if (samples.length === 0) return;
      const buffer = context.createBuffer(1, samples.length, LIVE_OUTPUT_RATE);
      buffer.copyToChannel(samples, 0);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      const at = Math.max(context.currentTime, playAtRef.current);
      source.start(at);
      playAtRef.current = at + buffer.duration;
      playingRef.current.add(source);
      source.onended = () => {
        playingRef.current.delete(source);
        if (sessionRef.current) settle();
      };
      setState("speaking");
    },
    [settle],
  );

  const answerTools = useCallback(
    async (calls: LiveToolCall[], sessionId: string) => {
      pendingToolsRef.current += calls.length;
      setState("thinking");
      const functionResponses = await Promise.all(
        calls.map(async (call) => {
          let response: Record<string, unknown> = FAILED_TOOL;
          try {
            const reply = await fetch(`/api/v1/households/${householdId}/voice/gemini/tool`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ sessionId, callId: call.id, name: call.name, args: call.args }),
            });
            const payload = await reply.json().catch(() => null);
            if (reply.ok && payload && typeof payload.userMessage === "string") response = payload;
            else if (payload?.error?.message) response = { ...FAILED_TOOL, userMessage: `${payload.error.message} Nothing was changed.` };
          } catch {
            // The failure answer above: Gemini says nothing changed, never "done".
          }
          return { id: call.id, name: call.name, response };
        }),
      );
      pendingToolsRef.current = Math.max(0, pendingToolsRef.current - calls.length);
      try {
        sessionRef.current?.sendToolResponse({ functionResponses });
      } catch {
        // The session closed while WonderHome was answering; onclose says so.
      }
      if (sessionRef.current) settle();
    },
    [householdId, settle],
  );

  const start = useCallback(async () => {
    if (sessionRef.current || state === "connecting") return;
    if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === "undefined") {
      callbacks.current.onError?.("This browser cannot hold a live conversation. You can still type or use the microphone.");
      return;
    }
    closingRef.current = false;
    const attempt = ++attemptRef.current;
    const stale = () => attempt !== attemptRef.current;
    setActive(true);
    setPaused(false);
    setState("connecting");

    try {
      // The microphone first: asking for a token nobody can use is waste.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (stale()) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;

      const opened = await fetch(`/api/v1/households/${householdId}/voice/gemini/session`, { method: "POST" });
      const minted = await opened.json().catch(() => null);
      if (!opened.ok || !minted?.token) throw new Error(minted?.error?.message ?? "Gemini voice could not start just now.");
      if (stale()) return;

      const inputContext = new AudioContext();
      const outputContext = new AudioContext({ sampleRate: LIVE_OUTPUT_RATE });
      inputContextRef.current = inputContext;
      outputContextRef.current = outputContext;
      transcriptRef.current = new LiveTranscript((entry) => callbacks.current.onTranscript?.(entry));

      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey: minted.token as string, httpOptions: { apiVersion: "v1alpha" } });
      const sessionId = minted.sessionId as string;
      // A socket that fails before it opens may never settle the connect
      // call, so this attempt ends on the first error, close or timeout —
      // whichever comes first — and a connect that settles afterwards is
      // closed rather than adopted. Never a composer left "thinking".
      let ended = false;
      const fail = (message: string) => {
        if (ended) return;
        ended = true;
        if (!closingRef.current) callbacks.current.onError?.(message);
        closingRef.current = true;
        teardown();
      };
      const connecting = ai.live.connect({
        model: minted.model as string,
        // Everything is locked into the token on the server; the page adds nothing.
        config: {},
        callbacks: {
          onmessage: (message: unknown) => {
            const reading = readLiveMessage(message);
            transcriptRef.current?.read(reading);
            if (reading.interrupted) {
              silence();
              settle();
            }
            for (const clip of reading.audio) play(clip);
            if (reading.toolCalls.length > 0) void answerTools(reading.toolCalls, sessionId);
            if (reading.goingAway) callbacks.current.onError?.("Gemini is ending this voice session. Start it again to keep talking.");
          },
          onerror: () => fail("The voice session had a problem. Nothing was changed by it."),
          onclose: () => fail(sessionRef.current ? "The voice session ended. Start it again to keep talking." : "Gemini voice could not connect just now. Nothing was changed."),
        },
      });
      const session = (await Promise.race([
        connecting,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Gemini voice did not answer in time. Nothing was changed.")), LIVE_CONNECT_TIMEOUT_MS)),
      ])) as unknown as LiveSession;
      if (ended || stale()) {
        try {
          session.close();
        } catch {
          // Already closed.
        }
        return;
      }
      sessionRef.current = session;

      // The microphone, at whatever rate the device records, down to the
      // 16 kHz the Live API takes. A ScriptProcessor rather than a worklet:
      // no module to load, and the same behaviour in every engine.
      const source = inputContext.createMediaStreamSource(stream);
      const processor = inputContext.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (event) => {
        if (!sendingRef.current || !sessionRef.current) return;
        const pcm = floatToPcm16(downsample(event.inputBuffer.getChannelData(0), inputContext.sampleRate, LIVE_INPUT_RATE));
        try {
          sessionRef.current.sendRealtimeInput({ audio: { data: bytesToBase64(pcm), mimeType: `audio/pcm;rate=${LIVE_INPUT_RATE}` } });
        } catch {
          // Closing: onclose tidies up.
        }
      };
      source.connect(processor);
      // Connected so the engine runs it; it writes nothing, so nothing is heard.
      processor.connect(inputContext.destination);
      sendingRef.current = true;
      setState("listening");
    } catch (caught) {
      const denied = caught instanceof DOMException && (caught.name === "NotAllowedError" || caught.name === "SecurityError");
      // An attempt that already ended (and said why), or was stopped, needs nothing more.
      if (stale()) return;
      closingRef.current = true;
      teardown();
      callbacks.current.onError?.(
        denied ? "WonderHome needs the microphone for a live conversation. Allow it in the browser's settings and try again." : caught instanceof Error ? caught.message : "Gemini voice could not start just now.",
      );
    }
  }, [answerTools, householdId, play, settle, silence, state, teardown]);

  const pause = useCallback(() => {
    if (!sessionRef.current) return;
    sendingRef.current = false;
    silence();
    setPaused(true);
  }, [silence]);

  const resume = useCallback(() => {
    if (!sessionRef.current) return;
    sendingRef.current = true;
    setPaused(false);
    settle();
  }, [settle]);

  const stop = useCallback(() => {
    closingRef.current = true;
    teardown();
  }, [teardown]);

  useEffect(
    () => () => {
      closingRef.current = true;
      teardown();
    },
    [teardown],
  );

  return { state, active, paused, start: () => void start(), pause, resume, stop };
}
