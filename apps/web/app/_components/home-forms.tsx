"use client";

import { Plus } from "lucide-react";
import { useActionState, useState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";
import { Pill } from "@wonderhome/core/ui/pill";
import { Sheet } from "@wonderhome/core/ui/sheet";

import type { ActionState } from "../(auth)/actions";
import { createAssetAction, createServiceRequestAction } from "../(auth)/home-actions";

const CATEGORIES = [
  { value: "appliance", label: "Appliance" },
  { value: "fixture", label: "Fixture" },
  { value: "vehicle", label: "Vehicle" },
  { value: "electronics", label: "Electronics" },
  { value: "furniture", label: "Furniture" },
  { value: "other", label: "Other" },
];

/** "Add an asset" as a sheet — the manual half of what the AI link already does. */
export function AddAssetButton({ householdId }: { householdId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createAssetAction, {});

  return (
    <>
      <Pill type="button" tone="soft" onClick={() => setOpen(true)} className="gap-1.5">
        <Plus aria-hidden className="size-3.5" /> Add an asset
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title="Add an asset" description="An appliance, a vehicle, anything WonderHome should keep a service schedule for.">
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert>{state.error}</Alert> : null}
          {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <Field label="Name" name="name" required placeholder="Washing machine" autoComplete="off" />
          <div className="space-y-1.5">
            <label htmlFor="category" className="block text-sm font-medium">Category</label>
            <select
              id="category"
              name="category"
              defaultValue="appliance"
              className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <Field label="Where (optional)" name="location" placeholder="Kitchen" autoComplete="off" />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Service every (days, optional)"
              name="serviceIntervalDays"
              type="number"
              min={1}
              placeholder="180"
              hint="Leave empty if it never needs servicing."
            />
            <Field label="Last serviced (optional)" name="lastServicedOn" type="date" />
          </div>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Adding…" : "Add asset"}
          </Button>
        </form>
      </Sheet>
    </>
  );
}

/** "Raise a service request" as a sheet — for something that needs a technician, not a new asset record. */
export function RaiseServiceRequestButton({ householdId }: { householdId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createServiceRequestAction, {});

  return (
    <>
      <Pill type="button" tone="soft" onClick={() => setOpen(true)} className="gap-1.5">
        <Plus aria-hidden className="size-3.5" /> Raise a request
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title="Raise a service request" description="Something that needs a technician or provider — WonderHome tracks it until it’s booked.">
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert>{state.error}</Alert> : null}
          {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <Field label="What does it need?" name="subject" required placeholder="AC servicing before summer" autoComplete="off" />
          <Field label="Provider (optional)" name="providerName" placeholder="Cool Air Services" autoComplete="off" />
          <Field label="Provider contact (optional)" name="providerContact" placeholder="Phone or email" autoComplete="off" />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Raising…" : "Raise request"}
          </Button>
        </form>
      </Sheet>
    </>
  );
}
