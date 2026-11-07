"use client";

import { Check, Copy } from "lucide-react";
import { useActionState, useState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { PasswordField } from "@wonderhome/core/ui/password-field";
import { Badge, type BadgeTone } from "@wonderhome/core/ui/pill";

import { moveAllFromVercelAction, type MoveActionState } from "../settings-actions";

const IDLE: MoveActionState = { tone: null, message: null, report: null };

const OUTCOME: Record<string, { label: string; tone: BadgeTone }> = {
  moved: { label: "Moved", tone: "handled" },
  already: { label: "Already here", tone: "neutral" },
  mismatch: { label: "Check it", tone: "risk" },
  invalid: { label: "Not moved", tone: "attention" },
  failed: { label: "Not moved", tone: "attention" },
};

/**
 * One button that moves every setting Vercel still holds into the portal
 * (owner, 2026-11-07). The owner's password is asked again; what comes back is
 * names and words only, never a value.
 */
export function MoveAllFromVercel({ canMove, stillInVercel }: { canMove: boolean; stillInVercel: number }) {
  const [state, move, moving] = useActionState(moveAllFromVercelAction, IDLE);
  const [copied, setCopied] = useState(false);
  const report = state.report;

  async function copy(list: string[]) {
    try {
      await navigator.clipboard.writeText(list.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // The names are on screen to select by hand.
    }
  }

  return (
    <div className="space-y-4">
      {canMove ? (
        <form action={move} className="space-y-3" autoComplete="off">
          <PasswordField label="Your password" name="password" autoComplete="current-password" required hint="Moving secrets needs your password again." />
          <Button type="submit" disabled={moving}>{moving ? "Moving…" : stillInVercel > 0 ? `Move all from Vercel (${stillInVercel})` : "Move all from Vercel"}</Button>
        </form>
      ) : (
        <p className="text-sm text-[var(--wh-foreground-muted)]">Only the owner can move settings from Vercel.</p>
      )}

      <div aria-live="polite">{state.message ? <Alert tone={state.tone === "risk" ? "risk" : "info"}>{state.message}</Alert> : null}</div>

      {report && report.items.length > 0 ? (
        <ul className="space-y-2">
          {report.items.map((row) => (
            <li key={row.key} className="space-y-1 border-t border-[var(--wh-border)] pt-2 first:border-t-0 first:pt-0">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold break-words">
                {row.label}
                <Badge tone={OUTCOME[row.outcome]?.tone ?? "neutral"}>{OUTCOME[row.outcome]?.label ?? row.outcome}</Badge>
              </p>
              <p className="text-sm text-[var(--wh-foreground-muted)]">{row.words}</p>
              <code className="text-[0.6875rem] break-all text-[var(--wh-foreground-subtle)]">{row.key}</code>
            </li>
          ))}
        </ul>
      ) : null}

      {report && report.safeToDelete.length > 0 ? (
        <div className="space-y-2 rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">Safe to delete in Vercel ({report.safeToDelete.length})</p>
            <Button type="button" variant="secondary" onClick={() => copy(report.safeToDelete)}>
              {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
              {copied ? "Copied" : "Copy list"}
            </Button>
          </div>
          <p className="text-xs text-[var(--wh-foreground-muted)]">The portal&apos;s values are already in use. Delete these in Vercel (project wonderhome → Settings → Environment Variables), then redeploy.</p>
          <ul className="space-y-1">
            {report.safeToDelete.map((key) => (
              <li key={key}>
                <code className="text-xs break-all">{key}</code>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {report && report.mustStay.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold">Must stay in Vercel ({report.mustStay.length})</p>
          <ul className="space-y-1">
            {report.mustStay.map((stay) => (
              <li key={stay.key} className="text-sm">
                <code className="text-xs break-all">{stay.key}</code>
                <span className="text-[var(--wh-foreground-muted)]">: {stay.why}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
