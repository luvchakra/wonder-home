"use client";

import { Archive } from "lucide-react";
import { startTransition, useActionState, useState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Switch } from "@wonderhome/core/ui/switch";

import type { ActionState } from "../(auth)/actions";
import { saveHomeSendTidyAction } from "../(auth)/consent-actions";

/**
 * "Tidy up items that no longer apply" (the owner, 2026-11-03): whether
 * HomeSend's daily tidy may archive waiting items whose day has passed, that
 * are already on record or that a newer one replaced — restorable for 30 days.
 * The one editor of it (rule 23), saved the moment it is flipped; an Admin's
 * switch, so anyone else sees what is set.
 */
export function HomeSendTidySwitch({
  householdId,
  on,
  manages,
  labels,
}: {
  householdId: string;
  on: boolean;
  manages: boolean;
  labels: { title: string; on: string; off: string; detail: string; adminDecides: string };
}) {
  const [checked, setChecked] = useState(on);
  const [state, save, saving] = useActionState<ActionState, FormData>(saveHomeSendTidyAction, {});

  const flip = (next: boolean) => {
    setChecked(next);
    const data = new FormData();
    data.set("householdId", householdId);
    data.set("on", next ? "on" : "off");
    startTransition(() => save(data));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <IconTile icon={Archive} tone="ai" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{labels.title}</p>
          <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]" aria-live="polite">
            {checked ? labels.on : labels.off}
          </p>
          <p className="mt-1 text-xs text-[var(--wh-foreground-subtle)]">{labels.detail}</p>
        </div>
        {manages ? <Switch checked={checked} onCheckedChange={flip} disabled={saving} label={labels.title} className="mt-0.5" /> : null}
      </div>
      {manages ? null : <p className="text-xs text-[var(--wh-foreground-subtle)]">{labels.adminDecides}</p>}
      {state.error ? <Alert>{state.error}</Alert> : null}
    </div>
  );
}
