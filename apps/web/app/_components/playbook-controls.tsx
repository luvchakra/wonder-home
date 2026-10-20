"use client";

import { Archive, Pause, Pencil, Play, type LucideIcon } from "lucide-react";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

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

// Icon actions with their words as the accessible name (rule 11): the row's room belongs to the name, not to text buttons.
const ICON_BUTTON =
  "grid size-9 shrink-0 place-items-center rounded-full text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)] hover:text-[var(--wh-foreground)] disabled:opacity-50";

function Submit({ label, icon: Icon }: { label: string; icon: LucideIcon }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" aria-label={label} title={label} disabled={pending} className={ICON_BUTTON}>
      <Icon aria-hidden className="size-4" />
    </button>
  );
}

function EditButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={ICON_BUTTON}>
      <Pencil aria-hidden className="size-4" />
    </button>
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
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-0.5">
      <EditButton label={labels.edit} onClick={() => setOpen(true)} />
      <form action={toggle}>
        <input type="hidden" name="householdId" value={householdId} />
        <input type="hidden" name="outcomeKey" value={item.outcomeKey} />
        <input type="hidden" name="active" value={active ? "false" : "true"} />
        <Submit label={active ? labels.pause : labels.resume} icon={active ? Pause : Play} />
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
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-0.5">
      <EditButton label={labels.edit} onClick={() => setOpen(true)} />
      <form action={retire}>
        <input type="hidden" name="householdId" value={householdId} />
        <input type="hidden" name="policyId" value={policyId} />
        <Submit label={labels.standDown} icon={Archive} />
      </form>
      <Feedback state={state} />

      <Sheet open={open} onOpenChange={setOpen} title={policy.name} description={labels.policySheetLede}>
        <PolicyForm action={savePolicyAction} householdId={householdId} initial={policy} labels={labels.form} />
      </Sheet>
    </div>
  );
}
