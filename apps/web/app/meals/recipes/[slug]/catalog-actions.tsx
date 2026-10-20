"use client";

import { BookmarkPlus, CalendarPlus } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";
import { Pill } from "@wonderhome/core/ui/pill";
import { Sheet } from "@wonderhome/core/ui/sheet";

import type { ActionState } from "../../../(auth)/actions";
import { planCatalogRecipeAction, saveCatalogRecipeAction } from "../../../(auth)/recipe-actions";

const SLOTS = ["breakfast", "lunch", "snack", "dinner"] as const;
type Slot = (typeof SLOTS)[number];

export type CatalogActionLabels = {
  plan: string;
  /** `{name}` is the dish's own name. */
  planTitle: string;
  planDescription: string;
  planSubmit: string;
  planning: string;
  slot: string;
  slots: Record<Slot, string>;
  date: string;
  readyBy: string;
  save: string;
  saving: string;
  saved: string;
  inYours: string;
  openYours: string;
};

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? pendingLabel : label}
    </Button>
  );
}

/**
 * A catalog dish's two things to do (25-022): plan it for a day, or keep it as
 * the household's own version to change. Planning saves the copy too, so the
 * meal knows what it needs; once a copy exists the second action is a link to it.
 */
export function CatalogRecipeActions({
  householdId,
  slug,
  name,
  defaultSlot,
  today,
  saved,
  labels,
}: {
  householdId: string;
  slug: string;
  name: string;
  defaultSlot: Slot;
  today: string;
  saved: boolean;
  labels: CatalogActionLabels;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(planCatalogRecipeAction, {});
  const [saving, setSaving] = useState(false);
  const [kept, setKept] = useState(saved);
  const [message, setMessage] = useState<{ tone: "info" | "risk"; text: string } | null>(null);

  return (
    <div className="space-y-2">
      {message ? <Alert tone={message.tone === "info" ? "info" : undefined}>{message.text}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        <Pill type="button" tone="primary" className="gap-1.5" onClick={() => setOpen(true)}>
          <CalendarPlus aria-hidden className="size-4" /> {labels.plan}
        </Pill>
        {kept ? (
          <Link
            href="/meals?tab=recipes"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[var(--wh-border)] bg-[var(--wh-surface)] px-4 text-sm font-medium text-[var(--wh-foreground-muted)] hover:bg-[var(--wh-surface-muted)]"
          >
            <BookmarkPlus aria-hidden className="size-4" /> {labels.openYours}
          </Link>
        ) : (
          <Pill
            type="button"
            tone="soft"
            className="gap-1.5"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              const result = await saveCatalogRecipeAction({ householdId, slug });
              setSaving(false);
              if (result.ok) {
                setKept(true);
                setMessage({ tone: "info", text: labels.saved });
              } else setMessage({ tone: "risk", text: result.error });
            }}
          >
            <BookmarkPlus aria-hidden className="size-4" /> {saving ? labels.saving : labels.save}
          </Pill>
        )}
      </div>

      <Sheet open={open} onOpenChange={setOpen} title={labels.planTitle.replace("{name}", name)} description={labels.planDescription}>
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert>{state.error}</Alert> : null}
          {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
          <input type="hidden" name="householdId" value={householdId} />
          <input type="hidden" name="slug" value={slug} />
          <div className="space-y-1.5">
            <label htmlFor="slot" className="block text-sm font-medium">
              {labels.slot}
            </label>
            <select
              id="slot"
              name="slot"
              defaultValue={defaultSlot}
              className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
            >
              {SLOTS.map((slot) => (
                <option key={slot} value={slot}>
                  {labels.slots[slot]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={labels.date} name="onDate" type="date" required defaultValue={today} />
            <Field label={labels.readyBy} name="readyByTime" type="time" required defaultValue={READY_BY[defaultSlot]} />
          </div>
          <Submit label={labels.planSubmit} pendingLabel={labels.planning} />
        </form>
      </Sheet>
    </div>
  );
}

/** When each meal is usually wanted, as the plan sheet's starting time. */
const READY_BY: Record<Slot, string> = { breakfast: "08:30", lunch: "13:30", snack: "17:00", dinner: "20:00" };
