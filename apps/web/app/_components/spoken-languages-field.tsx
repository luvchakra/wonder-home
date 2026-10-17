"use client";

import { Plus, X } from "lucide-react";
import { useId, useState } from "react";

import { cn } from "@wonderhome/core/lib/cn";

export type FluencyLevel = "basic" | "conversational" | "fluent" | "native";
const LEVELS: readonly FluencyLevel[] = ["basic", "conversational", "fluent", "native"];

export type SpokenLanguagesLabels = {
  legend: string;
  none: string;
  add: string;
  other: string;
  otherPlaceholder: string;
  addOther: string;
  /** "Remove {language}" */
  remove: string;
  /** "How well {name} speaks {language}" */
  meter: string;
  fluency: Record<FluencyLevel, string>;
};

const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");

/**
 * Every language a person speaks, and how well (rule 20: picked from a list,
 * with a way to add one that is not there). Each language gets a four-step
 * meter, from "A few words" to "First language", tapped rather than typed;
 * the level's own word is always shown beside it, so the meter is never
 * colour or height alone. Posts `speaks_<member>` and `fluency_<member>` in
 * the same order, and `langs_<member>` so an emptied list still saves.
 */
export function SpokenLanguagesField({
  memberId,
  displayName,
  initial,
  options,
  disabled = false,
  labels,
}: {
  memberId: string;
  displayName: string;
  initial: readonly { language: string; fluency: FluencyLevel; label: string }[];
  /** Codes offered in the picker, with their names in the reader's language. */
  options: readonly { code: string; label: string }[];
  disabled?: boolean;
  labels: SpokenLanguagesLabels;
}) {
  const id = useId();
  const [list, setList] = useState(initial.map((entry) => ({ ...entry })));
  const [typing, setTyping] = useState(false);
  const [other, setOther] = useState("");
  const remaining = options.filter((option) => !list.some((entry) => entry.language === option.code));

  function add(language: string, label: string) {
    if (!language || list.some((entry) => entry.language.toLowerCase() === language.toLowerCase())) return;
    setList([...list, { language, label, fluency: "conversational" }]);
  }

  return (
    <fieldset className="min-w-0 space-y-2" disabled={disabled}>
      <legend className="text-sm font-medium">{labels.legend}</legend>
      <input type="hidden" name={`langs_${memberId}`} value="1" />
      {list.length === 0 ? <p className="text-xs text-[var(--wh-foreground-subtle)]">{labels.none}</p> : null}
      <ul className="space-y-2">
        {list.map((entry, index) => (
          <li key={entry.language} className="space-y-1 rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] py-1 pr-1 pl-3">
            <input type="hidden" name={`speaks_${memberId}`} value={entry.language} />
            <input type="hidden" name={`fluency_${memberId}`} value={entry.fluency} />
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 text-sm font-medium break-words">{entry.label}</span>
              <button
                type="button"
                onClick={() => setList(list.filter((_, at) => at !== index))}
                aria-label={fill(labels.remove, { language: entry.label })}
                title={fill(labels.remove, { language: entry.label })}
                className="grid size-11 shrink-0 place-items-center rounded-full text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface)] focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)]"
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-x-3">
              <span role="radiogroup" aria-label={fill(labels.meter, { name: displayName, language: entry.label })} className="-ml-1.5 flex items-end gap-1">
                {LEVELS.map((level, step) => {
                  const on = LEVELS.indexOf(entry.fluency) >= step;
                  return (
                    <button
                      key={level}
                      type="button"
                      role="radio"
                      aria-checked={entry.fluency === level}
                      aria-label={labels.fluency[level]}
                      title={labels.fluency[level]}
                      onClick={() => setList(list.map((item, at) => (at === index ? { ...item, fluency: level } : item)))}
                      className="grid h-11 w-8 place-items-end justify-center pb-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--wh-primary)]"
                    >
                      <span
                        aria-hidden
                        className={cn("block w-3 rounded-full transition-colors motion-reduce:transition-none", on ? "bg-[var(--wh-primary)]" : "bg-[var(--wh-border)]")}
                        style={{ height: `${8 + step * 6}px` }}
                      />
                    </button>
                  );
                })}
              </span>
              <span className="text-sm text-[var(--wh-foreground-muted)]">{labels.fluency[entry.fluency]}</span>
            </div>
          </li>
        ))}
      </ul>
      {typing ? (
        <div className="flex gap-2">
          <label htmlFor={`${id}-other`} className="sr-only">
            {labels.other}
          </label>
          <input
            id={`${id}-other`}
            value={other}
            onChange={(event) => setOther(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add(other.trim(), other.trim());
                setOther("");
                setTyping(false);
              }
            }}
            maxLength={40}
            placeholder={labels.otherPlaceholder}
            className="block min-h-11 min-w-0 flex-1 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
          />
          <button
            type="button"
            onClick={() => {
              add(other.trim(), other.trim());
              setOther("");
              setTyping(false);
            }}
            className="inline-flex min-h-11 items-center gap-1 rounded-[var(--wh-radius-pill)] bg-[var(--wh-primary-soft)] px-4 text-sm font-semibold text-[var(--wh-primary)]"
          >
            <Plus aria-hidden className="size-4" /> {labels.addOther}
          </button>
        </div>
      ) : (
        <div>
          <label htmlFor={`${id}-add`} className="sr-only">
            {labels.add}
          </label>
          <select
            id={`${id}-add`}
            value=""
            onChange={(event) => {
              const value = event.target.value;
              if (value === "__other") setTyping(true);
              else add(value, options.find((option) => option.code === value)?.label ?? value);
            }}
            className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-dashed border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-sm text-[var(--wh-foreground-muted)] sm:w-64"
          >
            <option value="">+ {labels.add}</option>
            {remaining.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
            <option value="__other">{labels.other}</option>
          </select>
        </div>
      )}
    </fieldset>
  );
}
