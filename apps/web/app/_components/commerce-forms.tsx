"use client";

import { Plus } from "lucide-react";
import { useActionState, useState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";
import { Pill } from "@wonderhome/core/ui/pill";
import { Sheet } from "@wonderhome/core/ui/sheet";

import type { ActionState } from "../(auth)/actions";
import { createConsumableAction } from "../(auth)/commerce-actions";

const CATEGORIES = [
  { value: "grocery", label: "Grocery" },
  { value: "household", label: "Household" },
  { value: "pet", label: "Pet" },
  { value: "personal", label: "Personal care" },
  { value: "medical", label: "Medical" },
];

/** "Add something" as a sheet — the manual half of the AI chat link. */
export function AddConsumableButton({ householdId }: { householdId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createConsumableAction, {});

  return (
    <>
      <Pill type="button" tone="soft" onClick={() => setOpen(true)} className="gap-1.5">
        <Plus aria-hidden className="size-3.5" /> Add something
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title="Add something to track" description="What it is and how much you typically go through — WonderHome watches it from here.">
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert>{state.error}</Alert> : null}
          {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <Field label="What is it?" name="name" required placeholder="Milk" autoComplete="off" />
          <div className="space-y-1.5">
            <label htmlFor="category" className="block text-sm font-medium">Category</label>
            <select
              id="category"
              name="category"
              defaultValue="grocery"
              className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Usual amount" name="typicalQuantity" type="number" min={0} step="0.1" required placeholder="2" />
            <Field label="Counted in" name="unit" required placeholder="bottle, kg, pack" autoComplete="off" />
          </div>
          <Field
            label="Lasts about (days, optional)"
            name="daysPerUnit"
            type="number"
            min={1}
            placeholder="7"
            hint="Leave empty and WonderHome will work it out after a few purchases."
          />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Adding…" : "Add"}
          </Button>
        </form>
      </Sheet>
    </>
  );
}
