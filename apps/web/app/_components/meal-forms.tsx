"use client";

import { Plus } from "lucide-react";
import { useActionState, useState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";
import { Pill } from "@wonderhome/core/ui/pill";
import { Sheet } from "@wonderhome/core/ui/sheet";

import type { ActionState } from "../(auth)/actions";
import { createMealAction } from "../(auth)/meal-actions";

const SLOTS = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "snack", label: "Snack" },
  { value: "dinner", label: "Dinner" },
];

/** "Plan a meal" as a sheet — the manual half of "Plan with AI". */
export function PlanMealButton({ householdId, members }: { householdId: string; members: { id: string; displayName: string }[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createMealAction, {});
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <Pill type="button" tone="soft" onClick={() => setOpen(true)} className="gap-1.5">
        <Plus aria-hidden className="size-3.5" /> Plan a meal
      </Pill>

      <Sheet open={open} onOpenChange={setOpen} title="Plan a meal" description="WonderHome checks the ingredients and everyone's preferences against it from here.">
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert>{state.error}</Alert> : null}
          {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <Field label="What's the meal?" name="name" required placeholder="Rajma chawal" autoComplete="off" />
          <div className="space-y-1.5">
            <label htmlFor="slot" className="block text-sm font-medium">Slot</label>
            <select
              id="slot"
              name="slot"
              defaultValue="dinner"
              className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
            >
              {SLOTS.map((slot) => (
                <option key={slot.value} value={slot.value}>{slot.label}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" name="onDate" type="date" required defaultValue={today} />
            <Field label="Ready by" name="readyByTime" type="time" required defaultValue="20:00" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="cookMemberId" className="block text-sm font-medium">Who’s cooking (optional)</label>
            <select
              id="cookMemberId"
              name="cookMemberId"
              defaultValue=""
              className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
            >
              <option value="">Nobody yet</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>{member.displayName}</option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Planning…" : "Plan meal"}
          </Button>
        </form>
      </Sheet>
    </>
  );
}
