"use client";

import { Pencil, Plus } from "lucide-react";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";
import { Pill } from "@wonderhome/core/ui/pill";
import { Sheet } from "@wonderhome/core/ui/sheet";

import type { ActionState } from "../(auth)/actions";
import { createConsumableAction, retireConsumableAction, updateConsumableAction } from "../(auth)/commerce-actions";

const CATEGORIES = [
  { value: "grocery", label: "Grocery" },
  { value: "household", label: "Household" },
  { value: "pet", label: "Pet" },
  { value: "personal", label: "Personal care" },
  { value: "medical", label: "Medical" },
];

export type ConsumableInitial = {
  id: string;
  name: string;
  category: string;
  unit: string;
  typicalQuantity: number;
  daysPerUnit: number | null;
};

/** The fields "add" and "edit" share — only the action and the submit label differ. */
function ConsumableFields({
  householdId,
  initial,
  state,
}: {
  householdId: string;
  initial?: ConsumableInitial;
  state: ActionState;
}) {
  return (
    <>
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
      <input type="hidden" name="householdId" value={householdId} />
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      <Field label="What is it?" name="name" required placeholder="Milk" autoComplete="off" defaultValue={initial?.name} />
      <div className="space-y-1.5">
        <label htmlFor="category" className="block text-sm font-medium">Category</label>
        <select
          id="category"
          name="category"
          defaultValue={initial?.category ?? "grocery"}
          className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Usual amount" name="typicalQuantity" type="number" min={0} step="0.1" required placeholder="2" defaultValue={initial?.typicalQuantity} />
        <Field label="Counted in" name="unit" required placeholder="bottle, kg, pack" autoComplete="off" defaultValue={initial?.unit} />
      </div>
      <Field
        label="Lasts about (days, optional)"
        name="daysPerUnit"
        type="number"
        min={1}
        placeholder="7"
        defaultValue={initial?.daysPerUnit ?? undefined}
        hint="Leave empty and WonderHome will work it out after a few purchases."
      />
    </>
  );
}

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? pendingLabel : label}
    </Button>
  );
}

/** "Add something" as a sheet — the manual half of the AI chat link. */
export function AddConsumableButton({ householdId }: { householdId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(createConsumableAction, {});

  return (
    <>
      <Pill type="button" tone="soft" onClick={() => setOpen(true)} className="gap-1.5">
        <Plus aria-hidden className="size-3.5" /> Add something
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title="Add something to track" description="What it is and how much you typically go through — WonderHome watches it from here.">
        <form action={formAction} className="space-y-3">
          <ConsumableFields householdId={householdId} state={state} />
          <Submit label="Add" pendingLabel="Adding…" />
        </form>
      </Sheet>
    </>
  );
}

/**
 * Editing or stopping tracking of something already added — the update and
 * delete half of "Add something", so every row has all three.
 */
export function ConsumableRowControls({ householdId, item }: { householdId: string; item: ConsumableInitial }) {
  const [open, setOpen] = useState(false);
  const [editState, editAction] = useActionState<ActionState, FormData>(updateConsumableAction, {});
  const [retireState, retireAction] = useActionState<ActionState, FormData>(retireConsumableAction, {});

  return (
    <div className="flex items-center gap-1.5">
      <Pill type="button" tone="quiet" onClick={() => setOpen(true)} className="gap-1">
        <Pencil aria-hidden className="size-3.5" /> Edit
      </Pill>
      <form action={retireAction}>
        <input type="hidden" name="id" value={item.id} />
        <input type="hidden" name="householdId" value={householdId} />
        <RetireSubmit />
      </form>
      {retireState.error ? <p className="text-xs text-[var(--wh-risk)]">{retireState.error}</p> : null}

      <Sheet open={open} onOpenChange={setOpen} title={`Edit ${item.name}`} description="Change what WonderHome knows about it, or how it counts it.">
        <form action={editAction} className="space-y-3">
          <ConsumableFields householdId={householdId} initial={item} state={editState} />
          <Submit label="Save changes" pendingLabel="Saving…" />
        </form>
      </Sheet>
    </div>
  );
}

function RetireSubmit() {
  const { pending } = useFormStatus();
  return (
    <Pill type="submit" tone="quiet" disabled={pending}>
      {pending ? "…" : "Stop tracking"}
    </Pill>
  );
}
