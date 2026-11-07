"use client";

import { Sparkles } from "lucide-react";
import { useActionState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { IconTile } from "@wonderhome/core/ui/icon-tile";

import type { ActionState } from "../(auth)/actions";
import { forgetLearnedAction } from "../(auth)/consent-actions";

export type LearnedRow = {
  id: string;
  /** "class2@lakeside.edu → Tara" */
  name: string;
  /** "Learned when Simran said so · 3 Nov" or "Asked again now: sent for two children". */
  reason: string;
};

/**
 * "What HomeSend has learned" (story 14-066): every sender HomeSend now
 * knows the child for, because someone told it once. Every member sees the
 * list; only an Admin forgets (one row, or all), and HomeSend asks again the
 * next time. The one editor of it (rule 23).
 */
export function HomeSendLearned({
  householdId,
  rows,
  manages,
  labels,
}: {
  householdId: string;
  rows: LearnedRow[];
  manages: boolean;
  labels: { title: string; intro: string; empty: string; forget: string; forgetAll: string; forgotten: string; adminDecides: string };
}) {
  const [state, forget, pending] = useActionState<ActionState, FormData>(forgetLearnedAction, {});

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <IconTile icon={Sparkles} tone="ai" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{labels.title}</p>
          <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{rows.length > 0 ? labels.intro : labels.empty}</p>
        </div>
      </div>
      {rows.length > 0 ? (
        <ul className="divide-y divide-[var(--wh-border)]">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium break-words">{row.name}</p>
                <p className="text-xs text-[var(--wh-foreground-subtle)]">{row.reason}</p>
              </div>
              {manages ? (
                <form action={forget}>
                  <input type="hidden" name="householdId" value={householdId} />
                  <input type="hidden" name="id" value={row.id} />
                  <button type="submit" disabled={pending} className="rounded-full px-3 py-1.5 text-sm font-medium text-[var(--wh-primary)] hover:bg-[var(--wh-surface-muted)] disabled:opacity-50">
                    {labels.forget}
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {manages && rows.length > 1 ? (
        <form action={forget}>
          <input type="hidden" name="householdId" value={householdId} />
          <button type="submit" disabled={pending} className="text-sm font-medium text-[var(--wh-foreground-muted)] underline-offset-2 hover:underline disabled:opacity-50">
            {labels.forgetAll}
          </button>
        </form>
      ) : null}
      {!manages && rows.length > 0 ? <p className="text-xs text-[var(--wh-foreground-subtle)]">{labels.adminDecides}</p> : null}
      {state.notice ? <p className="text-xs text-[var(--wh-foreground-muted)]" aria-live="polite">{labels.forgotten}</p> : null}
      {state.error ? <Alert>{state.error}</Alert> : null}
    </div>
  );
}
