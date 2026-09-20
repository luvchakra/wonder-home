"use client";

import { Plus } from "lucide-react";
import { useActionState, useState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";
import { Pill } from "@wonderhome/core/ui/pill";
import { Sheet } from "@wonderhome/core/ui/sheet";

import type { ActionState } from "../(auth)/actions";
import { createSchoolItemAction } from "../(auth)/school-actions";

const KINDS = [
  { value: "homework", label: "Homework" },
  { value: "worksheet", label: "Worksheet" },
  { value: "exam", label: "Exam" },
  { value: "project", label: "Project" },
  { value: "event", label: "Event" },
  { value: "notice", label: "Notice" },
];

/** "Add a piece of homework" as a sheet — the manual half of "Connect school". */
export function AddHomeworkButton({ householdId, kids }: { householdId: string; kids: { id: string; displayName: string }[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createSchoolItemAction, {});

  return (
    <>
      <Pill type="button" tone="soft" onClick={() => setOpen(true)} className="gap-1.5">
        <Plus aria-hidden className="size-3.5" /> Add homework
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title="Add a piece of school work" description="WonderHome tracks it against its due date from here — no portal needed.">
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert>{state.error}</Alert> : null}
          {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <div className="space-y-1.5">
            <label htmlFor="childMemberId" className="block text-sm font-medium">For</label>
            <select
              id="childMemberId"
              name="childMemberId"
              className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
            >
              {kids.map((child) => (
                <option key={child.id} value={child.id}>{child.displayName}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="kind" className="block text-sm font-medium">Kind</label>
            <select
              id="kind"
              name="kind"
              defaultValue="homework"
              className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
            >
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </select>
          </div>
          <Field label="What is it?" name="title" required placeholder="Maths worksheet, chapter 4" autoComplete="off" />
          <Field label="Subject (optional)" name="subject" placeholder="Maths" autoComplete="off" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Due (optional)" name="dueAt" type="date" />
            <Field label="Est. minutes (optional)" name="estimatedMinutes" type="number" min={1} placeholder="30" />
          </div>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Adding…" : "Add"}
          </Button>
        </form>
      </Sheet>
    </>
  );
}
