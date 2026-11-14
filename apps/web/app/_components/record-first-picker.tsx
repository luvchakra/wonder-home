"use client";

import { Hourglass, Mail, Wallet } from "lucide-react";
import { startTransition, useActionState, useState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { IconTile } from "@wonderhome/core/ui/icon-tile";

import type { ActionState } from "../(auth)/actions";
import { saveRecordFirstAction } from "../(auth)/consent-actions";

const ICONS = { approvalScope: Hourglass, moneyHealth: Wallet, outsideSenders: Mail } as const;
const TONES = { approvalScope: "primary", moneyHealth: "money", outsideSenders: "primary" } as const;

/**
 * One of the three "Record first" choices (the owner, 2026-11-14,
 * `homesend/record-first.ts`): what "Wait for Approval" holds, how money and
 * health entries are recorded, and email from new senders. Picked, not typed
 * (rule 20), saved the moment it changes, and the one editor of each
 * (rule 23); an Admin's choice, so anyone else sees what is set.
 */
export function RecordFirstPicker({
  householdId,
  setting,
  value,
  options,
  manages,
  labels,
}: {
  householdId: string;
  setting: keyof typeof ICONS;
  value: string;
  options: readonly string[];
  manages: boolean;
  labels: { title: string; detail: string; option: Record<string, string>; adminDecides: string };
}) {
  const [current, setCurrent] = useState(value);
  const [state, save, saving] = useActionState<ActionState, FormData>(saveRecordFirstAction, {});
  const titleId = `record-first-${setting}-title`;

  const pick = (next: string) => {
    setCurrent(next);
    const data = new FormData();
    data.set("householdId", householdId);
    data.set("setting", setting);
    data.set("value", next);
    startTransition(() => save(data));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <IconTile icon={ICONS[setting]} tone={TONES[setting]} />
        <div className="min-w-0 flex-1">
          <p id={titleId} className="text-sm font-semibold">
            {labels.title}
          </p>
          <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{labels.detail}</p>
        </div>
      </div>
      {manages ? (
        <select
          aria-labelledby={titleId}
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
