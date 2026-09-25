"use client";

import { Archive, ArchiveRestore, Pencil, Plus } from "lucide-react";
import { startTransition, useActionState, useState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";
import { Pill } from "@wonderhome/core/ui/pill";
import { ConfirmationSheet, Sheet } from "@wonderhome/core/ui/sheet";

import type { ActionState } from "../(auth)/actions";
import {
  arrangeCoverAction,
  createBackupServiceAction,
  setBackupServiceActiveAction,
  updateBackupServiceAction,
} from "../(auth)/backup-service-actions";

/**
 * Backup services on the Househelper screen (story 07-008): add, change,
 * retire or restore one, and arrange one to cover a day.
 */

type Outcome = { key: string; name: string };
type ServiceInitial = { id: string; name: string; contact: string | null; covers: string[]; notes: string | null; active: boolean };

/**
 * These sheets' words in the viewer's language, built on the server by
 * `backupServiceFormLabels` (story 22-004). `{name}` stays a placeholder and
 * is filled in here with the service's own name, which is never translated.
 */
export type BackupServiceFormLabels = {
  name: string;
  namePlaceholder: string;
  contact: string;
  covers: string;
  coversNone: string;
  notes: string;
  notesPlaceholder: string;
  addService: string;
  serviceTitle: string;
  serviceDescription: string;
  adding: string;
  add: string;
  editService: string;
  editServiceDescription: string;
  saving: string;
  saveChanges: string;
  retireService: string;
  restoreService: string;
  retireTitle: string;
  retireDescription: string;
  retire: string;
  cancel: string;
  whichService: string;
  arranging: string;
  arrangeNamed: string;
  arrange: string;
};

const withName = (template: string, name: string) => template.replace("{name}", () => name);

function ServiceFields({ outcomes, current, labels }: { outcomes: Outcome[]; current?: ServiceInitial; labels: BackupServiceFormLabels }) {
  return (
    <>
      <Field label={labels.name} name="name" required maxLength={120} defaultValue={current?.name} placeholder={labels.namePlaceholder} autoComplete="off" />
      <Field label={labels.contact} name="contact" maxLength={120} defaultValue={current?.contact ?? ""} placeholder="+91 98xxx xxxxx" autoComplete="off" />
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">{labels.covers}</legend>
        {outcomes.length === 0 ? (
          <p className="text-sm text-[var(--wh-foreground-muted)]">{labels.coversNone}</p>
        ) : (
          <ul className="space-y-1">
            {outcomes.map((outcome) => (
              <li key={outcome.key}>
                <label className="flex min-h-11 items-center gap-3 rounded-[var(--wh-radius-sm)] px-1 text-sm">
                  <input type="checkbox" name="covers" value={outcome.key} defaultChecked={current?.covers.includes(outcome.key)} className="size-4 accent-[var(--wh-primary)]" />
                  {outcome.name}
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>
      <Field label={labels.notes} name="notes" maxLength={300} defaultValue={current?.notes ?? ""} placeholder={labels.notesPlaceholder} autoComplete="off" />
    </>
  );
}

/** Always reachable, not only from an empty state (rule 12): a second service is as easy as the first. */
export function AddBackupServiceButton({ householdId, outcomes, labels }: { householdId: string; outcomes: Outcome[]; labels: BackupServiceFormLabels }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createBackupServiceAction, {});

  return (
    <>
      <Pill type="button" tone="quiet" onClick={() => setOpen(true)} className="gap-1.5">
        <Plus aria-hidden className="size-3.5" /> {labels.addService}
      </Pill>
      <Sheet open={open} onOpenChange={setOpen} title={labels.serviceTitle} description={labels.serviceDescription}>
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert>{state.error}</Alert> : null}
          {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <ServiceFields outcomes={outcomes} labels={labels} />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? labels.adding : labels.add}
          </Button>
        </form>
      </Sheet>
    </>
  );
}

/** Change it, or retire and restore it — never a hard delete, so a cover request keeps its provider. */
export function BackupServiceRowControls({
  householdId,
  service,
  outcomes,
  labels,
}: {
  householdId: string;
  service: ServiceInitial;
  outcomes: Outcome[];
  labels: BackupServiceFormLabels;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [retireOpen, setRetireOpen] = useState(false);
  const [editState, editAction, editPending] = useActionState<ActionState, FormData>(updateBackupServiceAction, {});
  const [activeState, activeAction, activePending] = useActionState<ActionState, FormData>(setBackupServiceActiveAction, {});
  const editLabel = withName(labels.editService, service.name);
  const retireLabel = withName(labels.retireService, service.name);
  const restoreLabel = withName(labels.restoreService, service.name);

  const toggle = (active: boolean) => {
    const formData = new FormData();
    formData.set("householdId", householdId);
    formData.set("id", service.id);
    formData.set("active", String(active));
    // A hand-built call, not a form's `action`, so it needs its own transition
    // for `pending` to mean anything.
    startTransition(() => activeAction(formData));
  };

  return (
    <div className="flex items-center gap-1.5">
      <Pill type="button" tone="quiet" onClick={() => setEditOpen(true)} aria-label={editLabel} title={editLabel}>
        <Pencil aria-hidden className="size-3.5" />
      </Pill>
      {service.active ? (
        <Pill type="button" tone="quiet" onClick={() => setRetireOpen(true)} aria-label={retireLabel} title={retireLabel}>
          <Archive aria-hidden className="size-3.5" />
        </Pill>
      ) : (
        <Pill type="button" tone="quiet" disabled={activePending} onClick={() => toggle(true)} aria-label={restoreLabel} title={restoreLabel}>
          <ArchiveRestore aria-hidden className="size-3.5" />
        </Pill>
      )}

      <Sheet open={editOpen} onOpenChange={setEditOpen} title={editLabel} description={labels.editServiceDescription}>
        <form action={editAction} className="space-y-3">
          {editState.error ? <Alert>{editState.error}</Alert> : null}
          {editState.notice ? <Alert tone="info">{editState.notice}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <input type="hidden" name="id" value={service.id} />
          <ServiceFields outcomes={outcomes} current={service} labels={labels} />
          <Button type="submit" disabled={editPending} className="w-full">
            {editPending ? labels.saving : labels.saveChanges}
          </Button>
        </form>
      </Sheet>

      <ConfirmationSheet
        open={retireOpen}
        onOpenChange={setRetireOpen}
        title={withName(labels.retireTitle, service.name)}
        description={labels.retireDescription}
        confirmLabel={labels.retire}
        cancelLabel={labels.cancel}
        pending={activePending}
        onConfirm={() => toggle(false)}
      >
        {activeState.error ? <p className="text-sm text-[var(--wh-risk)]">{activeState.error}</p> : null}
      </ConfirmationSheet>
      {!retireOpen && activeState.error ? <span className="sr-only" role="alert">{activeState.error}</span> : null}
    </div>
  );
}

/** One tap: a service request with the service's name and contact, and the household's move next. */
export function ArrangeCoverButton({
  householdId,
  outcomeKey,
  outcomeName,
  date,
  services,
  labels,
}: {
  householdId: string;
  outcomeKey: string;
  outcomeName: string;
  date: string;
  services: { id: string; name: string }[];
  labels: BackupServiceFormLabels;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(arrangeCoverAction, {});

  if (state.notice) return <p className="text-xs text-[var(--wh-handled)]" role="status">{state.notice}</p>;

  return (
    <form action={formAction} className="flex flex-wrap items-center justify-end gap-1.5">
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="outcomeKey" value={outcomeKey} />
      <input type="hidden" name="outcomeName" value={outcomeName} />
      <input type="hidden" name="date" value={date} />
      {services.length === 1 ? (
        <input type="hidden" name="serviceId" value={services[0]!.id} />
      ) : (
        <label className="sr-only" htmlFor={`cover-${outcomeKey}-${date}`}>{labels.whichService}</label>
      )}
      {services.length > 1 ? (
        <select id={`cover-${outcomeKey}-${date}`} name="serviceId" className="min-h-11 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-2 text-sm">
          {services.map((service) => (
            <option key={service.id} value={service.id}>{service.name}</option>
          ))}
        </select>
      ) : null}
      <Pill type="submit" tone="primary" disabled={pending}>
        {pending ? labels.arranging : services.length === 1 ? withName(labels.arrangeNamed, services[0]!.name) : labels.arrange}
      </Pill>
      {state.error ? <p className="w-full text-right text-xs text-[var(--wh-risk)]" role="alert">{state.error}</p> : null}
    </form>
  );
}
