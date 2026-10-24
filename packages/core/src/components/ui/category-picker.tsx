"use client";

import { Check, ChevronDown } from "lucide-react";
import { useId, useState, type ComponentType } from "react";

import { cn } from "../../lib/cn";
import { IconTile, type IconTone } from "./icon-tile";
import { Badge } from "./pill";

export type CategoryOption = {
  value: string;
  label: string;
  /** One line of what belongs here: "Homework, a school exam, a notice". */
  detail: string;
  icon: ComponentType<{ className?: string }>;
  tone: IconTone;
  /** The group it sits under, by id. */
  group: string;
};

export type CategoryGroup = { id: string; label: string };

/**
 * What something is, picked rather than typed (rule 20): the AI's choice
 * is already selected and marked Suggested, shown as one row; its chevron
 * opens every category, grouped by the part of the home it belongs to, two
 * tiles stacked on a phone and two to a row from `sm` (rule 19: a tile whose words would wrap word by word at half width is full width). Each tile is a real radio, so arrows
 * move between them and the checked one posts as `name`, open or closed. Labels wrap,
 * never clip (rules 11, 15).
 */
export function CategoryPicker({
  name,
  legend,
  options,
  groups,
  value,
  suggested,
  onChange,
  words,
}: {
  name: string;
  legend: string;
  options: readonly CategoryOption[];
  groups: readonly CategoryGroup[];
  value: string;
  /** The category the AI read it as; marked Suggested wherever it shows. */
  suggested?: string | null;
  onChange: (value: string) => void;
  words: { suggested: string; suggestedLine: string; chosenLine: string; change: string };
}) {
  const id = useId();
  const chosen = options.find((option) => option.value === value) ?? null;
  // Nothing read yet (or nothing it could be) opens the choices straight away.
  const [open, setOpen] = useState(chosen === null);
  return (
    <fieldset className="space-y-2">
      <legend className="block text-sm font-medium">{legend}</legend>
      <div className="rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)]">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-all`}
          onClick={() => setOpen((was) => !was)}
          className="flex min-h-14 w-full items-center gap-3 px-3 py-2.5 text-left"
        >
          {chosen ? <IconTile icon={chosen.icon} tone={chosen.tone} /> : null}
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{chosen?.label ?? legend}</span>
              {chosen && chosen.value === suggested ? <Badge tone="handled">{words.suggested}</Badge> : null}
            </span>
            <span className="block text-sm text-[var(--wh-foreground-muted)]">{chosen && chosen.value === suggested ? words.suggestedLine : words.chosenLine}</span>
          </span>
          <span className="sr-only">{words.change}</span>
          <ChevronDown aria-hidden className={cn("size-5 shrink-0 text-[var(--wh-foreground-muted)] transition-transform motion-reduce:transition-none", open && "rotate-180")} />
        </button>
        <div id={`${id}-all`} hidden={!open} className="space-y-4 border-t border-[var(--wh-border)] p-3">
          {groups.map((group) => {
            const inGroup = options.filter((option) => option.group === group.id);
            if (inGroup.length === 0) return null;
            return (
              <div key={group.id} className="space-y-2">
                <p className="text-xs font-semibold tracking-wide text-[var(--wh-foreground-subtle)] uppercase">{group.label}</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {inGroup.map((option) => {
                    const selected = option.value === value;
                    return (
                      <label
                        key={option.value}
                        className={cn(
                          "relative flex min-h-11 cursor-pointer items-start gap-2.5 rounded-[var(--wh-radius-sm)] border p-2.5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--wh-primary)]",
                          selected ? "border-[var(--wh-primary)] bg-[var(--wh-primary-soft)]" : "border-[var(--wh-border)]",
                        )}
                      >
                        <input
                          type="radio"
                          name={name}
                          value={option.value}
                          checked={selected}
                          onChange={() => {
                            onChange(option.value);
                            setOpen(false);
                          }}
                          className="sr-only"
                        />
                        <IconTile icon={option.icon} tone={option.tone} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-sm font-semibold leading-snug">{option.label}</span>
                            {option.value === suggested ? <Badge tone="handled">{words.suggested}</Badge> : null}
                          </span>
                          <span className="block text-xs text-[var(--wh-foreground-muted)]">{option.detail}</span>
                        </span>
                        {selected ? <Check aria-hidden className="size-4 shrink-0 text-[var(--wh-primary)]" /> : null}
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </fieldset>
  );
}
