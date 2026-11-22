"use client";

import { useActionState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";

import { testWhatsAppAction, type WhatsAppTestState } from "../whatsapp-test-actions";

const IDLE: WhatsAppTestState = { ok: null, summary: null, lines: [] };

/** "Test WhatsApp": one button, then one plain line per check, ✓ or ✗ and what to do. Never a secret. */
export function WhatsAppTest() {
  const [state, run, running] = useActionState(testWhatsAppAction, IDLE);
  return (
    <div className="space-y-3">
      <form action={run} className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary" disabled={running}>
          {running ? "Testing…" : "Test WhatsApp"}
        </Button>
        <span className="text-sm text-[var(--wh-foreground-muted)]">Checks the settings, the token, Meta&apos;s webhook and the live webhook. Sends nothing to anyone.</span>
      </form>
      {state.summary ? <Alert tone={state.ok === false ? "risk" : "info"}>{state.summary}</Alert> : null}
      {state.lines.length > 0 ? (
        <ul className="space-y-2">
          {state.lines.map((line) => (
            <li key={line.id} className="text-sm">
              <span aria-hidden className="mr-1.5">{line.ok === true ? "✓" : line.ok === false ? "✗" : "–"}</span>
              <span className="font-medium">{line.title}</span>
              <span className="block break-words text-[var(--wh-foreground-muted)]">{line.detail}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
