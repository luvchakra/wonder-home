"use client";

import { Pencil } from "lucide-react";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Pill } from "@wonderhome/core/ui/pill";
import { Sheet } from "@wonderhome/core/ui/sheet";

import type { ActionState } from "../(auth)/actions";
import { retirePolicyAction, savePlaybookAction, savePolicyAction, setPlaybookActiveAction } from "../(auth)/configuration-actions";
import { PlaybookForm, PolicyForm, type ConfigFormLabels, type PlaybookInitial, type PolicyInitial } from "./config-forms";

/** The row controls' words in the viewer's language, built by `playbookControlLabels` (story 22-004). */
export type PlaybookControlLabels = {
  edit: string;
  pause: string;
  resume: string;
  standDown: string;
  playbookSheetLede: string;
  policySheetLede: string;
  form: ConfigFormLabels;
};

/**
 * Editing and pausing what was only ever addable. Responsibilities could be
 * edited from their row; the playbook and the policies — the same kind of
 * thing — could only be appended to from the wizard, and "paused" was a word
 * on screen with nothing anywhere that could set it.
 */

function Submit({ label, tone = "quiet" }: { label: string; tone?: "quiet" | "soft" | "primary" }) {
  const { pending } = useFormStatus();
  return (
    <Pill type="submit" tone={tone} disabled={pending}>
      {pending ? "…" : label}
    </Pill>
  );
}

function Feedback({ state }: { state: ActionState }) {
  if (state.error) return <p className="w-full text-xs text-[var(--wh-risk)]">{state.error}</p>;
  if (state.notice) return <p className="w-full text-xs text-[var(--wh-foreground-muted)]">{state.notice}</p>;
  return null;
}

export function PlaybookRowControls({
  householdId,
  item,
  active,
  existing,
  labels,
}: {
  householdId: string;
  item: PlaybookInitial;
  active: boolean;
  existing: { key: string; label: string }[];
  labels: PlaybookControlLabels;
}) {
  const [open, setOpen] = useState(false);
  const [state, toggle] = useActionState<ActionState, FormData>(setPlaybookActiveAction, {});

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <Pill type="button" tone="quiet" onClick={() => setOpen(true)} className="gap-1.5">
        <Pencil aria-hidden className="size-3.5" /> {labels.edit}
      </Pill>
      <form action={toggle}>
        <input type="hidden" name="householdId" value={householdId} />
        <input type="hidden" name="outcomeKey" value={item.outcomeKey} />
        <input type="hidden" name="active" value={active ? "false" : "true"} />
        <Submit label={active ? labels.pause : labels.resume} tone={active ? "quiet" : "soft"} />
      </form>
      <Feedback state={state} />

      <Sheet open={open} onOpenChange={setOpen} title={item.name} description={labels.playbookSheetLede}>
        <PlaybookForm action={savePlaybookAction} householdId={householdId} existing={existing} initial={item} labels={labels.form} />
      </Sheet>
    </div>
  );
}

export function PolicyRowControls({ householdId, policyId, policy, labels }: { householdId: string; policyId: string; policy: PolicyInitial; labels: PlaybookControlLabels }) {
  const [open, setOpen] = useState(false);
  const [state, retire] = useActionState<ActionState, FormData>(retirePolicyAction, {});

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <Pill type="button" tone="quiet" onClick={() => setOpen(true)} className="gap-1.5">
        <Pencil aria-hidden className="size-3.5" /> {labels.edit}
      </Pill>
      <form action={retire}>
        <input type="hidden" name="householdId" value={householdId} />
        <input type="hidden" name="policyId" value={policyId} />
        <Submit label={labels.standDown} />
      </form>
      <Feedback state={state} />

      <Sheet open={open} onOpenChange={setOpen} title={policy.name} description={labels.policySheetLede}>
        <PolicyForm action={savePolicyAction} householdId={householdId} initial={policy} labels={labels.form} />
      </Sheet>
    </div>
  );
}
