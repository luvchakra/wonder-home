"use client";

import { ChevronRight, MessageCircle, Search, X } from "lucide-react";
import Link from "next/link";
import { Fragment, useCallback, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";

import { highlight, searchSettings, type SearchItem } from "@wonderhome/core/settings-search/match";

type Props = {
  labels: { placeholder: string; clear: string; none: string; loading: string; askHomeTalk: string; askBody: string };
  /** The cards, shown while nothing is typed. */
  children: ReactNode;
};

/**
 * A result inside this page (`/settings#playbook`) is a card that is not on screen while results
 * are: clear the search so the cards return, then point the URL at the card and let
 * `OpenOnHash` unfold, scroll to, focus and flash it. Results on other pages are ordinary links
 * and the page they open does the same.
 */
function openHere(event: MouseEvent<HTMLAnchorElement>, href: string, clear: () => void) {
  if (!href.startsWith("/settings#") || event.metaKey || event.ctrlKey || event.shiftKey) return;
  event.preventDefault();
  clear();
  requestAnimationFrame(() => {
    window.history.replaceState(null, "", href.slice("/settings".length));
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

function Marked({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlight(text, query).map((piece, index) =>
        piece.hit ? (
          <mark key={index} className="rounded-sm bg-[var(--wh-primary-soft,#dbeafe)] px-0.5 text-inherit">
            {piece.text}
          </mark>
        ) : (
          <Fragment key={index}>{piece.text}</Fragment>
        ),
      )}
    </>
  );
}

/**
 * Search at the top of Settings: type and the cards give way to a flat list of the individual
 * settings that match (every field, toggle and sub-page, however deep), each with its
 * breadcrumb and one tap from the control itself. The index is the person's own (their
 * language, only what they may use) and is fetched the first time the box is used, so no page
 * carries it. Matching is in `@wonderhome/core/settings-search/match`.
 */
export function SettingsSearch({ labels, children }: Props) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  const load = useCallback(() => {
    if (started.current) return;
    started.current = true;
    fetch("/settings/search-index", { credentials: "same-origin" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("index"))))
      .then((body: { items: SearchItem[] }) => setItems(body.items))
      .catch(() => {
        started.current = false;
        setFailed(true);
      });
  }, []);

  const typed = query.trim();
  const results = useMemo(() => (items && typed ? searchSettings(items, typed) : []), [items, typed]);

  return (
    <>
      <div role="search" className="relative">
        <Search aria-hidden className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-[var(--wh-foreground-subtle)]" />
        <input
          type="search"
          value={query}
          onFocus={load}
          onChange={(event) => {
            load();
            setQuery(event.target.value);
          }}
          placeholder={labels.placeholder}
          aria-label={labels.placeholder}
          autoComplete="off"
          enterKeyHint="search"
          className="h-12 w-full rounded-full border border-[var(--wh-border)] bg-[var(--wh-surface)] ps-10 pe-11 text-base text-[var(--wh-foreground)] shadow-[var(--wh-shadow-card)] outline-none placeholder:text-[var(--wh-foreground-subtle)] focus:border-[var(--wh-primary)] [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label={labels.clear}
            className="absolute end-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)]"
          >
            <X aria-hidden className="size-4" />
          </button>
        ) : null}
      </div>

      {!typed ? (
        children
      ) : !items ? (
        <p role="status" className="px-2 py-6 text-center text-sm text-[var(--wh-foreground-muted)]">
          {failed ? labels.none.replace("{query}", typed) : labels.loading}
        </p>
      ) : results.length === 0 ? (
        <div role="status" className="space-y-3 px-2 py-6 text-center">
          <p className="text-sm text-[var(--wh-foreground-muted)]">{labels.none.replace("{query}", typed)}</p>
          <Link href={`/ai?q=${encodeURIComponent(typed)}`} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--wh-border)] bg-[var(--wh-surface)] px-4 text-sm font-medium hover:bg-[var(--wh-surface-muted)]">
            <MessageCircle aria-hidden className="size-4" />
            {labels.askHomeTalk}
          </Link>
          <p className="text-xs text-[var(--wh-foreground-subtle)]">{labels.askBody}</p>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--wh-border)] overflow-hidden rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)]">
          {results.map(({ item }) => (
            <li key={item.id}>
              <Link href={item.href} onClick={(event) => openHere(event, item.href, () => setQuery(""))} className="flex min-h-14 items-center gap-3 px-3 py-2 hover:bg-[var(--wh-surface-muted)]">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium break-words">
                    <Marked text={item.label} query={typed} />
                  </span>
                  {item.crumbs.length > 0 ? <span className="block text-xs break-words text-[var(--wh-foreground-subtle)]">{item.crumbs.join(" › ")}</span> : null}
                </span>
                <ChevronRight aria-hidden className="size-4 shrink-0 text-[var(--wh-foreground-subtle)] rtl:rotate-180" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
