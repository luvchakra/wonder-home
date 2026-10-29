"use client";

import { LoaderCircle, Maximize2, Mic, Pause, PictureInPicture2, Play, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { plainText } from "../../conversation/reply-format";
import { cn } from "../../lib/cn";
import { setTalkActivity } from "../shell/talk-activity";
import { FRAME_HEIGHT, FRAME_RATE, FRAME_WIDTH, drawLiveFrame, floatSupport, liveFrame, readFloatEnvironment, readPalette, shouldArmFloat, type FloatMode, type FloatPalette } from "./live-float";
import type { LiveEngines } from "./live-talk-engines";
import { appPath } from "../../navigation/app-path";

/**
 * A live HomeTalk conversation that goes where the person goes.
 *
 * The owner, 2026-10-18: talk to HomeTalk, say "take me to the grocery list",
 * add or remove things there, move on to the calendar or Home, and come back
 * to HomeTalk — all one conversation, with HomeTalk's glow showing it is
 * still listening on every screen.
 *
 * So the conversation lives here, mounted once at the root of the app, not
 * in the HomeTalk page: changing screens no longer ends it. Both engines run
 * from here — WonderHome's own listen/speak loop and Gemini Live.
 *
 * While the HomeTalk page is open, its composer configures the session and
 * hands every turn to the page (`register`), so the conversation shows on
 * screen exactly as before. Anywhere else, a turn goes to the same HomeTalk
 * endpoint from here, and its reply is spoken. A reply that asks to open a
 * screen (`navigate`) is followed, wherever the person is.
 *
 * And it goes beyond the app (story 04-020): `float` asks the phone to show
 * the conversation as a small picture-in-picture window over whatever else
 * the person opens, still listening and still speaking from here. The
 * window is a painted view of this same session (`live-float.ts`), never a
 * second one.
 */

export type LiveEngineName = "wonderhome" | "gemini_live";

export type LiveTalkLabels = {
  /** Gemini Live is still opening its session: do not speak yet. */
  connecting: string;
  listening: string;
  thinking: string;
  speaking: string;
  paused: string;
  pause: string;
  resume: string;
  end: string;
  open: string;
  /** Float the conversation as a small window over other apps; `unfloat` brings it back (04-020). */
  float: string;
  unfloat: string;
  /** The phone would not open the window; the conversation is still here. */
  floatFailed: string;
  /** The window's label over what the person said. */
  you: string;
};

export type LiveTalkConfig = {
  householdId: string;
  lang: string;
  serverVoice: boolean;
  labels: LiveTalkLabels;
};

export type LiveTurnHandler = {
  onUtterance: (transcript: string, confidence: number) => Promise<string>;
  onTranscript?: (entry: { role: "member" | "assistant"; text: string; id?: string }) => void;
  /** A line already shown, written down properly afterwards (Gemini Live): replace the one with this id. */
  onTranscriptRevised?: (entry: { id: string; text: string }) => void;
};

type LiveView = {
  state: "idle" | "connecting" | "listening" | "thinking" | "speaking" | "denied" | "unsupported";
  active: boolean;
  paused: boolean;
};

export type LiveTalk = {
  configure: (config: LiveTalkConfig) => void;
  /** The page's own turn handler while it is open; returns the call that hands turns back. */
  register: (handler: LiveTurnHandler) => () => void;
  /** Whichever engine is running, or the one asked about when none is. */
  view: (engine: LiveEngineName) => LiveView;
  running: LiveEngineName | null;
  start: (engine: LiveEngineName) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  /** Notes the first message of this live session, for its recap at the end; later ones are ignored. */
  markStart: (messageId: string) => void;
  /** Hands over that first message, once, when the session's recap is written. */
  takeStart: () => string | null;
  /** Follow a reply's `navigate`, on any screen. */
  navigate: (href: string) => void;
  /** Whether this browser can float the conversation over other apps at all; false means no Float button (rule 10). */
  floatable: boolean;
  /** The conversation is showing in the phone's floating window now. */
  floating: boolean;
  /** Open the floating window — only ever from a tap, which the browser requires. */
  float: () => void;
  /** Close it; the conversation carries on here. */
  unfloat: () => void;
  /** The latest thing worth a line on screen — a refused microphone, a window that would not open — or null. */
  notice: string | null;
};

const LiveTalkContext = createContext<LiveTalk | null>(null);

/** The engines' code, fetched the first time a screen that can talk configures the conversation (audit B2). */
const LiveTalkEngines = lazy(() => import("./live-talk-engines"));

type EngineViews = { own: LiveView; gemini: LiveView };
const IDLE: LiveView = { state: "idle", active: false, paused: false };
const engineKey = (name: LiveEngineName) => (name === "gemini_live" ? "gemini" : "own");
const sameView = (a: LiveView, b: LiveView) => a.state === b.state && a.active === b.active && a.paused === b.paused;

/** Only same-app paths are ever followed: a reply cannot send anyone off the app. */
export function safeHref(href: unknown): string | null {
  return appPath(href);
}

type LiveReply = { text?: string; navigate?: string; action?: { status?: string } | null };

/** The HomeTalk endpoint, from anywhere: one live turn, its reply as words to say, and where it asks to go. */
async function liveTurnHere(
  householdId: string,
  utterance: string,
  confidence: number,
): Promise<{ text: string; navigate: string | null; changed: boolean; memberMessageId: string | null }> {
  const response = await fetch(`/api/v1/households/${householdId}/conversation`, {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": `live-${Date.now()}-${Math.random().toString(36).slice(2)}` },
    body: JSON.stringify({ utterance, channel: "voice", transcriptConfidence: confidence }),
  });
  const payload = (await response.json().catch(() => null)) as {
    memberMessageId?: string;
    reply?: LiveReply;
    replies?: LiveReply[];
    error?: { message?: string };
  } | null;
  if (!response.ok || !payload) return { text: payload?.error?.message ?? "", navigate: null, changed: false, memberMessageId: null };
  const replies = Array.isArray(payload.replies) && payload.replies.length > 0 ? payload.replies : payload.reply ? [payload.reply] : [];
  const navigate = replies.map((reply) => safeHref(reply.navigate)).find(Boolean) ?? null;
  return {
    text: replies.map((reply) => reply.text ?? "").filter(Boolean).join("\n\n"),
    navigate,
    changed: replies.some((reply) => reply.action?.status === "executed"),
    memberMessageId: typeof payload.memberMessageId === "string" ? payload.memberMessageId : null,
  };
}

/** The recap of a live session that ended away from HomeTalk's page, so it is there on the way back. */
function postRecap(householdId: string, since: string) {
  void fetch(`/api/v1/households/${householdId}/conversation`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ summarizeSince: since }),
  }).catch(() => undefined);
}

/** Safari's own picture-in-picture, the only kind an iPhone has. */
type WebkitVideo = HTMLVideoElement & {
  webkitSupportsPresentationMode?: (mode: string) => boolean;
  webkitSetPresentationMode?: (mode: string) => void;
  webkitPresentationMode?: string;
};

/** The floating window's elements while it is open: the painted canvas, the video the phone floats, and the repaint timer. */
type FloatSession = {
  mode: FloatMode;
  canvas: HTMLCanvasElement;
  video: HTMLVideoElement;
  timer: number;
  startedAt: number;
  /** Whether Gemini's voice is playing through this video (story 04-024). */
  voice?: boolean;
};

/** The media-session actions a phone's lock screen or floating window can press. */
const MEDIA_ACTIONS: MediaSessionAction[] = ["play", "pause", "stop"];

export function LiveTalkProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [config, setConfig] = useState<LiveTalkConfig | null>(null);
  const configRef = useRef<LiveTalkConfig | null>(null);
  const handlerRef = useRef<LiveTurnHandler | null>(null);
  const [running, setRunning] = useState<LiveEngineName | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const startMessageId = useRef<string | null>(null);

  // The floating window (04-020) and what it paints: the live view and the
  // last exchange, kept in refs because the repaint timer reads them.
  const [floatable, setFloatable] = useState(false);
  const [floating, setFloating] = useState(false);
  const floatRef = useRef<FloatSession | null>(null);
  /** Gemini's voice, for the floating video to carry; filled in once the engines exist (below). */
  const voiceRef = useRef<{ take: () => MediaStream | null; release: () => void }>({ take: () => null, release: () => undefined });
  const paletteRef = useRef<FloatPalette | null>(null);
  const viewRef = useRef<LiveView>({ state: "idle", active: false, paused: false });
  const exchangeRef = useRef<{ heard: string | null; said: string | null }>({ heard: null, said: null });

  useEffect(() => {
    setFloatable(floatSupport(readFloatEnvironment(window)) !== null);
  }, []);

  const paint = useCallback(() => {
    const session = floatRef.current;
    const labels = configRef.current?.labels;
    if (!session || !labels) return;
    const ctx = session.canvas.getContext("2d");
    if (!ctx) return;
    const palette = paletteRef.current ?? readPalette((token) => getComputedStyle(document.documentElement).getPropertyValue(token));
    paletteRef.current = palette;
    const phase = ((performance.now() - session.startedAt) % 2400) / 2400;
    drawLiveFrame(ctx, liveFrame(viewRef.current, exchangeRef.current, labels), palette, phase);
  }, []);

  /**
   * Lets the floating video go entirely — the conversation ended. Closing the
   * window alone (`unfloat`) keeps it ready, so leaving the app floats again.
   */
  const disarmFloat = useCallback(() => {
    const session = floatRef.current;
    if (!session) return;
    floatRef.current = null;
    // The voice goes back to the speaker before the video that carried it goes.
    voiceRef.current.release();
    window.clearInterval(session.timer);
    try {
      if (document.pictureInPictureElement === session.video) void document.exitPictureInPicture().catch(() => undefined);
      else if (session.mode === "webkit" && (session.video as WebkitVideo).webkitPresentationMode === "picture-in-picture") {
        (session.video as WebkitVideo).webkitSetPresentationMode?.("inline");
      }
    } catch {
      // Already closed.
    }
    const stream = session.video.srcObject;
    if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop());
    session.video.srcObject = null;
    session.video.remove();
    setFloating(false);
  }, []);

  /** Closes the floating window; the video stays ready for the next time the person leaves. */
  const closeFloat = useCallback(() => {
    const session = floatRef.current;
    if (!session) return;
    try {
      if (document.pictureInPictureElement === session.video) void document.exitPictureInPicture().catch(() => undefined);
      else if (session.mode === "webkit" && (session.video as WebkitVideo).webkitPresentationMode === "picture-in-picture") {
        (session.video as WebkitVideo).webkitSetPresentationMode?.("inline");
      }
    } catch {
      // Already closed.
    }
    setFloating(false);
  }, []);

  /**
   * Gets the floating video ready and playing, hidden in the page, while a
   * live conversation runs (story 04-022). A browser floats a window on its
   * own only for a video that is already playing: Safari's
   * `autopictureinpicture` when the person goes home, Chrome's
   * `enterpictureinpicture` media-session action when they leave a page
   * using the microphone. So the video has to exist before they leave, not
   * after. Muted, so it may play without a tap; painted at once, so the
   * window never opens blank.
   */
  const armFloat = useCallback(async (): Promise<FloatSession | null> => {
    if (floatRef.current) return floatRef.current;
    if (typeof window === "undefined") return null;
    const mode = floatSupport(readFloatEnvironment(window));
    if (!mode) return null;
    const canvas = document.createElement("canvas");
    canvas.width = FRAME_WIDTH;
    canvas.height = FRAME_HEIGHT;
    const video = document.createElement("video") as WebkitVideo & { autoPictureInPicture?: boolean };
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("aria-hidden", "true");
    // Safari floats a playing video marked this way when the person leaves.
    video.setAttribute("autopictureinpicture", "");
    video.autoPictureInPicture = true;
    // Kept in the page (a detached video is never floated) but out of the way of it.
    video.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none";
    document.body.appendChild(video);
    const session: FloatSession = { mode, canvas, video, timer: 0, startedAt: performance.now() };
    floatRef.current = session;
    paletteRef.current = null;
    paint();
    // Whichever way the window opens or closes (a tap, the browser on leaving, its own close button), the state follows.
    video.addEventListener("enterpictureinpicture", () => setFloating(true));
    video.addEventListener("leavepictureinpicture", () => setFloating(false));
    video.addEventListener("webkitpresentationmodechanged", () => setFloating(video.webkitPresentationMode === "picture-in-picture"));
    try {
      video.srcObject = canvas.captureStream(FRAME_RATE);
      await video.play();
    } catch {
      if (floatRef.current === session) disarmFloat();
      return null;
    }
    if (floatRef.current !== session) return null;
    session.timer = window.setInterval(paint, 1000 / FRAME_RATE);
    return session;
  }, [disarmFloat, paint]);

  /**
   * Gemini's voice into the ready floating video (story 04-024), as soon as
   * there is a voice to carry: a browser floats on its own only media that
   * is audibly playing, and a silent picture is not. Where sound may not
   * play here, the picture stays muted and the voice goes back to the
   * speaker, exactly as before — the person hears it either way, once.
   */
  const attachVoice = useCallback(async () => {
    const session = floatRef.current;
    if (!session || session.voice || !(session.video.srcObject instanceof MediaStream)) return;
    const tracks = voiceRef.current.take()?.getAudioTracks() ?? [];
    if (tracks.length === 0) return;
    const stream = session.video.srcObject;
    for (const track of tracks) stream.addTrack(track);
    session.video.muted = false;
    session.voice = true;
    try {
      await session.video.play();
    } catch {
      for (const track of tracks) stream.removeTrack(track);
      session.video.muted = true;
      session.voice = false;
      voiceRef.current.release();
      void session.video.play().catch(() => undefined);
    }
  }, []);

  /**
   * Opens the floating window. From a tap it always may; from leaving the app
   * (`quiet`) the browser may refuse, and then nothing is said: the person
   * can still tap Float when they come back.
   */
  const floatNow = useCallback(
    async (quiet = false) => {
      const session = await armFloat();
      if (!session) {
        if (!quiet) setNotice(configRef.current?.labels.floatFailed ?? null);
        return;
      }
      if (document.pictureInPictureElement === session.video) return;
      try {
        if (session.mode === "standard") {
          await session.video.requestPictureInPicture();
        } else {
          const webkit = session.video as WebkitVideo;
          if (webkit.webkitSupportsPresentationMode?.("picture-in-picture") === false) throw new Error("not supported");
          webkit.webkitSetPresentationMode?.("picture-in-picture");
        }
        setFloating(true);
        setNotice(null);
      } catch {
        if (!quiet) setNotice(configRef.current?.labels.floatFailed ?? null);
      }
    },
    [armFloat],
  );

  const navigate = useCallback(
    (href: string) => {
      const safe = safeHref(href);
      if (!safe) return;
      // Already there ("add tomato" said on Groceries): show the change in place.
      if (`${window.location.pathname}${window.location.search}` === safe) router.refresh();
      else {
        // A turn that sends someone somewhere has usually just changed something: drop
        // every screen this tab kept (next.config staleTimes) before going.
        router.refresh();
        router.push(safe);
      }
    },
    [router],
  );

  const onUtterance = useCallback(
    async (transcript: string, confidence: number): Promise<string> => {
      exchangeRef.current = { heard: transcript, said: null };
      paint();
      const said = (text: string) => {
        exchangeRef.current = { heard: transcript, said: text || null };
        paint();
        return text;
      };
      const handler = handlerRef.current;
      if (handler) return said(await handler.onUtterance(transcript, confidence));
      const current = configRef.current;
      if (!current) return "";
      try {
        const { text, navigate: href, changed, memberMessageId } = await liveTurnHere(current.householdId, transcript, confidence);
        if (memberMessageId && !startMessageId.current) startMessageId.current = memberMessageId;
        // Somewhere to go, or a change to show where the person already is.
        if (href) navigate(href);
        else if (changed) router.refresh();
        return said(text ? plainText(text) : "");
      } catch {
        return said("");
      }
    },
    [navigate, paint, router],
  );

  // Gemini Live speaks for itself; its transcript is what the window shows.
  const onTranscript = useCallback(
    (entry: { role: "member" | "assistant"; text: string; id?: string }) => {
      exchangeRef.current = entry.role === "member" ? { heard: entry.text, said: null } : { heard: exchangeRef.current.heard, said: entry.text };
      paint();
      handlerRef.current?.onTranscript?.(entry);
    },
    [paint],
  );
  const onTranscriptRevised = useCallback(
    (entry: { id: string; text: string }) => {
      if (exchangeRef.current.heard !== null && exchangeRef.current.said === null) {
        exchangeRef.current = { heard: entry.text, said: null };
        paint();
      }
      handlerRef.current?.onTranscriptRevised?.(entry);
    },
    [paint],
  );
  const onError = useCallback((message: string) => setNotice(message), []);

  const onChanged = useCallback(() => router.refresh(), [router]);
  const server = useMemo(() => (config?.serverVoice ? { householdId: config.householdId } : null), [config?.serverVoice, config?.householdId]);

  // The engines mount the first time a screen configures the conversation
  // (only a screen with a talk button does), so by the time the person taps
  // it they are ready and the start stays inside the tap. A start that comes
  // before they are ready waits for them.
  const [wanted, setWanted] = useState(false);
  const enginesRef = useRef<LiveEngines | null>(null);
  const pendingStart = useRef<LiveEngineName | null>(null);
  const runningRef = useRef<LiveEngineName | null>(null);
  useEffect(() => {
    runningRef.current = running;
  }, [running]);
  const [views, setViews] = useState<EngineViews>({ own: IDLE, gemini: IDLE });
  const viewsRef = useRef<EngineViews>(views);
  const onEngines = useCallback((engines: LiveEngines) => {
    enginesRef.current = engines;
    // The floating video takes Gemini's voice only while Gemini is the one talking.
    voiceRef.current = { take: () => (runningRef.current === "gemini_live" ? engines.gemini.voiceStream() : null), release: engines.gemini.releaseVoice };
    const next: EngineViews = {
      own: { state: engines.own.state, active: engines.own.active, paused: engines.own.paused },
      gemini: { state: engines.gemini.state, active: engines.gemini.active, paused: engines.gemini.paused },
    };
    if (!sameView(next.own, viewsRef.current.own) || !sameView(next.gemini, viewsRef.current.gemini)) {
      viewsRef.current = next;
      setViews(next);
    }
    const waiting = pendingStart.current;
    if (waiting) {
      pendingStart.current = null;
      engines[engineKey(waiting)].start();
    }
  }, []);

  const view = useCallback(
    (name: LiveEngineName): LiveView => {
      // "Connecting" stays its own state: until the session can hear, the
      // person is told to wait rather than shown "thinking" or "listening".
      return views[engineKey(running ?? name)];
    },
    [running, views],
  );

  // A session that ended by itself (a closed connection, a refused microphone) is no longer running.
  const runningActive = running ? views[engineKey(running)].active : false;
  const ownState = views.own.state;
  useEffect(() => {
    if (running && !runningActive && ownState !== "thinking") {
      const timer = setTimeout(() => setRunning((current) => (current && !viewsRef.current[engineKey(current)].active && pendingStart.current !== current ? null : current)), 1500);
      return () => clearTimeout(timer);
    }
  }, [ownState, running, runningActive]);

  const value = useMemo<LiveTalk>(
    () => ({
      configure: (next) => {
        configRef.current = next;
        setWanted(true);
        setConfig((current) =>
          current && current.householdId === next.householdId && current.lang === next.lang && current.serverVoice === next.serverVoice && current.labels === next.labels ? current : next,
        );
      },
      register: (handler) => {
        handlerRef.current = handler;
        return () => {
          if (handlerRef.current === handler) handlerRef.current = null;
        };
      },
      view,
      running,
      start: (name) => {
        setNotice(null);
        exchangeRef.current = { heard: null, said: null };
        setRunning(name);
        const engines = enginesRef.current;
        if (engines) engines[engineKey(name)].start();
        else {
          pendingStart.current = name;
          setWanted(true);
        }
      },
      pause: () => (running ? enginesRef.current?.[engineKey(running)].pause() : undefined),
      resume: () => (running ? enginesRef.current?.[engineKey(running)].resume() : undefined),
      stop: () => {
        pendingStart.current = null;
        if (running) enginesRef.current?.[engineKey(running)].stop();
        setRunning(null);
        disarmFloat();
        // On HomeTalk's page the page posts the recap itself (its `onLiveEnd`).
        const since = startMessageId.current;
        if (!handlerRef.current && since && configRef.current) {
          startMessageId.current = null;
          postRecap(configRef.current.householdId, since);
        }
      },
      markStart: (messageId) => {
        if (!startMessageId.current) startMessageId.current = messageId;
      },
      takeStart: () => {
        const since = startMessageId.current;
        startMessageId.current = null;
        return since;
      },
      navigate,
      floatable,
      floating,
      float: () => void floatNow(),
      unfloat: closeFloat,
      notice,
    }),
    [closeFloat, disarmFloat, floatNow, floatable, floating, navigate, notice, running, view],
  );

  // The tab bar's raised HomeTalk button glows for as long as the conversation runs, on any screen.
  const live = running ? view(running) : null;
  useEffect(() => {
    setTalkActivity(live?.active ? (live.paused ? "paused" : "live") : "idle");
  }, [live?.active, live?.paused]);

  // The window repaints the moment the state changes, not only on its timer; and a conversation that ended takes it down.
  const liveState = live?.state ?? "idle";
  const livePaused = live?.paused ?? false;
  const liveActive = live?.active ?? false;
  useEffect(() => {
    viewRef.current = { state: liveState, active: liveActive, paused: livePaused };
    paint();
  }, [liveActive, livePaused, liveState, paint]);
  useEffect(() => {
    if (!running) disarmFloat();
  }, [disarmFloat, running]);
  useEffect(() => () => disarmFloat(), [disarmFloat]);

  // Leaving the app floats HomeTalk (story 04-022): while a conversation is
  // live, the floating video is kept ready, and the moment the page is hidden
  // the window is asked for. Chrome's own "enterpictureinpicture" action and
  // Safari's autopictureinpicture take it from there where they can.
  const autoFloat = shouldArmFloat({ floatable, active: liveActive, paused: livePaused });
  useEffect(() => {
    if (!autoFloat) return;
    void armFloat().then(() => attachVoice());
    const onHidden = () => {
      if (document.visibilityState === "hidden") void floatNow(true);
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, [armFloat, attachVoice, autoFloat, floatNow]);
  // The voice arrives a moment after the conversation starts; it joins the ready video when it does.
  useEffect(() => {
    if (autoFloat && liveState !== "connecting") void attachVoice();
  }, [attachVoice, autoFloat, liveState]);

  // The phone's own media controls — on its lock screen, in the floating
  // window — pause, resume and end this conversation; where the browser
  // offers it, they can float it too. Nothing here is a decision about the
  // household: the handlers only press the same buttons the bar has.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    const set = (action: MediaSessionAction | "enterpictureinpicture", handler: (() => void) | null) => {
      try {
        session.setActionHandler(action as MediaSessionAction, handler);
      } catch {
        // An action this browser does not know.
      }
    };
    if (!liveActive) {
      try {
        session.metadata = null;
        session.playbackState = "none";
      } catch {
        // Nothing to clear.
      }
      for (const action of MEDIA_ACTIONS) set(action, null);
      set("enterpictureinpicture", null);
      return;
    }
    try {
      if (typeof MediaMetadata !== "undefined") session.metadata = new MediaMetadata({ title: "HomeTalk", artist: "WonderHome" });
      session.playbackState = livePaused ? "paused" : "playing";
    } catch {
      // Metadata is a nicety.
    }
    set("play", value.resume);
    set("pause", value.pause);
    set("stop", value.stop);
    set("enterpictureinpicture", floatable ? () => void floatNow(true) : null);
  }, [floatNow, floatable, liveActive, livePaused, value]);

  // While the bar shows, every page keeps its last row clear of it (rule 15).
  const barShown = Boolean(live?.active && config && !pathname.startsWith("/ai"));
  useEffect(() => {
    const root = document.documentElement;
    if (barShown) root.style.setProperty("--wh-live-bar-clearance", "4.5rem");
    else root.style.removeProperty("--wh-live-bar-clearance");
    return () => {
      root.style.removeProperty("--wh-live-bar-clearance");
    };
  }, [barShown]);

  return (
    <LiveTalkContext.Provider value={value}>
      {children}
      {wanted ? (
        <Suspense fallback={null}>
          <LiveTalkEngines
            lang={config?.lang ?? "en-IN"}
            server={server}
            householdId={config?.householdId ?? ""}
            onUtterance={onUtterance}
            onTranscript={onTranscript}
            onTranscriptRevised={onTranscriptRevised}
            onError={onError}
            onNavigate={navigate}
            onChanged={onChanged}
            onEngines={onEngines}
          />
        </Suspense>
      ) : null}
      {barShown && live && config ? (
        <LiveTalkBar
          live={live}
          labels={config.labels}
          notice={notice}
          floatable={floatable}
          floating={floating}
          onPause={value.pause}
          onResume={value.resume}
          onFloat={value.float}
          onUnfloat={value.unfloat}
          onEnd={value.stop}
        />
      ) : null}
    </LiveTalkContext.Provider>
  );
}

export function useLiveTalk(): LiveTalk | null {
  return useContext(LiveTalkContext);
}

/**
 * HomeTalk's glow, on every screen but HomeTalk's own, while a live
 * conversation runs: what it is doing, pause or resume, float or bring back
 * (where the phone can), end, and the way back to the conversation. Sits
 * above the phone's tab bar and never covers a row's actions (it is short
 * and centred), with the motion off when the person has asked for less.
 */
function LiveTalkBar({
  live,
  labels,
  notice,
  floatable,
  floating,
  onPause,
  onResume,
  onFloat,
  onUnfloat,
  onEnd,
}: {
  live: LiveView;
  labels: LiveTalkLabels;
  notice: string | null;
  floatable: boolean;
  floating: boolean;
  onPause: () => void;
  onResume: () => void;
  onFloat: () => void;
  onUnfloat: () => void;
  onEnd: () => void;
}) {
  const status = live.paused
    ? labels.paused
    : live.state === "connecting"
      ? labels.connecting
      : live.state === "thinking"
        ? labels.thinking
        : live.state === "speaking"
          ? labels.speaking
          : labels.listening;
  const control =
    "grid size-10 shrink-0 place-items-center rounded-full bg-[var(--wh-surface-muted)] text-[var(--wh-foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]";
  return (
    <div
      role="region"
      aria-label={labels.open}
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--wh-tabbar-height)+var(--wh-tabbar-raised-overhang)+env(safe-area-inset-bottom)+0.25rem)] z-40 flex justify-center px-4 md:bottom-6 md:justify-end md:px-6"
    >
      <div
        className={cn(
          "pointer-events-auto flex max-w-full items-center gap-2 rounded-full border border-[var(--wh-border)] bg-[var(--wh-surface)] py-1.5 pr-1.5 pl-1.5 shadow-[var(--wh-shadow-float)]",
          !live.paused && "shadow-[0_0_0_4px_var(--wh-primary-glow),var(--wh-shadow-float)] motion-safe:animate-[wh-glow_2.4s_ease-in-out_infinite]",
        )}
      >
        <Link
          href="/ai"
          aria-label={labels.open}
          className="flex min-w-0 items-center gap-2.5 rounded-full py-1 pr-2 pl-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]"
        >
          <span aria-hidden className="relative grid size-9 shrink-0 place-items-center rounded-full bg-[image:var(--wh-gradient-orb)] text-white">
            {!live.paused && live.state !== "connecting" ? <span className="absolute inset-0 rounded-full bg-[var(--wh-primary)] opacity-40 motion-safe:animate-ping" /> : null}
            {/* Not ready yet: a turning ring, never the microphone that says "speak". */}
            {live.state === "connecting" ? <LoaderCircle className="relative size-4 motion-safe:animate-spin" /> : <Mic className="relative size-4" />}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold" aria-live="polite">
              {status}
            </span>
            {notice ? <span className="block max-w-[12rem] text-xs break-words text-[var(--wh-foreground-muted)]">{notice}</span> : null}
          </span>
        </Link>
        <button type="button" onClick={live.paused ? onResume : onPause} aria-label={live.paused ? labels.resume : labels.pause} className={control}>
          {live.paused ? <Play aria-hidden className="size-4" /> : <Pause aria-hidden className="size-4" />}
        </button>
        {floatable ? (
          <button type="button" onClick={floating ? onUnfloat : onFloat} aria-label={floating ? labels.unfloat : labels.float} className={control}>
            {floating ? <Maximize2 aria-hidden className="size-4" /> : <PictureInPicture2 aria-hidden className="size-4" />}
          </button>
        ) : null}
        <button type="button" onClick={onEnd} aria-label={labels.end} className={control}>
          <X aria-hidden className="size-4" />
        </button>
      </div>
    </div>
  );
}
