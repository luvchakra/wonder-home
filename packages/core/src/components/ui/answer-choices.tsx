"use client";

import { useRef, useState, type KeyboardEvent } from "react";

import { cn } from "../../lib/cn";
import { ChoiceChips } from "./choice-chips";

export type AnswerChoice = { label: string; say: string | null };

/**
 * The answers to pick under HomeTalk's question (rule 20: a choice is picked,
 * not typed; `hometalk/choices.ts`). The text box beside it always stays.
 *
 * One answer is a radio group of chips that answers the moment one is picked:
 * arrows move between them, Enter or Space picks, and nothing is sent by
 * moving alone. Several answers are checkboxes with one Send, plus any answer
 * that stands alone ("Not now") beside it. A choice without words to send
 * ("Another day…") hands the cursor to the text box instead.
 *
 * Chips wrap and are never cut (rules 11, 15); every target is at least
 * 44 px. Once answered — or while a reply is on its way — the set is
 * disabled, and the answer picked stays marked.
 */
export function AnswerChoices({
  legend,
  mode,
  choices,
  also = [],
  disabled = false,
  sendLabel,
  name,
  onPick,
  onSend,
  className,
}: {
  legend: string;
  mode: "single" | "multi";
  choices: readonly AnswerChoice[];
  also?: readonly AnswerChoice[];
  disabled?: boolean;
  sendLabel: string;
  /** A name for the checkbox group, unique on the page. */
  name: string;
  /** A single answer, or a standalone one beside Send; null `say` means "let me type it". */
  onPick: (say: string | null) => void;
  /** The ticked answers' words, in the order shown. */
  onSend: (says: string[]) => void;
  className?: string;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [ticked, setTicked] = useState<string[]>(() => choices.flatMap((choice) => (choice.say ? [choice.say] : [])));
  const [focusAt, setFocusAt] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const pick = (choice: AnswerChoice) => {
    if (disabled) return;
    if (choice.say) setPicked(choice.say);
    onPick(choice.say);
  };

  const chip = (selected: boolean) =>
    cn(
      "flex min-h-11 items-center justify-center rounded-[var(--wh-radius-pill)] border px-4 py-2 text-start text-sm font-medium break-words transition-colors",
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]",
      selected
        ? "border-[var(--wh-primary)] bg-[var(--wh-primary-soft)] text-[var(--wh-primary)]"
        : "border-[var(--wh-border)] bg-[var(--wh-surface)] text-[var(--wh-foreground)] hover:border-[var(--wh-primary)]",
      "disabled:cursor-default disabled:opacity-60 disabled:hover:border-[var(--wh-border)]",
    );

  if (mode === "single") {
    const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
      const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
      if (step === 0) return;
      event.preventDefault();
      const next = (index + step + choices.length) % choices.length;
      setFocusAt(next);
      buttons.current[next]?.focus();
    };
    return (
      <div role="radiogroup" aria-label={legend} aria-disabled={disabled || undefined} className={cn("flex min-w-0 flex-wrap gap-2", className)}>
        {choices.map((choice, index) => {
          const selected = choice.say !== null && choice.say === picked;
          return (
            <button
              key={`${choice.label}-${index}`}
              ref={(element) => {
                buttons.current[index] = element;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={index === focusAt ? 0 : -1}
              disabled={disabled}
              onKeyDown={(event) => move(event, index)}
              onClick={() => pick(choice)}
              className={chip(selected)}
            >
              {choice.label}
            </button>
          );
        })}
      </div>
    );
  }

  const options = choices.flatMap((choice) => (choice.say ? [{ value: choice.say, label: choice.label }] : []));
  return (
    <div className={cn("min-w-0 space-y-2", className)}>
      <ChoiceChips
        legend={legend}
        legendHidden
        name={name}
        type="checkbox"
        options={options}
        value={ticked}
        onValueChange={(value, checked) => setTicked((current) => (checked ? options.map((option) => option.value).filter((entry) => entry === value || current.includes(entry)) : current.filter((entry) => entry !== value)))}
        disabled={disabled}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled || ticked.length === 0}
          onClick={() => onSend(ticked)}
          className="flex min-h-11 items-center justify-center rounded-[var(--wh-radius-pill)] bg-[var(--wh-primary)] px-5 text-sm font-semibold text-[var(--wh-primary-foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)] disabled:opacity-60"
        >
          {sendLabel}
        </button>
        {also.map((choice, index) => (
          <button key={`${choice.label}-${index}`} type="button" disabled={disabled} onClick={() => pick(choice)} className={chip(choice.say !== null && choice.say === picked)}>
            {choice.label}
          </button>
        ))}
      </div>
    </div>
  );
}
