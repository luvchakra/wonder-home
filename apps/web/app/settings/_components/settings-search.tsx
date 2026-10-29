"use client";

import { ChevronRight, Search, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type MouseEvent, type ReactNode } from "react";

export type SettingsSearchEntry = {
  id: string;
  title: string;
  /** The card or page the setting lives in, shown under the title. */
  group: string;
  meta?: string;
  href: string;
  icon: ReactNode;
};

type Props = {
  entries: SettingsSearchEntry[];
  labels: { placeholder: string; clear: string; none: string };
  /** The cards, shown while nothing is typed. */
  children: ReactNode;
};

const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * A result inside this page (`/settings#playbook`) is a card that is not on screen while results
 * are: clear the search so the cards return, then point the URL at the card and let
 * `OpenOnHash` unfold and scroll to it. Results on other pages are ordinary links.
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

/**
 * Search at the top of Settings, like a phone's settings: type and the cards
 * give way to a flat list of matching settings, each one tap from its editor.
 * Every typed word must appear in the title, group or meta; titles that start
 * with a word rank first. It filters a small list already in the page, so
 * results appear on every keystroke with no request.
 */
export function SettingsSearch({ entries, labels, children }: Props) {
  const [query, setQuery] = useState("");
  const terms = fold(query).split(/\s+/).filter(Boolean);

  const indexed = useMemo(() => entries.map((entry) => ({ entry, title: fold(entry.title), rest: fold(`${entry.group} ${entry.meta ?? ""}`) })), [entries]);

  const results = useMemo(() => {
    if (terms.length === 0) return [];
    return indexed
      .filter(({ title, rest }) => terms.every((term) => title.includes(term) || rest.includes(term)))
      .map(({ entry, title }) => ({ entry, rank: terms.every((term) => title.split(/\s+/).some((word) => word.startsWith(term))) ? 0 : terms.every((term) => title.includes(term)) ? 1 : 2 }))
      .sort((a, b) => a.rank - b.rank)
      .map(({ entry }) => entry);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `terms` is derived from `query`
  }, [indexed, query]);

  return (
    <>
      <div role="search" className="relative">
        <Search aria-hidden className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-[var(--wh-foreground-subtle)]" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
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

      {terms.length === 0 ? (
        children
      ) : results.length === 0 ? (
        <p role="status" className="px-2 py-6 text-center text-sm text-[var(--wh-foreground-muted)]">
          {labels.none.replace("{query}", query.trim())}
        </p>
      ) : (
        <ul className="divide-y divide-[var(--wh-border)] overflow-hidden rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)]">
          {results.map((entry) => (
            <li key={entry.id}>
              <Link href={entry.href} onClick={(event) => openHere(event, entry.href, () => setQuery(""))} className="flex min-h-14 items-center gap-3 px-3 py-2 hover:bg-[var(--wh-surface-muted)]">
                {entry.icon}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{entry.title}</span>
                  <span className="block text-xs text-[var(--wh-foreground-subtle)]">{entry.group}</span>
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
