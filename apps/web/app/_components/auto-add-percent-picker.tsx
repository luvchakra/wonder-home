"use client";

import { Gauge } from "lucide-react";
import { startTransition, useActionState, useState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { IconTile } from "@wonderhome/core/ui/icon-tile";

import type { ActionState } from "../(auth)/actions";
import { saveAutoAddPercentAction } from "../(auth)/consent-actions";

/**
 * How sure HomeSend must be before it adds an entry on its own (the owner,
 * 2026-10-26). Picked, not typed (rule 20), and saved the moment it changes;
 * an Admin's choice, so anyone else sees what is set and who decides.
 */
export function AutoAddPercentPicker({
  householdId,
  percent,
  options,
  manages,
  labels,
}: {
  householdId: string;
  percent: number;
  options: readonly number[];
  manages: boolean;
  labels: { title: string; detail: string; option: Record<number, string>; adminDecides: string };
}) {
  const [value, setValue] = useState(percent);
  const [state, save, saving] = useActionState<ActionState, FormData>(saveAutoAddPercentAction, {});

  const pick = (next: number) => {
    setValue(next);
    const data = new FormData();
    data.set("householdId", householdId);
    data.set("percent", String(next));
    startTransition(() => save(data));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <IconTile icon={Gauge} tone="primary" />
        <div className="min-w-0 flex-1">
          <p id="auto-add-percent-title" className="text-sm font-semibold">
            {labels.title}
          </p>
          <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{labels.detail}</p>
        </div>
      </div>
      {manages ? (
        <select
          aria-labelledby="auto-add-percent-title"
          value={value}
          disabled={saving}
          onChange={(event) => pick(Number(event.target.value))}
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
          <p className="text-sm font-medium">{labels.option[value]}</p>
          <p className="text-xs text-[var(--wh-foreground-subtle)]">{labels.adminDecides}</p>
        </>
      )}
      {state.error ? <Alert>{state.error}</Alert> : null}
    </div>
  );
}
