"use client";

import { Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { startTransition, useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Field } from "@wonderhome/core/ui/field";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Badge, Pill } from "@wonderhome/core/ui/pill";
import { ConfirmationSheet, Sheet } from "@wonderhome/core/ui/sheet";

import { createDeveloperKeyAction, revokeDeveloperKeyAction, type DeveloperKeyState } from "../(auth)/developer-actions";

export type DeveloperKeyRow = {
  id: string;
  name: string;
  environment: "sandbox" | "live";
  prefix: string;
  scopes: string[];
  /** Already in the household's words, e.g. "Used 25 Sept, 3:10 pm". */
  lastUsed: string;
  expires: string | null;
  revoked: boolean;
};

export type ScopeChoice = { value: string; label: string };

/**
 * The section's words in the viewer's language, built on the server by
 * `developerKeyLabels` (story 22-004). `{name}` is filled in here with the
 * key's own name, which is never translated.
 */
export type DeveloperKeyLabels = {
  intro: string;
  newKey: string;
  none: string;
  revoked: string;
  live: string;
  sandbox: string;
  sheetTitle: string;
  sheetLede: string;
  copied: string;
  copy: string;
  name: string;
  namePlaceholder: string;
  kind: string;
  sandboxLede: string;
  liveLede: string;
  mayDo: string;
  expiresAfter: string;
  days30: string;
  days90: string;
  year: string;
  never: string;
  create: string;
  creating: string;
  revoke: string;
  revokeTitle: string;
  revokeLede: string;
  revokeConfirm: string;
};

const withName = (template: string, name: string) => template.replace(/\{name\}/g, () => name);

const SELECT =
  "block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base";

function Submit({ label, pending: pendingLabel }: { label: string; pending: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? pendingLabel : label}
    </Button>
  );
}

/**
 * Partner keys (story 18-008): create one — shown in full once, with a copy
 * button — and revoke one. What a key may do is picked from a fixed list
 * (rule 20), and a sandbox key is the default, because it touches nothing.
 */
export function DeveloperKeys({ householdId, keys, scopes, labels }: { householdId: string; keys: DeveloperKeyRow[]; scopes: ScopeChoice[]; labels: DeveloperKeyLabels }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<DeveloperKeyState, FormData>(createDeveloperKeyAction, {});
  const [copied, setCopied] = useState(false);
  // Shown once: closing the sheet puts the key away for good.
  const [dismissed, setDismissed] = useState<string | null>(null);
  const revealed = state.key && state.key !== dismissed ? state.key : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-sm text-[var(--wh-foreground-muted)]">{labels.intro}</p>
        <Pill type="button" tone="soft" className="gap-1.5" onClick={() => setOpen(true)}>
          <Plus aria-hidden className="size-3.5" /> {labels.newKey}
        </Pill>
      </div>

      {keys.length === 0 ? (
        <p className="text-sm text-[var(--wh-foreground-subtle)]">{labels.none}</p>
      ) : (
        <ul className="divide-y divide-[var(--wh-border)]">
          {keys.map((key) => (
            <li key={key.id} className="flex items-start gap-3 py-3">
              <IconTile icon={KeyRound} tone={key.environment === "live" ? "ai" : "care"} />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-medium break-words">
                  {key.name}{" "}
                  <Badge tone={key.revoked ? "neutral" : key.environment === "live" ? "attention" : "handled"}>
                    {key.revoked ? labels.revoked : key.environment === "live" ? labels.live : labels.sandbox}
                  </Badge>
                </p>
                <p className="font-mono text-xs break-all text-[var(--wh-foreground-muted)]">{key.prefix}…</p>
                <p className="text-xs text-[var(--wh-foreground-muted)]">{key.scopes.join(", ")}</p>
                <p className="text-xs text-[var(--wh-foreground-subtle)]">
                  {key.lastUsed}
                  {key.expires ? ` · ${key.expires}` : ""}
                </p>
              </div>
              {key.revoked ? null : <RevokeKey householdId={householdId} keyId={key.id} name={key.name} labels={labels} />}
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          setCopied(false);
          if (!next && state.key) setDismissed(state.key);
        }}
        title={labels.sheetTitle}
        description={labels.sheetLede}
      >
        {revealed ? (
          <div className="space-y-3">
            <Alert tone="info">{state.notice}</Alert>
            <p className="rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface-muted)] p-3 font-mono text-sm break-all">{revealed}</p>
            <Button
              type="button"
              className="w-full gap-2"
              onClick={() => {
                void navigator.clipboard?.writeText(revealed).then(() => setCopied(true));
              }}
            >
              <Copy aria-hidden className="size-4" /> {copied ? labels.copied : labels.copy}
            </Button>
          </div>
        ) : (
          <form action={action} className="space-y-3">
            {state.error ? <Alert>{state.error}</Alert> : null}
            <input type="hidden" name="householdId" value={householdId} />
            <Field label={labels.name} name="name" required placeholder={labels.namePlaceholder} autoComplete="off" />
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{labels.kind}</legend>
              <label className="flex min-h-11 items-start gap-3 text-sm">
                <input type="radio" name="environment" value="sandbox" defaultChecked className="mt-0.5 size-5 accent-[var(--wh-primary)]" />
                <span>{labels.sandboxLede}</span>
              </label>
              <label className="flex min-h-11 items-start gap-3 text-sm">
                <input type="radio" name="environment" value="live" className="mt-0.5 size-5 accent-[var(--wh-primary)]" />
                <span>{labels.liveLede}</span>
              </label>
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{labels.mayDo}</legend>
              {scopes.map((scope) => (
                <label key={scope.value} className="flex min-h-11 items-start gap-3 text-sm">
                  <input type="checkbox" name="scopes" value={scope.value} defaultChecked={scope.value !== "groceries.write"} className="mt-0.5 size-5 accent-[var(--wh-primary)]" />
                  <span>{scope.label}</span>
                </label>
              ))}
            </fieldset>
            <div className="space-y-1.5">
              <label htmlFor="expiresInDays" className="block text-sm font-medium">
                {labels.expiresAfter}
              </label>
              <select id="expiresInDays" name="expiresInDays" defaultValue="90" className={SELECT}>
                <option value="30">{labels.days30}</option>
                <option value="90">{labels.days90}</option>
                <option value="365">{labels.year}</option>
                <option value="never">{labels.never}</option>
              </select>
            </div>
            <Submit label={labels.create} pending={labels.creating} />
          </form>
        )}
      </Sheet>
    </div>
  );
}

function RevokeKey({ householdId, keyId, name, labels }: { householdId: string; keyId: string; name: string; labels: DeveloperKeyLabels }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<DeveloperKeyState, FormData>(revokeDeveloperKeyAction, {});
  return (
    <>
      <Pill type="button" tone="quiet" onClick={() => setOpen(true)} aria-label={withName(labels.revoke, name)} title={withName(labels.revoke, name)}>
        <Trash2 aria-hidden className="size-3.5" />
      </Pill>
      <ConfirmationSheet
        open={open}
        onOpenChange={setOpen}
        title={withName(labels.revokeTitle, name)}
        description={labels.revokeLede}
        confirmLabel={labels.revokeConfirm}
        destructive
        pending={pending}
        onConfirm={() => {
          const formData = new FormData();
          formData.set("householdId", householdId);
          formData.set("keyId", keyId);
          startTransition(() => action(formData));
        }}
      >
        {state.error ? <p className="text-sm text-[var(--wh-risk)]">{state.error}</p> : null}
      </ConfirmationSheet>
    </>
  );
}
