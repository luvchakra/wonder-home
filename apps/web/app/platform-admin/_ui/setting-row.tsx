"use client";

import { useActionState, useState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";
import { PasswordField } from "@wonderhome/core/ui/password-field";
import { Badge, type BadgeTone } from "@wonderhome/core/ui/pill";
import { Select } from "@wonderhome/core/ui/select";

import { clearSettingAction, saveSettingAction, type SettingActionState } from "../settings-actions";

/** What a row is given: the registry entry's words and where its value comes from. Never a secret's value. */
export type SettingRowView = {
  key: string;
  label: string;
  description: string;
  secret: boolean;
  options: readonly { value: string; label: string }[] | null;
  numeric: boolean;
  source: "saved" | "environment" | "default" | "unset";
  /** The value in use (settings only), or a secret's mask. */
  shown: string | null;
  inEnvironment: boolean;
  updatedAt: string | null;
  canEdit: boolean;
  /** Why it can't be changed here, when it can't. */
  lockedReason: string | null;
};

const IDLE: SettingActionState = { tone: null, message: null, key: null };

const SOURCE: Record<SettingRowView["source"], { label: string; tone: BadgeTone }> = {
  saved: { label: "Saved here", tone: "handled" },
  environment: { label: "From Vercel", tone: "attention" },
  default: { label: "Default", tone: "neutral" },
  unset: { label: "Not set", tone: "neutral" },
};

/** Rule 4 for a setting: its name, one line of what it does, where it comes from, then the one thing to do. */
export function SettingRow({ view }: { view: SettingRowView }) {
  const [open, setOpen] = useState(false);
  const [saved, save, saving] = useActionState(saveSettingAction, IDLE);
  const [cleared, clear, clearing] = useActionState(clearSettingAction, IDLE);
  const latest = [saved, cleared].filter((state) => state.message && state.key === view.key);
  const source = SOURCE[view.source];
  const shownOption = view.options?.find((option) => option.value === view.shown)?.label;

  return (
    <li className="space-y-3 border-t border-[var(--wh-border)] py-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold break-words">{view.label}</p>
          <p className="text-sm text-[var(--wh-foreground-muted)]">{view.description}</p>
          <p className="flex flex-wrap items-center gap-2 text-xs text-[var(--wh-foreground-muted)]">
            <Badge tone={source.tone}>{source.label}</Badge>
            {view.shown ? <span className="font-mono break-all">{shownOption ?? view.shown}</span> : null}
            {view.updatedAt ? <span>changed {new Date(view.updatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span> : null}
            <code className="text-[0.6875rem] break-all text-[var(--wh-foreground-subtle)]">{view.key}</code>
          </p>
          {view.source === "saved" && view.inEnvironment ? (
            <p className="text-xs text-[var(--wh-foreground-muted)]">Vercel still has this variable. It is no longer used and can be deleted there.</p>
          ) : null}
        </div>
        {view.canEdit ? (
          <Button type="button" variant="secondary" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
            {open ? "Close" : view.secret ? (view.source === "unset" ? "Add" : "Replace") : "Change"}
          </Button>
        ) : view.lockedReason ? (
          <span className="text-xs text-[var(--wh-foreground-subtle)]">{view.lockedReason}</span>
        ) : null}
      </div>

      {open && view.canEdit ? (
        <div className="space-y-3 rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] p-3">
          <form action={save} className="space-y-3" autoComplete="off">
            <input type="hidden" name="key" value={view.key} />
            {view.options ? (
              <Select label={view.label} name={`value__${view.key}`} defaultValue={view.shown ?? view.options[0]?.value}>
                {view.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            ) : (
              <Field
                label={view.secret ? `New ${view.label.toLowerCase()}` : view.label}
                name={`value__${view.key}`}
                type={view.secret ? "password" : view.numeric ? "number" : "text"}
                inputMode={view.numeric ? "numeric" : undefined}
                defaultValue={view.secret ? undefined : (view.shown ?? undefined)}
                required
                spellCheck={false}
                autoComplete="off"
                hint={view.secret ? "It is stored encrypted and never shown again; only its last four characters are." : undefined}
              />
            )}
            {view.secret ? <PasswordField label="Your password" name={`password__${view.key}`} autoComplete="current-password" required hint="Changing a secret needs your password again." /> : null}
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </form>
          {view.source === "saved" ? (
            <form action={clear} className="space-y-3">
              <input type="hidden" name="key" value={view.key} />
              {view.secret ? <PasswordField label="Your password, to clear it" id={`clear-password__${view.key}`} name={`password__${view.key}`} autoComplete="current-password" required /> : null}
              <Button type="submit" variant="quiet" disabled={clearing}>{clearing ? "Clearing…" : view.inEnvironment ? "Use the Vercel value" : "Use the default"}</Button>
            </form>
          ) : null}
        </div>
      ) : null}

      <div aria-live="polite" className="space-y-2">
        {latest.map((state, index) => (
          <Alert key={index} tone={state.tone === "risk" ? "risk" : "info"}>{state.message}</Alert>
        ))}
      </div>
    </li>
  );
}
