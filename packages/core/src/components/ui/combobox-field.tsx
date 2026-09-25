"use client";

import { useId, useState } from "react";

import { cn } from "../../lib/cn";

const ADD_NEW = "__wh_add_new__";

const INPUT_CLASS =
  "block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--wh-primary)]";

/**
 * A field whose value already has real answers a household has typed before
 * — a grocery name, a category, a unit — shown as a native `<select>` (the
 * OS's own picker, reachable on a phone) rather than a free-text box a
 * datalist merely suggests into. The list always ends with "Add new…",
 * which swaps in a plain text input for a value nobody has used yet; typing
 * there is never blocked by the options shown, so a genuinely new answer is
 * always as easy as an existing one (rule: a field with real answers offers
 * them, but never refuses the true one).
 *
 * An optional field passes `emptyLabel` ("Not recorded"), which becomes a
 * real, choosable first option — so an answer once given can be taken back
 * (rule 12), not only swapped for another one.
 */
export function ComboboxField({
  label,
  name,
  options,
  defaultValue,
  required,
  placeholder = "Choose one",
  addNewLabel = "Add new…",
  chooseExistingLabel = "Choose existing",
  newValuePlaceholder,
  hint,
  emptyLabel,
  className,
}: {
  label: string;
  name: string;
  options: string[];
  defaultValue?: string;
  required?: boolean;
  placeholder?: string;
  addNewLabel?: string;
  /** The button that goes back from typing a new value to the list — a screen in another language passes its own words. */
  chooseExistingLabel?: string;
  newValuePlaceholder?: string;
  hint?: string;
  /** For an optional field: a choosable first option meaning "no answer", submitted as an empty value. */
  emptyLabel?: string;
  className?: string;
}) {
  const selectId = useId();
  const textId = useId();
  const known = Boolean(defaultValue) && options.includes(defaultValue!);
  const [adding, setAdding] = useState(Boolean(defaultValue) && !known);
  const [value, setValue] = useState(defaultValue ?? "");

  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={adding ? textId : selectId} className="block text-sm font-medium">
        {label}
      </label>
      {adding ? (
        <div className="flex gap-2">
          <input
            id={textId}
            name={name}
            required={required}
            autoFocus
            autoComplete="off"
            placeholder={newValuePlaceholder}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className={cn(INPUT_CLASS, "flex-1")}
          />
          {options.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setValue(emptyLabel !== undefined ? "" : (options[0] ?? ""));
              }}
              className="shrink-0 rounded-[var(--wh-radius-pill)] border border-[var(--wh-border)] px-3 text-xs font-semibold text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)]"
            >
              {chooseExistingLabel}
            </button>
          ) : null}
        </div>
      ) : (
        <select
          id={selectId}
          name={name}
          required={required}
          value={value}
          onChange={(event) => {
            if (event.target.value === ADD_NEW) {
              setAdding(true);
              setValue("");
            } else {
              setValue(event.target.value);
            }
          }}
          className={INPUT_CLASS}
        >
          {emptyLabel !== undefined ? (
            <option value="">{emptyLabel}</option>
          ) : !value ? (
            <option value="" disabled>
              {placeholder}
            </option>
          ) : null}
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
          <option value={ADD_NEW}>+ {addNewLabel}</option>
        </select>
      )}
      {hint ? <p className="text-xs text-[var(--wh-foreground-subtle)]">{hint}</p> : null}
    </div>
  );
}
