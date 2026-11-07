"use client";

import { useActionState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";

import { saveLandingVariantAction, type LandingActionState } from "./actions";

const IDLE: LandingActionState = { tone: null, message: null };
const CHOICES = [
  { value: "new", label: "New", hint: "The one-page landing: a human opening line, how it works, what it does, questions, one clear start." },
  { value: "classic", label: "Classic", hint: "The earlier, longer landing page." },
] as const;

export function LandingVariantForm({ current }: { current: "new" | "classic" }) {
  const [state, save, saving] = useActionState(saveLandingVariantAction, IDLE);
  return (
    <form action={save} className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Landing page</legend>
        {CHOICES.map((choice) => (
          <label key={choice.value} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] p-3">
            <input type="radio" name="variant" value={choice.value} defaultChecked={choice.value === current} className="mt-1 size-4" />
            <span className="text-sm">
              <span className="block font-semibold">{choice.label}</span>
              <span className="block text-[var(--wh-foreground-muted)]">{choice.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
      <div aria-live="polite">{state.message ? <Alert tone={state.tone === "risk" ? "risk" : "info"}>{state.message}</Alert> : null}</div>
    </form>
  );
}
