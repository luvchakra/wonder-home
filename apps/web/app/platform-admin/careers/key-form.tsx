"use client";

import { useActionState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";

import { clearCareersKeyAction, saveCareersKeyAction, testCareersConnectionAction, type KeyActionState } from "./actions";

const IDLE: KeyActionState = { tone: null, message: null };

/** Paste, save, test and clear. The key goes up once, in the form; it never comes back down. */
export function CareersKeyForm({ configured }: { configured: boolean }) {
  const [saved, save, saving] = useActionState(saveCareersKeyAction, IDLE);
  const [tested, test, testing] = useActionState(testCareersConnectionAction, IDLE);
  const [cleared, clear, clearing] = useActionState(clearCareersKeyAction, IDLE);
  const latest = [saved, tested, cleared].filter((state) => state.message);

  return (
    <div className="space-y-4">
      <form action={save} className="space-y-3" autoComplete="off">
        <Field
          label={configured ? "Replace the career site key" : "Career site key"}
          name="key"
          type="password"
          required
          spellCheck={false}
          autoComplete="off"
          placeholder="wjcs_…"
          hint="From WonderJobs → Hiring → Jobs → Career sites → Add a career site → On our own website. It is shown there once."
        />
        <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save key"}</Button>
      </form>
      <div className="flex flex-wrap gap-2">
        <form action={test}>
          <Button type="submit" variant="secondary" disabled={testing || !configured}>{testing ? "Testing…" : "Test connection"}</Button>
        </form>
        {configured ? (
          <form action={clear}>
            <Button type="submit" variant="quiet" disabled={clearing}>{clearing ? "Clearing…" : "Clear key"}</Button>
          </form>
        ) : null}
      </div>
      <div aria-live="polite" className="space-y-2">
        {latest.map((state, index) => (
          <Alert key={index} tone={state.tone === "risk" ? "risk" : "info"}>{state.message}</Alert>
        ))}
      </div>
    </div>
  );
}
