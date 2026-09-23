"use client";

import { Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";

import { VITAL_TYPE_LABEL } from "@wonderhome/core/health/agenda";
import type { VitalType } from "@wonderhome/core/health/vitals";
import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";
import { Pill } from "@wonderhome/core/ui/pill";
import { Select } from "@wonderhome/core/ui/select";
import { Sheet } from "@wonderhome/core/ui/sheet";

import type { ActionState } from "../(auth)/actions";
import { archiveVitalAction, createVitalAction, reactivateVitalAction, updateVitalAction } from "../(auth)/health-vital-actions";

const TYPE_OPTIONS: { value: VitalType; label: string }[] = (Object.keys(VITAL_TYPE_LABEL) as VitalType[]).map((value) => ({ value, label: VITAL_TYPE_LABEL[value] }));

const SCOPE_OPTIONS = [
  { value: "private", label: "Only me" },
  { value: "selected_family", label: "People I choose" },
  { value: "household_operational", label: "The whole household" },
] as const;

/** Blood pressure is the one vital type with a paired reading — everything else takes one value and one unit, exactly what the household typed. */
function VitalValueFields({ vitalType, secondaryValue }: { vitalType: VitalType; secondaryValue?: number | null }) {
  if (vitalType === "blood_pressure") {
    return (
      <div className="grid grid-cols-2 gap-3">
        <Field label="Systolic" name="value" type="number" step="any" required autoComplete="off" />
        <Field label="Diastolic" name="secondaryValue" type="number" step="any" defaultValue={secondaryValue ?? ""} autoComplete="off" />
      </div>
    );
  }
  return <Field label="Value" name="value" type="number" step="any" required autoComplete="off" />;
}

/** Recording a reading — always what the household typed, never a value WonderHome fills in (story 21-007). */
export function AddVitalButton({
  householdId,
  members,
  defaultPrivacyScope,
}: {
  householdId: string;
  members: { id: string; displayName: string }[];
  defaultPrivacyScope: "private" | "selected_family" | "household_operational";
}) {
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
        <Plus aria-hidden className="size-3.5" /> Record a reading
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title="Record a reading" description="A single measurement — always what you actually recorded.">
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
          <Select label="Who is this for?" name="memberId" defaultValue={members[0]?.id ?? ""}>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.displayName}
              </option>
            ))}
          </Select>
          <Select label="Measurement" name="vitalType" value={vitalType} onChange={(event) => setVitalType(event.target.value as VitalType)}>
            {TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          {vitalType === "custom" ? <Field label="What is it called" name="customLabel" placeholder="Blood sugar" required autoComplete="off" /> : null}
          <VitalValueFields vitalType={vitalType} />
          <Field label="Unit" name="unit" placeholder={vitalType === "blood_pressure" ? "mmHg" : "kg, lb, bpm…"} required autoComplete="off" />
          <Field label="When (optional — defaults to now)" name="measuredAt" type="datetime-local" />
          <Field label="Notes (optional)" name="notes" placeholder="Anything worth remembering" autoComplete="off" />
          <Select label="Who can see this" name="privacyScope" defaultValue={defaultPrivacyScope}>
            {SCOPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Recording…" : "Record"}
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
}: {
  householdId: string;
  vitalId: string;
  vitalType: VitalType;
  label: string;
  value: number;
  secondaryValue: number | null;
  unit: string;
  notes: string | null;
}) {
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
      <Pill type="button" tone="quiet" onClick={() => setOpen(true)} aria-label={`Edit ${label}`} title="Edit">
        <Pencil aria-hidden className="size-3.5" />
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title="Edit reading" description="Correct what this says.">
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
              <Field label="Systolic" name="value" type="number" step="any" defaultValue={value} required autoComplete="off" />
              <Field label="Diastolic" name="secondaryValue" type="number" step="any" defaultValue={secondaryValue ?? ""} autoComplete="off" />
            </div>
          ) : (
            <Field label="Value" name="value" type="number" step="any" defaultValue={value} required autoComplete="off" />
          )}
          <Field label="Unit" name="unit" defaultValue={unit} required autoComplete="off" />
          <Field label="Notes (optional)" name="notes" defaultValue={notes ?? ""} autoComplete="off" />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Saving…" : "Save"}
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
}: {
  householdId: string;
  vital: { id: string; vitalType: VitalType; label: string; value: number; secondaryValue: number | null; unit: string; notes: string | null; status: "active" | "archived" };
}) {
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
      <Pill type="button" tone="soft" disabled={reactivatePending} onClick={() => submit(reactivateAction)} aria-label="Bring back" title="Bring back">
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
      />
      <Pill type="button" tone="quiet" disabled={archivePending} onClick={() => submit(archiveAction)} aria-label="Remove" title="Remove">
        <Trash2 aria-hidden className="size-3.5" />
      </Pill>
    </div>
  );
}
