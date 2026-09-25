"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { PasswordField } from "@wonderhome/core/ui/password-field";

import type { ActionState } from "../(auth)/actions";

/** The key form's words in the viewer's language, built on the server (story 22-004). */
export type AiKeyFormLabels = {
  provider: string;
  apiKey: string;
  hint: string;
  replace: string;
  useOwn: string;
  saving: string;
  remove: string;
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
 * Setting a household's own model key.
 *
 * The field is a password field, so a key is not left readable over
 * somebody's shoulder, and it is never pre-filled: the value cannot be read
 * back out of the database at all, so there would be nothing honest to put
 * in it.
 */
export function AiKeyForm({
  householdId,
  save,
  remove,
  configured,
  labels,
}: {
  householdId: string;
  save: (state: ActionState, formData: FormData) => Promise<ActionState>;
  remove: (state: ActionState, formData: FormData) => Promise<ActionState>;
  configured: boolean;
  labels: AiKeyFormLabels;
}) {
  const [saveState, saveAction] = useActionState(save, {});
  const [removeState, removeAction] = useActionState(remove, {});
  const state = saveState.error || saveState.notice ? saveState : removeState;

  return (
    <div className="space-y-3">
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}

      <form action={saveAction} className="space-y-3">
        <input type="hidden" name="householdId" value={householdId} />
        <div className="space-y-1.5">
          <label htmlFor="provider" className="block text-sm font-medium">{labels.provider}</label>
          <select
            id="provider"
            name="provider"
            defaultValue="anthropic"
            className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
          >
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="google">Google (Gemini)</option>
            <option value="openai">OpenAI</option>
          </select>
        </div>
        <PasswordField
          label={labels.apiKey}
          name="apiKey"
          required
          minLength={20}
          autoComplete="off"
          placeholder="sk-…"
          hint={labels.hint}
        />
        <Submit
          label={configured ? labels.replace : labels.useOwn}
          pendingLabel={labels.saving}
        />
      </form>

      {configured ? (
        <form action={removeAction}>
          <input type="hidden" name="householdId" value={householdId} />
          <Button type="submit" variant="secondary" className="w-full">
            {labels.remove}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
