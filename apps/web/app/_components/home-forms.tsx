"use client";

import { Pencil, Plus } from "lucide-react";
import { useActionState, useState, type ReactNode } from "react";

import { canTransition, SERVICE_STATUSES, type ServiceStatus } from "@wonderhome/core/home/services";
import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";
import { Pill } from "@wonderhome/core/ui/pill";
import { Select } from "@wonderhome/core/ui/select";
import { Sheet } from "@wonderhome/core/ui/sheet";

import type { ActionState } from "../(auth)/actions";
import {
  createAssetAction,
  createServiceRequestAction,
  markAssetServicedAction,
  setAssetStatusAction,
  updateAssetAction,
  updateServiceRequestAction,
} from "../(auth)/home-actions";

export type AssetCategory = "appliance" | "fixture" | "vehicle" | "electronics" | "furniture" | "other";
export type ServiceKind = "service" | "repair" | "inspection" | "replacement";

/** The stored asset categories, in the order the picker offers them; each is shown by its translated label. */
const CATEGORIES: readonly AssetCategory[] = ["appliance", "fixture", "vehicle", "electronics", "furniture", "other"];
const SERVICE_KINDS: readonly ServiceKind[] = ["service", "repair", "inspection", "replacement"];

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
  warranty: string;
  amc: string;
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
  // Changing and taking back (rule 12).
  editAssetTitle: string;
  editAssetDescription: string;
  save: string;
  saving: string;
  retire: string;
  retireHint: string;
  bringBack: string;
  recordService: string;
  recordServiceDescription: string;
  servicedOn: string;
  serviceKind: string;
  serviceKinds: Record<ServiceKind, string>;
  recording: string;
  editRequestTitle: string;
  editRequestDescription: string;
  nextAction: string;
  nextActionPlaceholder: string;
  scheduledOn: string;
  moveOn: string;
  moveTo: string;
  statuses: Record<ServiceStatus, string>;
  update: string;
};

function Notice({ state }: { state: ActionState }) {
  if (state.error) return <Alert>{state.error}</Alert>;
  if (state.notice) return <Alert tone="info">{state.notice}</Alert>;
  return null;
}

export type AssetValues = {
  id: string;
  name: string;
  category: AssetCategory;
  location: string | null;
  serviceIntervalDays: number | null;
  lastServicedOn: string | null;
  warrantyExpiresOn: string | null;
  amcExpiresOn: string | null;
  status: "active" | "retired";
};

/** The asset's fields, the same for adding and changing one. */
function AssetFields({ labels, asset }: { labels: UpkeepFormLabels; asset?: AssetValues }) {
  return (
    <>
      <Field label={labels.name} name="name" required placeholder={labels.namePlaceholder} autoComplete="off" defaultValue={asset?.name} />
      <Select label={labels.category} name="category" defaultValue={asset?.category ?? "appliance"}>
        {CATEGORIES.map((value) => (
          <option key={value} value={value}>
            {labels.categories[value]}
          </option>
        ))}
      </Select>
      <Field label={labels.location} name="location" placeholder={labels.locationPlaceholder} autoComplete="off" defaultValue={asset?.location ?? undefined} />
      <div className="grid grid-cols-2 gap-3">
        <Field
          label={labels.interval}
          name="serviceIntervalDays"
          type="number"
          min={1}
          placeholder="180"
          hint={labels.intervalHint}
          defaultValue={asset?.serviceIntervalDays ?? undefined}
        />
        <Field label={labels.lastServiced} name="lastServicedOn" type="date" defaultValue={asset?.lastServicedOn ?? undefined} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={labels.warranty} name="warrantyExpiresOn" type="date" defaultValue={asset?.warrantyExpiresOn ?? undefined} />
        <Field label={labels.amc} name="amcExpiresOn" type="date" defaultValue={asset?.amcExpiresOn ?? undefined} />
      </div>
    </>
  );
}

/** "Add an asset" as a sheet — stays in the header whatever is already listed (rule 12). */
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
          <Notice state={state} />
          <input type="hidden" name="householdId" value={householdId} />
          <AssetFields labels={labels} />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? labels.adding : labels.submitAsset}
          </Button>
        </form>
      </Sheet>
    </>
  );
}

/** An icon button (rule 11: the row's room belongs to the name) that opens a sheet. */
function IconSheetButton({ label, icon, title, description, children }: { label: string; icon?: ReactNode; title: string; description: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={() => setOpen(true)}
        className="grid size-9 shrink-0 place-items-center rounded-full text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)] hover:text-[var(--wh-foreground)]"
      >
        {icon ?? <Pencil aria-hidden className="size-4" />}
      </button>
      <Sheet open={open} onOpenChange={setOpen} title={title} description={description}>
        {children}
      </Sheet>
    </>
  );
}

/** Changing a thing, and retiring it or bringing it back — all in one sheet. */
export function EditAssetButton({ householdId, asset, labels, editLabel }: { householdId: string; asset: AssetValues; labels: UpkeepFormLabels; editLabel: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateAssetAction, {});
  const [statusState, statusAction, statusPending] = useActionState<ActionState, FormData>(setAssetStatusAction, {});
  const retired = asset.status === "retired";
  return (
    <IconSheetButton label={editLabel} title={labels.editAssetTitle} description={labels.editAssetDescription}>
      <form action={formAction} className="space-y-3">
        <Notice state={state} />
        <input type="hidden" name="householdId" value={householdId} />
        <input type="hidden" name="assetId" value={asset.id} />
        <AssetFields labels={labels} asset={asset} />
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? labels.saving : labels.save}
        </Button>
      </form>
      <form action={statusAction} className="mt-4 space-y-2 border-t border-[var(--wh-border)] pt-4">
        <Notice state={statusState} />
        <input type="hidden" name="householdId" value={householdId} />
        <input type="hidden" name="assetId" value={asset.id} />
        <input type="hidden" name="status" value={retired ? "active" : "retired"} />
        {retired ? null : <p className="text-xs text-[var(--wh-foreground-muted)]">{labels.retireHint}</p>}
        <Button type="submit" variant="secondary" disabled={statusPending} className="w-full">
          {retired ? labels.bringBack : labels.retire}
        </Button>
      </form>
    </IconSheetButton>
  );
}

/** "Serviced": a visit on a day, with what was done, counted into the next service. */
export function RecordServiceButton({ householdId, assetId, today, labels }: { householdId: string; assetId: string; today: string; labels: UpkeepFormLabels }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(markAssetServicedAction, {});
  return (
    <>
      <Pill type="button" tone="soft" onClick={() => setOpen(true)}>
        {labels.recordService}
      </Pill>
      <Sheet open={open} onOpenChange={setOpen} title={labels.recordService} description={labels.recordServiceDescription}>
        <form action={formAction} className="space-y-3">
          <Notice state={state} />
          <input type="hidden" name="householdId" value={householdId} />
          <input type="hidden" name="assetId" value={assetId} />
          <div className="grid grid-cols-2 gap-3">
            <Field label={labels.servicedOn} name="occurredOn" type="date" required defaultValue={today} max={today} />
            <Select label={labels.serviceKind} name="kind" defaultValue="service">
              {SERVICE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {labels.serviceKinds[kind]}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? labels.recording : labels.recordService}
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
          <Notice state={state} />
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

export type RequestValues = {
  id: string;
  subject: string;
  providerName: string | null;
  providerContact: string | null;
  status: ServiceStatus;
  scheduledOn: string | null;
  nextAction: string | null;
};

/** Correcting what a request says: subject, who is doing it, the visit day and the next step. */
export function EditRequestButton({ householdId, request, labels, editLabel }: { householdId: string; request: RequestValues; labels: UpkeepFormLabels; editLabel: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateServiceRequestAction, {});
  const settled = request.status === "completed" || request.status === "cancelled";
  return (
    <IconSheetButton label={editLabel} title={labels.editRequestTitle} description={labels.editRequestDescription}>
      <form action={formAction} className="space-y-3">
        <Notice state={state} />
        <input type="hidden" name="householdId" value={householdId} />
        <input type="hidden" name="requestId" value={request.id} />
        <Field label={labels.subject} name="subject" required defaultValue={request.subject} autoComplete="off" />
        <Field label={labels.provider} name="providerName" placeholder={labels.providerPlaceholder} defaultValue={request.providerName ?? undefined} autoComplete="off" />
        <Field
          label={labels.providerContact}
          name="providerContact"
          placeholder={labels.providerContactPlaceholder}
          defaultValue={request.providerContact ?? undefined}
          autoComplete="off"
        />
        {settled ? null : (
          <>
            <Field label={labels.scheduledOn} name="scheduledOn" type="date" defaultValue={request.scheduledOn ?? undefined} />
            <Field label={labels.nextAction} name="nextAction" placeholder={labels.nextActionPlaceholder} defaultValue={request.nextAction ?? undefined} autoComplete="off" />
          </>
        )}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? labels.saving : labels.save}
        </Button>
      </form>
    </IconSheetButton>
  );
}

/**
 * Moving a request on: only the steps that can follow where it is now (the
 * same rules the agents use), picked rather than typed (rule 20). Cancelled is
 * one of them — that is how a request is taken back, and it stays on record.
 */
export function RequestStatusControl({ householdId, request, labels }: { householdId: string; request: RequestValues; labels: UpkeepFormLabels }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateServiceRequestAction, {});
  const next = SERVICE_STATUSES.filter((status) => canTransition(request.status, status));
  if (next.length === 0) return null;
  return (
    <form action={formAction} className="space-y-2">
      <Notice state={state} />
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="requestId" value={request.id} />
      <div className="flex flex-wrap items-end gap-2">
        {/* Its own id per request: several rows can be open at once. */}
        <div className="min-w-[10rem] flex-1 space-y-1.5">
          <label htmlFor={`status-${request.id}`} className="block text-sm font-medium">
            {labels.moveTo}
          </label>
          <select
            id={`status-${request.id}`}
            name="status"
            defaultValue={next[0]}
            className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--wh-primary)]"
          >
            {next.map((status) => (
              <option key={status} value={status}>
                {labels.statuses[status]}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {labels.update}
        </Button>
      </div>
    </form>
  );
}
