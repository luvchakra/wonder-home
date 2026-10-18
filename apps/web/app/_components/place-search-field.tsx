"use client";

import { Briefcase, ExternalLink, Loader2, MapPin, Pencil, School, Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import type { PlaceSearchKind } from "@wonderhome/core/places/provider";
import { IconTile } from "@wonderhome/core/ui/icon-tile";

import { searchPlacesAction, type PlaceOption } from "../(auth)/places-actions";

export type PlaceSearchLabels = {
  placeholder: string;
  searching: string;
  nothingFound: string;
  change: string;
  openInMaps: string;
  /** Said under the box: what typing does, and that a typed answer still counts. */
  hint: string;
  /** Said under a picked place, e.g. "Picked from Google Maps". */
  picked: string;
};

export type PlaceSearchValue = { text: string; placeId: string | null; detail: string | null };

const INPUT =
  "block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] pr-3 pl-10 text-base focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--wh-primary)]";

/** The same link a person would get from Google Maps' own share button. Needs no key. */
function mapsHref(text: string, detail: string | null, placeId: string | null): string {
  const params = new URLSearchParams({ api: "1", query: [text, detail].filter(Boolean).join(", ") });
  if (placeId) params.set("query_place_id", placeId);
  return `https://www.google.com/maps/search/?${params.toString()}`;
}

/**
 * Search a real place — the home address, a school near home, or an adult's
 * office — and pick it (rule 20: picked, not typed).
 *
 * Typing asks our own server (`searchPlacesAction`), which asks Google Maps
 * with the deployment's key; a school search leans toward the saved home and
 * says how far each one is. Picking posts only the place's id: the server
 * reads the place again before saving, so an address or a point never comes
 * from the browser. What was typed still posts too, so a place the search
 * does not know is never a dead end — it is saved as written.
 *
 * Without a place search on this deployment (`available` false) this is a
 * plain text field: no search box that does nothing (rule 10).
 */
export function PlaceSearchField({
  householdId,
  kind,
  label,
  textName,
  placeName,
  sessionName,
  initial,
  available,
  labels,
}: {
  householdId: string;
  kind: PlaceSearchKind;
  label: string;
  /** Posts what was typed, or the picked place's name. */
  textName: string;
  /** Posts the picked place's id, or nothing. */
  placeName: string;
  /** Posts the search session, so typing and picking are one billed session. */
  sessionName: string;
  initial: PlaceSearchValue | null;
  available: boolean;
  labels: PlaceSearchLabels;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const hintId = `${id}-hint`;
  const [text, setText] = useState(initial?.text ?? "");
  const [picked, setPicked] = useState<PlaceSearchValue | null>(initial?.placeId ? initial : null);
  const [options, setOptions] = useState<PlaceOption[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [session, setSession] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const latest = useRef(0);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  /** Each keystroke: wait for a pause, then ask; an older answer arriving late is ignored. */
  function typed(value: string) {
    setText(value);
    setOpen(true);
    if (timer.current) clearTimeout(timer.current);
    const query = value.trim();
    const ticket = ++latest.current;
    if (query.length < 2) {
      setOptions([]);
      setBusy(false);
      return;
    }
    const token = session || crypto.randomUUID();
    if (!session) setSession(token);
    setBusy(true);
    timer.current = setTimeout(async () => {
      const result = await searchPlacesAction({ householdId, query, kind, sessionToken: token }).catch(() => ({ error: labels.nothingFound }));
      if (ticket !== latest.current) return;
      setBusy(false);
      setProblem(result.error ?? null);
      setOptions(("options" in result ? result.options : undefined) ?? []);
      setActive(-1);
    }, 300);
  }

  if (!available) {
    return (
      <div className="space-y-1.5">
        <label htmlFor={id} className="block text-sm font-medium">
          {label}
        </label>
        <input id={id} name={textName} defaultValue={initial?.text ?? ""} autoComplete="off" maxLength={300} className={INPUT.replace("pl-10", "pl-3")} />
      </div>
    );
  }

  function choose(option: PlaceOption) {
    setPicked({ text: option.primary, placeId: option.placeId, detail: option.secondary || null });
    setText(option.primary);
    setOptions([]);
    setOpen(false);
  }

  function change() {
    setPicked(null);
    setText("");
    setSession("");
    setOptions([]);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  const Icon = kind === "school" ? School : kind === "office" ? Briefcase : MapPin;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input type="hidden" name={placeName} value={picked?.placeId ?? ""} />
      <input type="hidden" name={sessionName} value={session} />
      {picked ? (
        <>
          <input type="hidden" name={textName} value={picked.text} />
          <div className="flex items-start gap-3 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] p-3">
            <IconTile icon={Icon} tone={kind === "school" ? "school" : kind === "office" ? "primary" : "home"} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium break-words">{picked.text}</p>
              {picked.detail ? <p className="text-xs break-words text-[var(--wh-foreground-muted)]">{picked.detail}</p> : null}
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--wh-foreground-subtle)]">
                <span>{labels.picked}</span>
                <a href={mapsHref(picked.text, picked.detail, picked.placeId)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-[var(--wh-primary)] underline-offset-2 hover:underline">
                  {labels.openInMaps} <ExternalLink aria-hidden className="size-3" />
                </a>
              </p>
            </div>
            <button
              type="button"
              onClick={change}
              aria-label={`${labels.change}: ${label}`}
              title={labels.change}
              className="grid size-11 shrink-0 place-items-center rounded-full text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]"
            >
              <Pencil aria-hidden className="size-4" />
            </button>
          </div>
        </>
      ) : (
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--wh-foreground-subtle)]" />
          <input
            ref={inputRef}
            id={id}
            name={textName}
            value={text}
            onChange={(event) => typed(event.target.value)}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(event) => {
              if (!open || options.length === 0) return;
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((index) => (index + 1) % options.length);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((index) => (index <= 0 ? options.length - 1 : index - 1));
              } else if (event.key === "Enter" && active >= 0) {
                event.preventDefault();
                choose(options[active]!);
              } else if (event.key === "Escape") {
                setOpen(false);
              }
            }}
            placeholder={labels.placeholder}
            autoComplete="off"
            maxLength={300}
            role="combobox"
            aria-expanded={open && options.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
            aria-describedby={hintId}
            className={INPUT}
          />
          {busy ? <Loader2 aria-label={labels.searching} className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-[var(--wh-foreground-subtle)] motion-reduce:animate-none" /> : null}
          {open && options.length > 0 ? (
            <ul id={listId} role="listbox" aria-label={label} className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] p-1 shadow-[var(--wh-shadow-md)]">
              {options.map((option, index) => (
                <li
                  key={option.placeId}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === active}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(option)}
                  className={`flex min-h-11 cursor-pointer items-start gap-2 rounded-[var(--wh-radius-sm)] px-2 py-2 ${index === active ? "bg-[var(--wh-surface-muted)]" : "hover:bg-[var(--wh-surface-muted)]"}`}
                >
                  <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--wh-foreground-subtle)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium break-words">{option.primary}</span>
                    {option.secondary ? <span className="block text-xs break-words text-[var(--wh-foreground-muted)]">{option.secondary}</span> : null}
                  </span>
                  {option.distance ? <span className="shrink-0 text-xs text-[var(--wh-foreground-subtle)]">{option.distance}</span> : null}
                </li>
              ))}
              <li aria-hidden className="px-2 pt-1 pb-0.5 text-right text-[0.6875rem] text-[var(--wh-foreground-subtle)]">Google Maps</li>
            </ul>
          ) : null}
        </div>
      )}
      <p id={hintId} className="text-xs text-[var(--wh-foreground-subtle)]" aria-live="polite">
        {picked ? null : problem ?? (open && !busy && text.trim().length >= 2 && options.length === 0 ? labels.nothingFound : labels.hint)}
      </p>
    </div>
  );
}
