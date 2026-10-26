"use client";

import { HeartPulse, Wallet } from "lucide-react";
import { startTransition, useActionState, useState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Switch } from "@wonderhome/core/ui/switch";

import type { ActionState } from "../(auth)/actions";
import { saveDirectAddAction } from "../(auth)/consent-actions";

/**
 * "Add money entries directly" and "Add health entries directly" (the owner,
 * 2026-10-26): whether a bill or receipt, or a health document, may be added
 * on its own at all — still only where its responsibility is Pre Approved and
 * the reading clears the bar. The one editor of each (rule 23), saved the
 * moment it is flipped; an Admin's switch, so anyone else sees what is set.
 */
export function DirectAddSwitch({
  householdId,
  area,
  on,
  manages,
  labels,
}: {
  householdId: string;
  area: "money" | "health";
  on: boolean;
  manages: boolean;
  labels: { title: string; on: string; off: string; files: string; adminDecides: string };
}) {
  const [checked, setChecked] = useState(on);
  const [state, save, saving] = useActionState<ActionState, FormData>(saveDirectAddAction, {});

  const flip = (next: boolean) => {
    setChecked(next);
    const data = new FormData();
    data.set("householdId", householdId);
    data.set("area", area);
    data.set("on", next ? "on" : "off");
    startTransition(() => save(data));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <IconTile icon={area === "money" ? Wallet : HeartPulse} tone={area === "money" ? "money" : "health"} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{labels.title}</p>
          <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]" aria-live="polite">
            {checked ? labels.on : labels.off}
          </p>
          <p className="mt-1 text-xs text-[var(--wh-foreground-subtle)]">{labels.files}</p>
        </div>
        {manages ? <Switch checked={checked} onCheckedChange={flip} disabled={saving} label={labels.title} className="mt-0.5" /> : null}
      </div>
      {manages ? null : <p className="text-xs text-[var(--wh-foreground-subtle)]">{labels.adminDecides}</p>}
      {state.error ? <Alert>{state.error}</Alert> : null}
    </div>
  );
}
