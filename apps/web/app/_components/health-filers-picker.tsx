"use client";

import { HeartPulse } from "lucide-react";
import { startTransition, useActionState, useState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { IconTile } from "@wonderhome/core/ui/icon-tile";

import type { ActionState } from "../(auth)/actions";
import { saveHealthFilersAction } from "../(auth)/consent-actions";

/**
 * "Who may file health records for others" (the owner, 2026-11-20), in
 * Settings → AI Assistant beside "Money and health entries". An Admin ticks
 * the adults (and, only by ticking them, a helper) whose health documents
 * naming another household member are filed for that person at once, marked
 * Checking. Children are never offered. Picked, not typed (rule 20), saved
 * the moment it changes, and its one editor (rule 23); anyone else sees who
 * is on it.
 */
export function HealthFilersPicker({
  householdId,
  members,
  selected,
  manages,
  labels,
  folded = false,
}: {
  householdId: string;
  members: readonly { id: string; name: string; helper: boolean }[];
  selected: readonly string[];
  manages: boolean;
  labels: { title: string; detail: string; nobody: string; helper: string; adminDecides: string };
  /** Inside a folding card (`CollapsibleSection`), which shows the tile and title itself. */
  folded?: boolean;
}) {
  const [chosen, setChosen] = useState<string[]>(() => selected.filter((id) => members.some((member) => member.id === id)));
  const [state, save, saving] = useActionState<ActionState, FormData>(saveHealthFilersAction, {});
  const titleId = "health-filers-title";

  const toggle = (id: string, on: boolean) => {
    const next = on ? [...chosen, id] : chosen.filter((each) => each !== id);
    setChosen(next);
    const data = new FormData();
    data.set("householdId", householdId);
    for (const each of next) data.append("members", each);
    startTransition(() => save(data));
  };

  const names = members.filter((member) => chosen.includes(member.id)).map((member) => member.name);

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        {folded ? null : <IconTile icon={HeartPulse} tone="health" />}
        <div className="min-w-0 flex-1">
          <p id={titleId} className={folded ? "sr-only" : "text-sm font-semibold"}>
            {labels.title}
          </p>
          <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{labels.detail}</p>
        </div>
      </div>
      {manages ? (
        <ul aria-labelledby={titleId} className="space-y-1">
          {members.map((member) => (
            <li key={member.id}>
              <label className="flex min-h-11 items-center gap-3 rounded-[var(--wh-radius-sm)] px-1">
                <input
                  type="checkbox"
                  className="size-5 shrink-0 accent-[var(--wh-primary)]"
                  checked={chosen.includes(member.id)}
                  disabled={saving}
                  onChange={(event) => toggle(member.id, event.target.checked)}
                />
                <span className="min-w-0 flex-1 text-base break-words">
                  {member.name}
                  {member.helper ? <span className="ml-1 text-xs text-[var(--wh-foreground-subtle)]">{labels.helper}</span> : null}
                </span>
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <p className="text-sm font-medium break-words">{names.length > 0 ? names.join(", ") : labels.nobody}</p>
          <p className="text-xs text-[var(--wh-foreground-subtle)]">{labels.adminDecides}</p>
        </>
      )}
      {state.error ? <Alert>{state.error}</Alert> : null}
    </div>
  );
}
