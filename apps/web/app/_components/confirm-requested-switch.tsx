"use client";

import { MessageCircleQuestion } from "lucide-react";
import { startTransition, useActionState, useState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Switch } from "@wonderhome/core/ui/switch";

import type { ActionState } from "../(auth)/actions";
import { saveConfirmRequestedAction } from "../(auth)/consent-actions";

/**
 * "Ask before acting on what I say" (HomeBrain 4.0 §3.9, story 14-025).
 * Off, a clear request in HomeTalk is done at once and can be undone; on,
 * each one is asked about first, in the conversation. Saved the moment it is
 * flipped; an Admin's switch, so anyone else sees what is set and who decides.
 */
export function ConfirmRequestedSwitch({
  householdId,
  confirm,
  manages,
  labels,
}: {
  householdId: string;
  confirm: boolean;
  manages: boolean;
  labels: { title: string; on: string; off: string; adminDecides: string };
}) {
  const [checked, setChecked] = useState(confirm);
  const [state, save, saving] = useActionState<ActionState, FormData>(saveConfirmRequestedAction, {});

  const flip = (next: boolean) => {
    setChecked(next);
    const data = new FormData();
    data.set("householdId", householdId);
    data.set("confirm", next ? "on" : "off");
    startTransition(() => save(data));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <IconTile icon={MessageCircleQuestion} tone="primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{labels.title}</p>
          <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]" aria-live="polite">
            {checked ? labels.on : labels.off}
          </p>
        </div>
        {manages ? <Switch checked={checked} onCheckedChange={flip} disabled={saving} label={labels.title} className="mt-0.5" /> : null}
      </div>
      {manages ? null : <p className="text-xs text-[var(--wh-foreground-subtle)]">{labels.adminDecides}</p>}
      {state.error ? <Alert>{state.error}</Alert> : null}
    </div>
  );
}
