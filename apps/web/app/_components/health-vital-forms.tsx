"use client";

import { Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";

import { defaultVitalUnit, VITAL_UNITS, type VitalType } from "@wonderhome/core/health/vitals";
import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { ComboboxField } from "@wonderhome/core/ui/combobox-field";
import { Field } from "@wonderhome/core/ui/field";
import { Pill } from "@wonderhome/core/ui/pill";
import { Select } from "@wonderhome/core/ui/select";
import { Sheet } from "@wonderhome/core/ui/sheet";

import type { ActionState } from "../(auth)/actions";
import { archiveVitalAction, createVitalAction, reactivateVitalAction, updateVitalAction } from "../(auth)/health-vital-actions";
import { withName, type HealthFormLabels } from "../_lib/health-form-labels";
import { HealthPrivacyField } from "./health-privacy-field";

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

/**
 * A reading's unit, picked from the ones that measurement is taken in (rule
 * 20, the owner, 2026-10-21: "make the unit a drop-down"), with Add new… for
 * one not listed. Keyed by the type so changing the measurement starts its
 * own list.
 */
export function VitalUnitField({ vitalType, defaultValue, labels }: { vitalType: VitalType; defaultValue?: string; labels: HealthFormLabels }) {
  const units = [...VITAL_UNITS[vitalType]];
  if (defaultValue && !units.includes(defaultValue)) units.push(defaultValue);
  return (
    <ComboboxField
      key={vitalType}
      label={labels.common.unit}
      name="unit"
      options={units}
      defaultValue={defaultValue ?? defaultVitalUnit(vitalType)}
      required
      addNewLabel={labels.common.addNew}
      chooseExistingLabel={labels.common.chooseExisting}
      newValuePlaceholder={labels.common.unitPlaceholder}
    />
  );
}

/** Recording a reading — always what the household typed, never a value WonderHome fills in (story 21-007). */
export function AddVitalButton({
  householdId,
  members,
  defaultPrivacyScope,
  labels,
  defaultOpen = false,
  hideTrigger = false,
}: {
  householdId: string;
  members: { id: string; displayName: string }[];
  defaultPrivacyScope: "private" | "selected_family" | "household_operational";
  labels: HealthFormLabels;
  /** Opens as it mounts — picked from the page's Add menu rather than its own pill. */
  defaultOpen?: boolean;
  /** Leaves its own pill out, when the Add menu is how it is reached. */
  hideTrigger?: boolean;
}) {
  const words = labels.vital;
  const common = labels.common;
  const [open, setOpen] = useState(defaultOpen);
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
      {hideTrigger ? null : (
        <Pill type="button" tone="soft" onClick={() => setOpen(true)} className="gap-1.5">
          <Plus aria-hidden className="size-3.5" /> {words.add}
        </Pill>
      )}

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
          <VitalUnitField vitalType={vitalType} labels={labels} />
          <Field label={common.whenDefaultNow} name="measuredAt" type="datetime-local" />
          <Field label={common.notes} name="notes" placeholder={common.notesPlaceholder} autoComplete="off" />
          <HealthPrivacyField labels={labels} defaultValue={defaultPrivacyScope} />
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
  memberId,
  privacyScope,
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
  memberId: string;
  privacyScope: "private" | "selected_family" | "household_operational";
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
          <VitalUnitField vitalType={vitalType} defaultValue={unit} labels={labels} />
          <Field label={common.notes} name="notes" defaultValue={notes ?? ""} autoComplete="off" />
          <HealthPrivacyField labels={labels} defaultValue={privacyScope} subjectMemberId={memberId} />
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
  vital: { id: string; vitalType: VitalType; label: string; value: number; secondaryValue: number | null; unit: string; notes: string | null; status: "active" | "archived"; memberId: string; privacyScope: "private" | "selected_family" | "household_operational" };
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
        memberId={vital.memberId}
        privacyScope={vital.privacyScope}
        labels={labels}
      />
      <Pill type="button" tone="quiet" disabled={archivePending} onClick={() => submit(archiveAction)} aria-label={common.remove} title={common.remove}>
        <Trash2 aria-hidden className="size-3.5" />
      </Pill>
    </div>
  );
}
