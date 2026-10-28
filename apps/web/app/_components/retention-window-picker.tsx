"use client";

import { Clock } from "lucide-react";
import { startTransition, useActionState, useState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { IconTile } from "@wonderhome/core/ui/icon-tile";

import type { ActionState } from "../(auth)/actions";
import { saveRetentionWindowAction } from "../(auth)/consent-actions";

/**
 * How long the household keeps a passed, handled entry before cleanup removes
 * it (the owner, 2026-10-28; `docs/data-retention.md`). Picked, not typed
 * (rule 20), saved the moment it changes; an Admin's choice, so everyone else
 * sees what is set and who decides. "Keep everything" turns cleanup off.
 */
export function RetentionWindowPicker({
  householdId,
  value,
  options,
  manages,
  labels,
}: {
  householdId: string;
  /** The current choice: a day count as a string, or "off". */
  value: string;
  options: readonly string[];
  manages: boolean;
  labels: { title: string; detail: string; option: Record<string, string>; adminDecides: string };
}) {
  const [current, setCurrent] = useState(value);
  const [state, save, saving] = useActionState<ActionState, FormData>(saveRetentionWindowAction, {});

  const pick = (next: string) => {
    setCurrent(next);
    const data = new FormData();
    data.set("householdId", householdId);
    data.set("window", next);
    startTransition(() => save(data));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <IconTile icon={Clock} tone="primary" />
        <div className="min-w-0 flex-1">
          <p id="retention-window-title" className="text-sm font-semibold">
            {labels.title}
          </p>
          <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{labels.detail}</p>
        </div>
      </div>
      {manages ? (
        <select
          aria-labelledby="retention-window-title"
          value={current}
          disabled={saving}
          onChange={(event) => pick(event.target.value)}
          className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {labels.option[option]}
            </option>
          ))}
        </select>
      ) : (
        <>
          <p className="text-sm font-medium">{labels.option[current]}</p>
          <p className="text-xs text-[var(--wh-foreground-subtle)]">{labels.adminDecides}</p>
        </>
      )}
      {state.error ? <Alert>{state.error}</Alert> : null}
    </div>
  );
}
