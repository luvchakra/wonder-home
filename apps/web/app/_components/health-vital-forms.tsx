"use client";

import { Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";

import type { VitalType } from "@wonderhome/core/health/vitals";
import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";
import { Pill } from "@wonderhome/core/ui/pill";
import { Select } from "@wonderhome/core/ui/select";
import { Sheet } from "@wonderhome/core/ui/sheet";

import type { ActionState } from "../(auth)/actions";
import { archiveVitalAction, createVitalAction, reactivateVitalAction, updateVitalAction } from "../(auth)/health-vital-actions";
import { withName, type HealthFormLabels } from "../_lib/health-form-labels";

/** The stored values, in the order they are offered; their words come from `labels` (story 22-004). */
const SCOPES = ["private", "selected_family", "household_operational"] as const;

/** Blood pressure is the one vital type with a paired reading — everything else takes one value and one unit, exactly what the household typed. */
function VitalValueFields({ vitalType, secondaryValue, labels }: { vitalType: VitalType; secondaryValue?: number | null; labels: HealthFormLabels }) {
  if (vitalType === "blood_pressure") {
    return (
      <div className="grid grid-cols-2 gap-3">
        <Field label={labels.common.systolic} name="value" type="number" step="any" required autoComplete="off" />
        <Field label={labels.common.diastolic} name="secondaryValue" type="number" step="any" defaultValue={secondaryValue ?? ""} autoComplete="off" />
      </div>
    );
  }
  return <Field label={labels.common.value} name="value" type="number" step="any" required autoComplete="off" />;
}

/** Recording a reading — always what the household typed, never a value WonderHome fills in (story 21-007). */
export function AddVitalButton({
  householdId,
  members,
  defaultPrivacyScope,
  labels,
}: {
  householdId: string;
  members: { id: string; displayName: string }[];
  defaultPrivacyScope: "private" | "selected_family" | "household_operational";
  labels: HealthFormLabels;
}) {
  const words = labels.vital;
  const common = labels.common;
  const [open, setOpen] = useState(false);
  const [vitalType, setVitalType] = useState<VitalType>("weight");
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createVitalAction, {});
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current && !pending && !state.error) {
      setOpen(false);
      submitted.current = false;
    }
  }, [pending, state.error]);

  if (members.length === 0) return null;

  return (
    <>
      <Pill type="button" tone="soft" onClick={() => setOpen(true)} className="gap-1.5">
        <Plus aria-hidden className="size-3.5" /> {words.add}
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title={words.add} description={words.description}>
        <form
          action={(formData) => {
            submitted.current = true;
            formAction(formData);
          }}
          className="space-y-3"
        >
          {state.error ? <Alert>{state.error}</Alert> : null}
          {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <Select label={common.whoFor} name="memberId" defaultValue={members[0]?.id ?? ""}>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.displayName}
              </option>
            ))}
          </Select>
          <Select label={common.measurement} name="vitalType" value={vitalType} onChange={(event) => setVitalType(event.target.value as VitalType)}>
            {(Object.keys(labels.vitalTypes) as VitalType[]).map((type) => (
              <option key={type} value={type}>
                {labels.vitalTypes[type]}
              </option>
            ))}
          </Select>
          {vitalType === "custom" ? <Field label={common.whatCalled} name="customLabel" placeholder={common.measurementPlaceholder} required autoComplete="off" /> : null}
          <VitalValueFields vitalType={vitalType} labels={labels} />
          <Field label={common.unit} name="unit" placeholder={vitalType === "blood_pressure" ? "mmHg" : common.unitPlaceholder} required autoComplete="off" />
          <Field label={common.whenDefaultNow} name="measuredAt" type="datetime-local" />
          <Field label={common.notes} name="notes" placeholder={common.notesPlaceholder} autoComplete="off" />
          <Select label={common.whoCanSee} name="privacyScope" defaultValue={defaultPrivacyScope}>
            {SCOPES.map((scope) => (
              <option key={scope} value={scope}>
                {labels.scopes[scope]}
              </option>
            ))}
          </Select>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? common.recording : common.record}
          </Button>
        </form>
      </Sheet>
    </>
  );
}

export function EditVitalButton({
  householdId,
  vitalId,
  vitalType,
  label,
  value,
  secondaryValue,
  unit,
  notes,
  labels,
}: {
  householdId: string;
  vitalId: string;
  vitalType: VitalType;
  label: string;
  value: number;
  secondaryValue: number | null;
  unit: string;
  notes: string | null;
  labels: HealthFormLabels;
}) {
  const words = labels.vital;
  const common = labels.common;
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateVitalAction, {});
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current && !pending && !state.error) {
      setOpen(false);
      submitted.current = false;
    }
  }, [pending, state.error]);

  return (
    <>
      <Pill type="button" tone="quiet" onClick={() => setOpen(true)} aria-label={withName(common.editNamed, label)} title={common.edit}>
        <Pencil aria-hidden className="size-3.5" />
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title={words.editTitle} description={common.correctDescription}>
        <form
          action={(formData) => {
            submitted.current = true;
            formAction(formData);
          }}
          className="space-y-3"
        >
          {state.error ? <Alert>{state.error}</Alert> : null}
          {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <input type="hidden" name="vitalId" value={vitalId} />
          {vitalType === "blood_pressure" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label={common.systolic} name="value" type="number" step="any" defaultValue={value} required autoComplete="off" />
              <Field label={common.diastolic} name="secondaryValue" type="number" step="any" defaultValue={secondaryValue ?? ""} autoComplete="off" />
            </div>
          ) : (
            <Field label={common.value} name="value" type="number" step="any" defaultValue={value} required autoComplete="off" />
          )}
          <Field label={common.unit} name="unit" defaultValue={unit} required autoComplete="off" />
          <Field label={common.notes} name="notes" defaultValue={notes ?? ""} autoComplete="off" />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? common.saving : common.save}
          </Button>
        </form>
      </Sheet>
    </>
  );
}

/** A reading's actions — edit, or remove and bring back (CLAUDE.md rule 12). */
export function VitalActions({
  householdId,
  vital,
  labels,
}: {
  householdId: string;
  vital: { id: string; vitalType: VitalType; label: string; value: number; secondaryValue: number | null; unit: string; notes: string | null; status: "active" | "archived" };
  labels: HealthFormLabels;
}) {
  const common = labels.common;
  const [, archiveAction, archivePending] = useActionState<ActionState, FormData>(archiveVitalAction, {});
  const [, reactivateAction, reactivatePending] = useActionState<ActionState, FormData>(reactivateVitalAction, {});

  const submit = (action: (formData: FormData) => void) => {
    const formData = new FormData();
    formData.set("householdId", householdId);
    formData.set("vitalId", vital.id);
    startTransition(() => action(formData));
  };

  if (vital.status === "archived") {
    return (
      <Pill type="button" tone="soft" disabled={reactivatePending} onClick={() => submit(reactivateAction)} aria-label={common.bringBack} title={common.bringBack}>
        <RotateCcw aria-hidden className="size-3.5" />
      </Pill>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <EditVitalButton
        householdId={householdId}
        vitalId={vital.id}
        vitalType={vital.vitalType}
        label={vital.label}
        value={vital.value}
        secondaryValue={vital.secondaryValue}
        unit={vital.unit}
        notes={vital.notes}
        labels={labels}
      />
      <Pill type="button" tone="quiet" disabled={archivePending} onClick={() => submit(archiveAction)} aria-label={common.remove} title={common.remove}>
        <Trash2 aria-hidden className="size-3.5" />
      </Pill>
    </div>
  );
}
