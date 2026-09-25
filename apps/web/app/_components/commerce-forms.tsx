"use client";

import { Archive, Pencil, Plus } from "lucide-react";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { ComboboxField } from "@wonderhome/core/ui/combobox-field";
import { Field } from "@wonderhome/core/ui/field";
import { Pill } from "@wonderhome/core/ui/pill";
import { Sheet } from "@wonderhome/core/ui/sheet";

import type { ActionState } from "../(auth)/actions";
import { createConsumableAction, retireConsumableAction, updateConsumableAction } from "../(auth)/commerce-actions";

// Lowercase, matching every category value the closed enum ever stored (and
// the "pet" value consumables_pet_is_pet_category still requires verbatim) —
// what's shown here is exactly what gets stored, no separate value/label.
const CATEGORIES = ["grocery", "household", "pet", "personal", "medical"];

/** Common units households actually use — suggestions, never the only valid answer (the field stays free text). */
const UNITS = ["piece", "kg", "g", "litre", "ml", "pack", "bottle", "box", "dozen"];

/**
 * The add/edit sheet's words in the viewer's language, built on the server
 * by `groceryFormLabels` (story 22-004). `{name}` stays a placeholder and is
 * filled in here with the item's own name, which is never translated.
 */
export type ConsumableFormLabels = {
  add: string;
  title: string;
  description: string;
  name: string;
  namePlaceholder: string;
  nameNew: string;
  category: string;
  categoryPlaceholder: string;
  categoryNew: string;
  usualAmount: string;
  unit: string;
  unitPlaceholder: string;
  unitNew: string;
  lasts: string;
  lastsHint: string;
  addNew: string;
  chooseExisting: string;
  submit: string;
  adding: string;
  edit: string;
  editDescription: string;
  save: string;
  saving: string;
  stop: string;
};

const withName = (template: string, name: string) => template.replace("{name}", () => name);

export type ConsumableInitial = {
  id: string;
  name: string;
  category: string;
  unit: string;
  typicalQuantity: number;
  daysPerUnit: number | null;
};

/**
 * The fields "add" and "edit" share — only the action and the submit label
 * differ.
 *
 * Name, category and unit are all free text at the database level already
 * (rule 12 doesn't just mean add/update/remove for an entity — a field
 * that already has real answers, like these three, should offer them
 * rather than make a household retype an existing one or guess the exact
 * spelling of a category it already used). Each is a `ComboboxField`: a
 * real dropdown of the household's own existing values (plus `CATEGORIES`/
 * `UNITS` as a starting point when there's nothing to suggest yet) with its
 * own explicit "Add new…" option — never a fixed list that refuses a name,
 * category or unit nobody has used before.
 */
function ConsumableFields({
  householdId,
  initial,
  state,
  existingNames = [],
  existingCategories = [],
  labels,
}: {
  householdId: string;
  initial?: ConsumableInitial;
  state: ActionState;
  /** Every other active consumable's name in this household, for the "What is it?" options. */
  existingNames?: string[];
  /** Every distinct category this household has already used, for the Category options. */
  existingCategories?: string[];
  labels: ConsumableFormLabels;
}) {
  const categoryOptions = Array.from(new Set([...existingCategories, ...CATEGORIES])).sort((a, b) => a.localeCompare(b));
  const unitOptions = Array.from(new Set([initial?.unit, ...UNITS].filter((value): value is string => Boolean(value))));
  const picker = { addNewLabel: labels.addNew, chooseExistingLabel: labels.chooseExisting };

  return (
    <>
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
      <input type="hidden" name="householdId" value={householdId} />
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      <ComboboxField label={labels.name} name="name" required options={existingNames} defaultValue={initial?.name} placeholder={labels.namePlaceholder} newValuePlaceholder={labels.nameNew} {...picker} />
      <ComboboxField label={labels.category} name="category" required options={categoryOptions} defaultValue={initial?.category ?? "grocery"} placeholder={labels.categoryPlaceholder} newValuePlaceholder={labels.categoryNew} {...picker} />
      <div className="grid grid-cols-2 gap-3">
        <Field label={labels.usualAmount} name="typicalQuantity" type="number" min={0} step="0.1" required placeholder="2" defaultValue={initial?.typicalQuantity} />
        <ComboboxField label={labels.unit} name="unit" required options={unitOptions} defaultValue={initial?.unit} placeholder={labels.unitPlaceholder} newValuePlaceholder={labels.unitNew} {...picker} />
      </div>
      <Field
        label={labels.lasts}
        name="daysPerUnit"
        type="number"
        min={1}
        placeholder="7"
        defaultValue={initial?.daysPerUnit ?? undefined}
        hint={labels.lastsHint}
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
export function AddConsumableButton({
  householdId,
  existingNames = [],
  existingCategories = [],
  labels,
}: {
  householdId: string;
  existingNames?: string[];
  existingCategories?: string[];
  labels: ConsumableFormLabels;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(createConsumableAction, {});

  return (
    <>
      <Pill type="button" tone="soft" onClick={() => setOpen(true)} className="gap-1.5">
        <Plus aria-hidden className="size-3.5" /> {labels.add}
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title={labels.title} description={labels.description}>
        <form action={formAction} className="space-y-3">
          <ConsumableFields householdId={householdId} state={state} existingNames={existingNames} existingCategories={existingCategories} labels={labels} />
          <Submit label={labels.submit} pendingLabel={labels.adding} />
        </form>
      </Sheet>
    </>
  );
}

/**
 * Editing or stopping tracking of something already added — the update and
 * delete half of "Add something", so every row has all three.
 */
export function ConsumableRowControls({
  householdId,
  item,
  existingNames = [],
  existingCategories = [],
  labels,
}: {
  householdId: string;
  item: ConsumableInitial;
  existingNames?: string[];
  existingCategories?: string[];
  labels: ConsumableFormLabels;
}) {
  const [open, setOpen] = useState(false);
  const [editState, editAction] = useActionState<ActionState, FormData>(updateConsumableAction, {});
  const [retireState, retireAction] = useActionState<ActionState, FormData>(retireConsumableAction, {});
  const editLabel = withName(labels.edit, item.name);

  return (
    <div className="flex items-center gap-1.5">
      <Pill type="button" tone="quiet" onClick={() => setOpen(true)} aria-label={editLabel} title={editLabel}>
        <Pencil aria-hidden className="size-3.5" />
      </Pill>
      <form action={retireAction}>
        <input type="hidden" name="id" value={item.id} />
        <input type="hidden" name="householdId" value={householdId} />
        <RetireSubmit label={withName(labels.stop, item.name)} />
      </form>
      {retireState.error ? <p className="text-xs text-[var(--wh-risk)]">{retireState.error}</p> : null}

      <Sheet open={open} onOpenChange={setOpen} title={editLabel} description={labels.editDescription}>
        <form action={editAction} className="space-y-3">
          <ConsumableFields householdId={householdId} initial={item} state={editState} existingNames={existingNames} existingCategories={existingCategories} labels={labels} />
          <Submit label={labels.save} pendingLabel={labels.saving} />
        </form>
      </Sheet>
    </div>
  );
}

function RetireSubmit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Pill type="submit" tone="quiet" disabled={pending} aria-label={label} title={label}>
      {pending ? "…" : <Archive aria-hidden className="size-3.5" />}
    </Pill>
  );
}
