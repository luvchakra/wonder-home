"use client";

import { Archive, Camera, Minus, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  roundQuantity,
  stepInBase,
  unitInfo,
  UNIT_CHOICES,
} from "@wonderhome/core/commerce/units";
import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { ComboboxField } from "@wonderhome/core/ui/combobox-field";
import { Field } from "@wonderhome/core/ui/field";

import type { ActionState } from "../../(auth)/actions";
import {
  changeStockAction,
  groceryPhotoAction,
  setUseByAction,
  stopTrackingGroceryAction,
  updateGroceryItemAction,
} from "../../(auth)/grocery-actions";
import type { GroceryWords } from "../../_lib/grocery-words";
import { fill, newKey, sayAmount } from "../_components/amounts";
import { AmountSheet, type StepperItem } from "../_components/to-buy-stepper";

export type StockLabels = {
  amount: string;
  less: string;
  more: string;
  update: string;
  updating: string;
  saved: string;
  clamped: string;
  conflict: string;
  unknown: string;
  adultsOnly: string;
};

/**
 * "In your stock" (design §3.2): what is at home, said with who confirmed it
 * and how, and the only place it is changed by hand. The −/+ move a draft;
 * nothing is written until "Update stock", with the version the page read,
 * so a change someone else made in between is shown, never overwritten.
 */
export function StockEditor({
  householdId,
  item,
  stock,
  canEdit,
  labels,
  words,
}: {
  householdId: string;
  item: StepperItem;
  stock: { quantity: number; unit: string; version: number } | null;
  canEdit: boolean;
  labels: StockLabels;
  words: Pick<
    GroceryWords,
    "language" | "unitWords" | "unitNames" | "amountSheet"
  >;
}) {
  const router = useRouter();
  const base = unitInfo(item.unit).base;
  const step = stepInBase(item.unit, item.step);
  const [draft, setDraft] = useState<number | null>(stock?.quantity ?? null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    tone: "ok" | "error";
    text: string;
  } | null>(null);
  const changed = draft !== null && draft !== (stock?.quantity ?? null);

  if (!canEdit)
    return (
      <p className="text-sm text-[var(--wh-foreground-muted)]">
        {labels.adultsOnly}
      </p>
    );

  const nudge = (direction: 1 | -1) =>
    setDraft((current) =>
      Math.max(0, roundQuantity((current ?? 0) + direction * step.quantity)),
    );

  const save = async () => {
    if (draft === null) return;
    setBusy(true);
    const result = await changeStockAction({
      householdId,
      itemId: item.id,
      kind: "set",
      quantity: draft,
      unit: base,
      key: newKey("stock"),
      expectedVersion: stock?.version ?? null,
    });
    setBusy(false);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.error });
      return;
    }
    if (result.conflict) {
      setMessage({ tone: "error", text: labels.conflict });
      setDraft(result.after);
      router.refresh();
      return;
    }
    setMessage({
      tone: "ok",
      text: fill(labels.saved, {
        name: item.name,
        amount: sayAmount(
          words,
          { quantity: result.after, unit: result.unit },
          item.unit,
        ),
      }),
    });
    router.refresh();
  };

  return (
    <div className="space-y-3">
      <div
        role="group"
        aria-label={labels.amount}
        className="flex items-center justify-between gap-2 rounded-[var(--wh-radius)] border border-[var(--wh-border)] p-2"
      >
        <button
          type="button"
          aria-label={fill(labels.less, { name: item.name })}
          disabled={(draft ?? 0) <= 0}
          onClick={() => nudge(-1)}
          className="grid size-11 place-items-center rounded-full bg-[var(--wh-surface-muted)] text-[var(--wh-foreground-muted)] disabled:opacity-40"
        >
          <Minus aria-hidden className="size-5" />
        </button>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="min-h-11 flex-1 rounded-[var(--wh-radius-sm)] text-center text-xl font-bold tabular-nums hover:bg-[var(--wh-surface-muted)]"
        >
          {draft === null
            ? "—"
            : sayAmount(words, { quantity: draft, unit: base }, item.unit)}
        </button>
        <button
          type="button"
          aria-label={fill(labels.more, { name: item.name })}
          onClick={() => nudge(1)}
          className="grid size-11 place-items-center rounded-full bg-[var(--wh-primary-soft)] text-[var(--wh-primary)]"
        >
          <Plus aria-hidden className="size-5" />
        </button>
      </div>
      <Button
        type="button"
        onClick={() => void save()}
        disabled={!changed || busy}
        className="w-full"
      >
        {busy ? labels.updating : labels.update}
      </Button>
      <p
        aria-live="polite"
        className={`text-sm ${message?.tone === "error" ? "text-[var(--wh-risk)]" : "text-[var(--wh-handled)]"}`}
      >
        {message?.text ?? ""}
      </p>
      <AmountSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        item={item}
        title={labels.amount}
        current={{ quantity: draft ?? 0, unit: base }}
        words={words}
        allowRemove={false}
        onSave={async (_kind, amount) => {
          if (amount) setDraft(amount.quantity);
          return null;
        }}
      />
    </div>
  );
}

function Submit({
  label,
  pending,
  variant = "primary",
  className,
}: {
  label: string;
  pending: string;
  variant?: "primary" | "secondary" | "quiet";
  className?: string;
}) {
  const status = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      disabled={status.pending}
      className={className}
    >
      {status.pending ? pending : label}
    </Button>
  );
}

function Feedback({ state }: { state: ActionState }) {
  if (state.error) return <Alert>{state.error}</Alert>;
  if (state.notice)
    return (
      <p role="status" className="text-sm text-[var(--wh-handled)]">
        {state.notice}
      </p>
    );
  return null;
}

/** A use-by date someone read off the pack. */
export function UseByForm({
  householdId,
  itemId,
  useBy,
  labels,
}: {
  householdId: string;
  itemId: string;
  useBy: string | null;
  labels: { label: string; save: string; clear: string; saving: string };
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    setUseByAction,
    {},
  );
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="itemId" value={itemId} />
      <Field
        label={labels.label}
        name="useBy"
        type="date"
        defaultValue={useBy ?? ""}
      />
      <div className="flex flex-wrap gap-2">
        <Submit
          label={labels.save}
          pending={labels.saving}
          variant="secondary"
        />
        {useBy ? (
          <Button type="submit" variant="quiet" name="clear" value="1">
            {labels.clear}
          </Button>
        ) : null}
      </div>
      <Feedback state={state} />
    </form>
  );
}

export type DetailsLabels = {
  name: string;
  category: string;
  categoryPlaceholder: string;
  categoryNew: string;
  unit: string;
  step: string;
  stepHint: string;
  lowLevel: string;
  lowLevelHint: string;
  storage: string;
  storageOptions: Record<
    "" | "fridge" | "freezer" | "pantry" | "other",
    string
  >;
  note: string;
  aliases: string;
  aliasesHint: string;
  save: string;
  saving: string;
  addNew: string;
  chooseExisting: string;
};

/** Everything about the item other than its amounts. */
export function DetailsForm({
  householdId,
  item,
  categories,
  labels,
  unitNames,
}: {
  householdId: string;
  item: {
    id: string;
    name: string;
    category: string;
    unit: string;
    step: number | null;
    lowLevelInUnit: number | null;
    storage: string | null;
    note: string | null;
    aliases: string[];
    typicalQuantity: number;
    daysPerUnit: number | null;
  };
  categories: string[];
  labels: DetailsLabels;
  unitNames: Record<string, string>;
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    updateGroceryItemAction,
    {},
  );
  const units = [...new Set([item.unit, ...UNIT_CHOICES])];
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="itemId" value={item.id} />
      <input
        type="hidden"
        name="typicalQuantity"
        value={item.typicalQuantity}
      />
      <input type="hidden" name="daysPerUnit" value={item.daysPerUnit ?? ""} />
      <Field
        label={labels.name}
        name="name"
        required
        defaultValue={item.name}
        maxLength={120}
      />
      <ComboboxField
        label={labels.category}
        name="category"
        required
        options={categories}
        defaultValue={item.category}
        placeholder={labels.categoryPlaceholder}
        newValuePlaceholder={labels.categoryNew}
        addNewLabel={labels.addNew}
        chooseExistingLabel={labels.chooseExisting}
      />
      <ComboboxField
        label={labels.unit}
        name="unit"
        required
        options={units}
        optionLabels={unitNames}
        defaultValue={item.unit}
        addNewLabel={labels.addNew}
        chooseExistingLabel={labels.chooseExisting}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label={labels.step}
          name="step"
          inputMode="decimal"
          defaultValue={item.step ?? ""}
          hint={labels.stepHint}
        />
        <Field
          label={labels.lowLevel}
          name="lowLevel"
          inputMode="decimal"
          defaultValue={item.lowLevelInUnit ?? ""}
          hint={labels.lowLevelHint}
        />
      </div>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">{labels.storage}</span>
        <select
          name="storage"
          defaultValue={item.storage ?? ""}
          className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
        >
          {(
            Object.keys(
              labels.storageOptions,
            ) as (keyof DetailsLabels["storageOptions"])[]
          ).map((value) => (
            <option key={value} value={value}>
              {labels.storageOptions[value]}
            </option>
          ))}
        </select>
      </label>
      <Field
        label={labels.aliases}
        name="aliases"
        defaultValue={item.aliases.join(", ")}
        hint={labels.aliasesHint}
        maxLength={400}
      />
      <Field
        label={labels.note}
        name="note"
        defaultValue={item.note ?? ""}
        maxLength={300}
      />
      <Feedback state={state} />
      <Submit label={labels.save} pending={labels.saving} className="w-full" />
    </form>
  );
}

/** The household's own photo of the item — added, changed or taken away. */
export function PhotoForm({
  householdId,
  itemId,
  hasPhoto,
  labels,
}: {
  householdId: string;
  itemId: string;
  hasPhoto: boolean;
  labels: { add: string; change: string; remove: string; saving: string };
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    groceryPhotoAction,
    {},
  );
  const [chosen, setChosen] = useState(false);
  return (
    <div className="space-y-2">
      <form action={action} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="householdId" value={householdId} />
        <input type="hidden" name="itemId" value={itemId} />
        <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-[var(--wh-radius-pill)] bg-[var(--wh-primary-soft)] px-3.5 text-sm font-semibold text-[var(--wh-primary)]">
          <Camera aria-hidden className="size-4" />
          {hasPhoto ? labels.change : labels.add}
          <input
            type="file"
            name="photo"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(event) => setChosen(Boolean(event.target.files?.length))}
          />
        </label>
        {chosen ? (
          <Submit
            label={labels.change}
            pending={labels.saving}
            variant="secondary"
          />
        ) : null}
      </form>
      {hasPhoto ? (
        <form action={action}>
          <input type="hidden" name="householdId" value={householdId} />
          <input type="hidden" name="itemId" value={itemId} />
          <input type="hidden" name="remove" value="1" />
          <Submit
            label={labels.remove}
            pending={labels.saving}
            variant="quiet"
          />
        </form>
      ) : null}
      <Feedback state={state} />
    </div>
  );
}

/** Stop tracking — the item's history stays, and Add item can bring it back. */
export function StopTracking({
  householdId,
  itemId,
  label,
}: {
  householdId: string;
  itemId: string;
  label: string;
}) {
  return (
    <form action={stopTrackingGroceryAction}>
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="itemId" value={itemId} />
      <StopSubmit label={label} />
    </form>
  );
}

function StopSubmit({ label }: { label: string }) {
  const status = useFormStatus();
  return (
    <Button
      type="submit"
      variant="quiet"
      disabled={status.pending}
      className="gap-2"
    >
      <Archive aria-hidden className="size-4" /> {label}
    </Button>
  );
}
