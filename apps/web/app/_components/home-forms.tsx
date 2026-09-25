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

export type AssetCategory = "appliance" | "fixture" | "vehicle" | "electronics" | "furniture" | "other";

/** The stored asset categories, in the order the picker offers them; each is shown by its translated label. */
const CATEGORIES: readonly AssetCategory[] = ["appliance", "fixture", "vehicle", "electronics", "furniture", "other"];

/**
 * The Home & Upkeep sheets' words in the viewer's language, built on the
 * server by `upkeepFormLabels` (story 22-004). `categories` maps each stored
 * category value to its label; the value sent to the server never changes.
 */
export type UpkeepFormLabels = {
  addAsset: string;
  assetDescription: string;
  name: string;
  namePlaceholder: string;
  category: string;
  categories: Record<AssetCategory, string>;
  location: string;
  locationPlaceholder: string;
  interval: string;
  intervalHint: string;
  lastServiced: string;
  adding: string;
  submitAsset: string;
  raise: string;
  requestTitle: string;
  requestDescription: string;
  subject: string;
  subjectPlaceholder: string;
  provider: string;
  providerPlaceholder: string;
  providerContact: string;
  providerContactPlaceholder: string;
  raising: string;
  submitRequest: string;
};

/** "Add an asset" as a sheet — the manual half of what the AI link already does. */
export function AddAssetButton({ householdId, labels }: { householdId: string; labels: UpkeepFormLabels }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createAssetAction, {});

  return (
    <>
      <Pill type="button" tone="soft" onClick={() => setOpen(true)} className="gap-1.5">
        <Plus aria-hidden className="size-3.5" /> {labels.addAsset}
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title={labels.addAsset} description={labels.assetDescription}>
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert>{state.error}</Alert> : null}
          {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <Field label={labels.name} name="name" required placeholder={labels.namePlaceholder} autoComplete="off" />
          <div className="space-y-1.5">
            <label htmlFor="category" className="block text-sm font-medium">{labels.category}</label>
            <select
              id="category"
              name="category"
              defaultValue="appliance"
              className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
            >
              {CATEGORIES.map((value) => (
                <option key={value} value={value}>{labels.categories[value]}</option>
              ))}
            </select>
          </div>
          <Field label={labels.location} name="location" placeholder={labels.locationPlaceholder} autoComplete="off" />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label={labels.interval}
              name="serviceIntervalDays"
              type="number"
              min={1}
              placeholder="180"
              hint={labels.intervalHint}
            />
            <Field label={labels.lastServiced} name="lastServicedOn" type="date" />
          </div>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? labels.adding : labels.submitAsset}
          </Button>
        </form>
      </Sheet>
    </>
  );
}

/** "Raise a service request" as a sheet — for something that needs a technician, not a new asset record. */
export function RaiseServiceRequestButton({ householdId, labels }: { householdId: string; labels: UpkeepFormLabels }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createServiceRequestAction, {});

  return (
    <>
      <Pill type="button" tone="soft" onClick={() => setOpen(true)} className="gap-1.5">
        <Plus aria-hidden className="size-3.5" /> {labels.raise}
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title={labels.requestTitle} description={labels.requestDescription}>
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert>{state.error}</Alert> : null}
          {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <Field label={labels.subject} name="subject" required placeholder={labels.subjectPlaceholder} autoComplete="off" />
          <Field label={labels.provider} name="providerName" placeholder={labels.providerPlaceholder} autoComplete="off" />
          <Field label={labels.providerContact} name="providerContact" placeholder={labels.providerContactPlaceholder} autoComplete="off" />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? labels.raising : labels.submitRequest}
          </Button>
        </form>
      </Sheet>
    </>
  );
}
