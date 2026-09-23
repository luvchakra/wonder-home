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

function ServiceFields({ outcomes, current }: { outcomes: Outcome[]; current?: ServiceInitial }) {
  return (
    <>
      <Field label="Name" name="name" required maxLength={120} defaultValue={current?.name} placeholder="Sparkle Home Cleaning" autoComplete="off" />
      <Field label="How to reach them (optional)" name="contact" maxLength={120} defaultValue={current?.contact ?? ""} placeholder="+91 98xxx xxxxx" autoComplete="off" />
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">What they can cover</legend>
        {outcomes.length === 0 ? (
          <p className="text-sm text-[var(--wh-foreground-muted)]">Assign your helper&apos;s outcomes under Responsibilities first; then pick which of them this service can cover.</p>
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
      <Field label="Notes (optional)" name="notes" maxLength={300} defaultValue={current?.notes ?? ""} placeholder="Weekday mornings only" autoComplete="off" />
    </>
  );
}

/** Always reachable, not only from an empty state (rule 12): a second service is as easy as the first. */
export function AddBackupServiceButton({ householdId, outcomes }: { householdId: string; outcomes: Outcome[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createBackupServiceAction, {});

  return (
    <>
      <Pill type="button" tone="quiet" onClick={() => setOpen(true)} className="gap-1.5">
        <Plus aria-hidden className="size-3.5" /> Add backup service
      </Pill>
      <Sheet open={open} onOpenChange={setOpen} title="A backup service" description="Someone outside the household you can call when your helper is away and nobody at home covers it.">
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert>{state.error}</Alert> : null}
          {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <ServiceFields outcomes={outcomes} />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Adding…" : "Add"}
          </Button>
        </form>
      </Sheet>
    </>
  );
}

/** Change it, or retire and restore it — never a hard delete, so a cover request keeps its provider. */
export function BackupServiceRowControls({ householdId, service, outcomes }: { householdId: string; service: ServiceInitial; outcomes: Outcome[] }) {
  const [editOpen, setEditOpen] = useState(false);
  const [retireOpen, setRetireOpen] = useState(false);
  const [editState, editAction, editPending] = useActionState<ActionState, FormData>(updateBackupServiceAction, {});
  const [activeState, activeAction, activePending] = useActionState<ActionState, FormData>(setBackupServiceActiveAction, {});

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
      <Pill type="button" tone="quiet" onClick={() => setEditOpen(true)} aria-label={`Edit ${service.name}`} title={`Edit ${service.name}`}>
        <Pencil aria-hidden className="size-3.5" />
      </Pill>
      {service.active ? (
        <Pill type="button" tone="quiet" onClick={() => setRetireOpen(true)} aria-label={`Retire ${service.name}`} title={`Retire ${service.name}`}>
          <Archive aria-hidden className="size-3.5" />
        </Pill>
      ) : (
        <Pill type="button" tone="quiet" disabled={activePending} onClick={() => toggle(true)} aria-label={`Restore ${service.name}`} title={`Restore ${service.name}`}>
          <ArchiveRestore aria-hidden className="size-3.5" />
        </Pill>
      )}

      <Sheet open={editOpen} onOpenChange={setEditOpen} title={`Edit ${service.name}`} description="Change who they are or what they can cover.">
        <form action={editAction} className="space-y-3">
          {editState.error ? <Alert>{editState.error}</Alert> : null}
          {editState.notice ? <Alert tone="info">{editState.notice}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <input type="hidden" name="id" value={service.id} />
          <ServiceFields outcomes={outcomes} current={service} />
          <Button type="submit" disabled={editPending} className="w-full">
            {editPending ? "Saving…" : "Save changes"}
          </Button>
        </form>
      </Sheet>

      <ConfirmationSheet
        open={retireOpen}
        onOpenChange={setRetireOpen}
        title={`Retire ${service.name}?`}
        description="They stop being suggested for cover. Anything already arranged with them keeps their name, and you can restore them later."
        confirmLabel="Retire"
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
}: {
  householdId: string;
  outcomeKey: string;
  outcomeName: string;
  date: string;
  services: { id: string; name: string }[];
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
        <label className="sr-only" htmlFor={`cover-${outcomeKey}-${date}`}>Which service</label>
      )}
      {services.length > 1 ? (
        <select id={`cover-${outcomeKey}-${date}`} name="serviceId" className="min-h-11 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-2 text-sm">
          {services.map((service) => (
            <option key={service.id} value={service.id}>{service.name}</option>
          ))}
        </select>
      ) : null}
      <Pill type="submit" tone="primary" disabled={pending}>
        {pending ? "Arranging…" : services.length === 1 ? `Arrange ${services[0]!.name}` : "Arrange"}
      </Pill>
      {state.error ? <p className="w-full text-right text-xs text-[var(--wh-risk)]" role="alert">{state.error}</p> : null}
    </form>
  );
}
