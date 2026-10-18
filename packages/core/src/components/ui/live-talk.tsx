"use client";

import { Mic, Pause, Play, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { plainText } from "../../conversation/reply-format";
import { cn } from "../../lib/cn";
import { setTalkActivity } from "../shell/talk-activity";
import { useGeminiLive } from "./use-gemini-live";
import { useLiveVoice } from "./use-live-voice";

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
 */

export type LiveEngineName = "wonderhome" | "gemini_live";

export type LiveTalkLabels = {
  listening: string;
  thinking: string;
  speaking: string;
  paused: string;
  pause: string;
  resume: string;
  end: string;
  open: string;
};

export type LiveTalkConfig = {
  householdId: string;
  lang: string;
  serverVoice: boolean;
  labels: LiveTalkLabels;
};

export type LiveTurnHandler = {
  onUtterance: (transcript: string, confidence: number) => Promise<string>;
  onTranscript?: (entry: { role: "member" | "assistant"; text: string }) => void;
};

type LiveView = {
  state: "idle" | "listening" | "thinking" | "speaking" | "denied" | "unsupported";
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
};

const LiveTalkContext = createContext<LiveTalk | null>(null);

/** Only same-app paths are ever followed: a reply cannot send anyone off the app. */
export function safeHref(href: unknown): string | null {
  return typeof href === "string" && /^\/(?!\/)[a-z0-9/_-]*$/i.test(href) ? href : null;
}

/** The HomeTalk endpoint, from anywhere: one live turn, its reply as words to say, and where it asks to go. */
async function liveTurnHere(
  householdId: string,
  utterance: string,
  confidence: number,
): Promise<{ text: string; navigate: string | null; memberMessageId: string | null }> {
  const response = await fetch(`/api/v1/households/${householdId}/conversation`, {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": `live-${Date.now()}-${Math.random().toString(36).slice(2)}` },
    body: JSON.stringify({ utterance, channel: "voice", transcriptConfidence: confidence }),
  });
  const payload = (await response.json().catch(() => null)) as {
    memberMessageId?: string;
    reply?: { text?: string; navigate?: string };
    replies?: { text?: string; navigate?: string }[];
    error?: { message?: string };
  } | null;
  if (!response.ok || !payload) return { text: payload?.error?.message ?? "", navigate: null, memberMessageId: null };
  const replies = Array.isArray(payload.replies) && payload.replies.length > 0 ? payload.replies : payload.reply ? [payload.reply] : [];
  const navigate = replies.map((reply) => safeHref(reply.navigate)).find(Boolean) ?? null;
  return {
    text: replies.map((reply) => reply.text ?? "").filter(Boolean).join("\n\n"),
    navigate,
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

export function LiveTalkProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [config, setConfig] = useState<LiveTalkConfig | null>(null);
  const configRef = useRef<LiveTalkConfig | null>(null);
  const handlerRef = useRef<LiveTurnHandler | null>(null);
  const [running, setRunning] = useState<LiveEngineName | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const startMessageId = useRef<string | null>(null);

  const navigate = useCallback(
    (href: string) => {
      const safe = safeHref(href);
      if (safe) router.push(safe);
    },
    [router],
  );

  const onUtterance = useCallback(
    async (transcript: string, confidence: number): Promise<string> => {
      const handler = handlerRef.current;
      if (handler) return handler.onUtterance(transcript, confidence);
      const current = configRef.current;
      if (!current) return "";
      try {
        const { text, navigate: href, memberMessageId } = await liveTurnHere(current.householdId, transcript, confidence);
        if (memberMessageId && !startMessageId.current) startMessageId.current = memberMessageId;
        if (href) navigate(href);
        return text ? plainText(text) : "";
      } catch {
        return "";
      }
    },
    [navigate],
  );

  const onTranscript = useCallback((entry: { role: "member" | "assistant"; text: string }) => handlerRef.current?.onTranscript?.(entry), []);
  const onError = useCallback((message: string) => setNotice(message), []);

  const server = useMemo(() => (config?.serverVoice ? { householdId: config.householdId } : null), [config?.serverVoice, config?.householdId]);
  const own = useLiveVoice({ lang: config?.lang ?? "en-IN", server, onUtterance, onError });
  const gemini = useGeminiLive({ householdId: config?.householdId ?? "", onTranscript, onError, onNavigate: navigate });

  const engineOf = useCallback((name: LiveEngineName) => (name === "gemini_live" ? gemini : own), [gemini, own]);
  const view = useCallback(
    (name: LiveEngineName): LiveView => {
      const engine = engineOf(running ?? name);
      const state = engine.state === "connecting" ? "thinking" : engine.state;
      return { state, active: engine.active, paused: engine.paused };
    },
    [engineOf, running],
  );

  // A session that ended by itself (a closed connection, a refused microphone) is no longer running.
  const runningActive = running ? engineOf(running).active : false;
  const ownState = own.state;
  useEffect(() => {
    if (running && !runningActive && ownState !== "thinking") {
      const timer = setTimeout(() => setRunning((current) => (current && !engineOf(current).active ? null : current)), 1500);
      return () => clearTimeout(timer);
    }
  }, [engineOf, ownState, running, runningActive]);

  const value = useMemo<LiveTalk>(
    () => ({
      configure: (next) => {
        configRef.current = next;
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
        setRunning(name);
        engineOf(name).start();
      },
      pause: () => (running ? engineOf(running).pause() : undefined),
      resume: () => (running ? engineOf(running).resume() : undefined),
      stop: () => {
        if (running) engineOf(running).stop();
        setRunning(null);
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
    }),
    [engineOf, navigate, running, view],
  );

  // The tab bar's raised HomeTalk button glows for as long as the conversation runs, on any screen.
  const live = running ? view(running) : null;
  useEffect(() => {
    setTalkActivity(live?.active ? (live.paused ? "paused" : "live") : "idle");
  }, [live?.active, live?.paused]);

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
      {barShown && live && config ? (
        <LiveTalkBar live={live} labels={config.labels} notice={notice} onPause={value.pause} onResume={value.resume} onEnd={value.stop} />
      ) : null}
    </LiveTalkContext.Provider>
  );
}

export function useLiveTalk(): LiveTalk | null {
  return useContext(LiveTalkContext);
}

/**
 * HomeTalk's glow, on every screen but HomeTalk's own, while a live
 * conversation runs: what it is doing, pause or resume, end, and the way
 * back to the conversation. Sits above the phone's tab bar and never covers
 * a row's actions (it is short and centred), with the motion off when the
 * person has asked for less.
 */
function LiveTalkBar({
  live,
  labels,
  notice,
  onPause,
  onResume,
  onEnd,
}: {
  live: LiveView;
  labels: LiveTalkLabels;
  notice: string | null;
  onPause: () => void;
  onResume: () => void;
  onEnd: () => void;
}) {
  const status = live.paused ? labels.paused : live.state === "thinking" ? labels.thinking : live.state === "speaking" ? labels.speaking : labels.listening;
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
            {!live.paused ? <span className="absolute inset-0 rounded-full bg-[var(--wh-primary)] opacity-40 motion-safe:animate-ping" /> : null}
            <Mic className="relative size-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold" aria-live="polite">
              {status}
            </span>
            {notice ? <span className="block max-w-[12rem] text-xs break-words text-[var(--wh-foreground-muted)]">{notice}</span> : null}
          </span>
        </Link>
        <button
          type="button"
          onClick={live.paused ? onResume : onPause}
          aria-label={live.paused ? labels.resume : labels.pause}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--wh-surface-muted)] text-[var(--wh-foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]"
        >
          {live.paused ? <Play aria-hidden className="size-4" /> : <Pause aria-hidden className="size-4" />}
        </button>
        <button
          type="button"
          onClick={onEnd}
          aria-label={labels.end}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--wh-surface-muted)] text-[var(--wh-foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
    </div>
  );
}
