import { cn } from "../../lib/cn";

export type ChoiceChip = { value: string; label: string };

/**
 * A short, known set of answers shown all at once as chips — "Work from
 * home", the days a helper comes — for when the whole set fits on a line or
 * two and seeing every option helps more than a menu would (rule 20: a
 * choice is picked, not typed).
 *
 * They are real radio buttons or checkboxes under the chip styling, so the
 * group posts without script, arrows move within a radio group, and the
 * chosen chip says so in its own fill as well as to a screen reader. Chips
 * wrap; none is ever cut to fit (rule 15).
 */
export function ChoiceChips({
  legend,
  name,
  options,
  type = "radio",
  defaultValue,
  legendHidden = false,
  size = "md",
  className,
}: {
  legend: string;
  name: string;
  options: readonly ChoiceChip[];
  /** A radio group picks one; a checkbox group any number. */
  type?: "radio" | "checkbox";
  defaultValue?: string | readonly string[] | null;
  /** Keep the legend for screen readers only, when a heading above already says it. */
  legendHidden?: boolean;
  /** "sm" for a row of short chips like days of the week. */
  size?: "sm" | "md";
  className?: string;
}) {
  const chosen = new Set(defaultValue == null ? [] : typeof defaultValue === "string" ? [defaultValue] : defaultValue);

  return (
    <fieldset className={cn("min-w-0 space-y-2", className)}>
      <legend className={cn("text-sm font-medium", legendHidden && "sr-only")}>{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label key={option.value} className="relative cursor-pointer">
            <input
              type={type}
              name={name}
              value={option.value}
              defaultChecked={chosen.has(option.value)}
              className="peer absolute inset-0 size-full cursor-pointer opacity-0"
            />
            <span
              className={cn(
                "flex items-center justify-center rounded-[var(--wh-radius-pill)] border border-[var(--wh-border)] bg-[var(--wh-surface)] font-medium text-[var(--wh-foreground-muted)] transition-colors",
                "peer-checked:border-[var(--wh-primary)] peer-checked:bg-[var(--wh-primary-soft)] peer-checked:text-[var(--wh-primary)]",
                "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--wh-primary)]",
                size === "sm" ? "min-h-10 min-w-11 px-2.5 text-xs" : "min-h-11 px-4 text-sm",
              )}
            >
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
