"use client";

import { Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { messageDayLabel, messageTime, type MessageTimeStyle } from "@wonderhome/core/conversation/message-time";
import { plainText } from "@wonderhome/core/conversation/reply-format";

/**
 * HomeTalk's search, in the header: what was said to WonderHome and what it
 * said back, across this member's own conversations. A result on screen is
 * brought into view and marked; one from further back opens in place, whole.
 *
 * Search only reads. Asking something new is still the composer's job, the
 * one door (rule 13), which is why this does not submit to the assistant the
 * way the global search bar does.
 */

/** The search's wording, in the viewer's language; the page builds it from the catalog. */
export type ConversationSearchLabels = {
  label: string;
  placeholder: string;
  clear: string;
  searching: string;
  failed: string;
  /** `{query}` is what was typed. */
  none: string;
  /** "1 message", "2 messages"… indexed by count, up to the most a search returns. */
  counts: string[];
  you: string;
  time: MessageTimeStyle;
};

export const CONVERSATION_SEARCH_LABELS: ConversationSearchLabels = {
  label: "Search your messages with WonderHome",
  placeholder: "Search messages",
  clear: "Clear the search",
  searching: "Searching…",
  failed: "The search did not work just now. Try again in a moment.",
  none: "No messages mention “{query}”.",
  counts: [],
  you: "You",
  time: {},
};

type Match = { id: string; role: "member" | "assistant"; text: string; at: string };
type State =
  | { kind: "idle" }
  | { kind: "searching" }
  | { kind: "done"; query: string; matches: Match[] }
  | { kind: "failed" };

/** A little either side of the first place the words appear, so a long reply still shows why it matched. */
function excerpt(text: string, query: string, around = 70): { before: string; hit: string; after: string } | null {
  const at = text.toLowerCase().indexOf(query.toLowerCase());
  if (at === -1) return null;
  const start = Math.max(0, at - around);
  const end = Math.min(text.length, at + query.length + around);
  return {
    before: `${start > 0 ? "…" : ""}${text.slice(start, at)}`,
    hit: text.slice(at, at + query.length),
    after: `${text.slice(at + query.length, end)}${end < text.length ? "…" : ""}`,
  };
}

function highlighted(text: string, query: string): ReactNode {
  const lower = text.toLowerCase();
  const needle = query.toLowerCase();
  const parts: ReactNode[] = [];
  let from = 0;
  for (let at = lower.indexOf(needle); at !== -1 && needle; at = lower.indexOf(needle, from)) {
    parts.push(text.slice(from, at));
    parts.push(
      <mark key={at} className="rounded-sm bg-[var(--wh-attention-soft)] px-0.5 text-inherit">
        {text.slice(at, at + needle.length)}
      </mark>,
    );
    from = at + needle.length;
  }
  parts.push(text.slice(from));
  return parts;
}

export function ConversationSearch({
  householdId,
  timeZone,
  labels = CONVERSATION_SEARCH_LABELS,
}: {
  householdId: string;
  timeZone: string;
  labels?: ConversationSearchLabels;
}) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  // Searches a moment after typing stops, and only for the latest words.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setState({ kind: "searching" });
      try {
        const response = await fetch(`/api/v1/households/${householdId}/conversation?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("search failed");
        const payload = (await response.json()) as { matches?: Match[] };
        setState({ kind: "done", query: term, matches: payload.matches ?? [] });
        setExpanded(null);
      } catch (caught) {
        if ((caught as Error).name !== "AbortError") setState({ kind: "failed" });
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, householdId]);

  // Tapping anywhere else, or Escape, puts the results away; the words stay.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const show = (match: Match) => {
    const element = document.getElementById(`message-${match.id}`);
    if (!element) {
      // Further back than the conversation on screen: shown whole, here.
      setExpanded((current) => (current === match.id ? null : match.id));
      return;
    }
    setOpen(false);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" });
    element.animate(
      [{ backgroundColor: "color-mix(in oklch, var(--wh-primary) 16%, transparent)" }, { backgroundColor: "transparent" }],
      { duration: still ? 0 : 1800, easing: "ease-out" },
    );
  };

  // Too little typed is nothing to search for, whatever the last search said.
  const current: State = query.trim().length < 2 ? { kind: "idle" } : state;
  const showPanel = open && current.kind !== "idle";

  return (
    <div ref={rootRef} className="relative" role="search">
      <label htmlFor={`${listId}-input`} className="sr-only">
        {labels.label}
      </label>
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-[var(--wh-foreground-subtle)]" />
      <input
        ref={inputRef}
        id={`${listId}-input`}
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={labels.placeholder}
        autoComplete="off"
        enterKeyHint="search"
        aria-controls={showPanel ? listId : undefined}
        className={`block h-10 w-full rounded-full border border-[var(--wh-border)] bg-[var(--wh-surface)] pl-8 text-[0.8125rem] sm:text-sm ${query ? "pr-9" : "pr-3"} shadow-[var(--wh-shadow-card)] placeholder:text-[var(--wh-foreground-subtle)] focus-visible:border-[var(--wh-primary)] focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden`}
      />
      {query ? (
        <button
          type="button"
          onClick={() => {
            setQuery("");
            setOpen(false);
            inputRef.current?.focus();
          }}
          aria-label={labels.clear}
          className="absolute top-1/2 right-1 grid size-8 -translate-y-1/2 place-items-center rounded-full text-[var(--wh-foreground-subtle)] hover:bg-[var(--wh-surface-muted)]"
        >
          <X aria-hidden className="size-4" />
        </button>
      ) : null}

      {showPanel ? (
        <div
          id={listId}
          className="fixed inset-x-4 top-[calc(var(--wh-header-height)+env(safe-area-inset-top)+0.25rem)] z-40 max-h-[min(70dvh,32rem)] overflow-y-auto overscroll-contain rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)] p-1.5 shadow-[var(--wh-shadow-float)] lg:absolute lg:inset-x-0 lg:top-12"
        >
          {current.kind === "searching" ? (
            <p role="status" className="px-3 py-3 text-sm text-[var(--wh-foreground-muted)]">
              {labels.searching}
            </p>
          ) : current.kind === "failed" ? (
            <p role="alert" className="px-3 py-3 text-sm text-[var(--wh-risk)]">
              {labels.failed}
            </p>
          ) : current.kind === "done" && current.matches.length === 0 ? (
            <p role="status" className="px-3 py-3 text-sm text-[var(--wh-foreground-muted)]">
              {labels.none.replace("{query}", () => current.query)}
            </p>
          ) : current.kind === "done" ? (
            <>
              <p role="status" className="px-3 pt-1.5 pb-1 text-xs font-medium text-[var(--wh-foreground-subtle)]">
                {labels.counts[current.matches.length] ?? (current.matches.length === 1 ? "1 message" : `${current.matches.length} messages`)}
              </p>
              <ul className="space-y-0.5">
                {current.matches.map((match) => {
                  const text = plainText(match.text);
                  const whole = expanded === match.id;
                  const part = whole ? null : excerpt(text, current.query);
                  const when = new Date(match.at);
                  return (
                    <li key={match.id}>
                      <button
                        type="button"
                        onClick={() => show(match)}
                        className="block w-full rounded-[var(--wh-radius-sm)] px-3 py-2.5 text-left hover:bg-[var(--wh-surface-muted)] focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)]"
                      >
                        <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                          <span className="text-xs font-semibold text-[var(--wh-foreground)]">{match.role === "member" ? labels.you : "WonderHome"}</span>
                          <span className="text-xs text-[var(--wh-foreground-subtle)] tabular-nums">
                            {messageDayLabel(when, timeZone, undefined, labels.time)} · {messageTime(when, timeZone, labels.time)}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-sm leading-snug whitespace-pre-line text-[var(--wh-foreground-muted)]">
                          {part ? (
                            <>
                              {part.before}
                              <mark className="rounded-sm bg-[var(--wh-attention-soft)] px-0.5 text-inherit">{part.hit}</mark>
                              {part.after}
                            </>
                          ) : (
                            highlighted(text, current.query)
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
