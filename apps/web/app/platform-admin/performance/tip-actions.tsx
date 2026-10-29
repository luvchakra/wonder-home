"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";

import { runPerformanceAction, type PerformanceActionState } from "./actions";

const IDLE: PerformanceActionState = { tone: null, message: null };

/** Everything the server worked out for one run button; plain data, no functions. */
export type RunButtonProps = {
  action: "analyze" | "reset_statements" | "end_idle_sessions";
  target: string | null;
  label: string;
  what: string;
  reversible: string;
  impact: string;
  stepUp: boolean;
  /** Whether this person's role may run it. */
  allowed: boolean;
  /** "Never run", "Ran on …" or "Failed on …: reason". */
  status: string;
};

export type CopyButtonProps = { label: string; sql: string; note: string };

const MINUTES = [5, 10, 30, 60];

function RunButton(props: RunButtonProps) {
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState(10);
  const [state, run, pending] = useActionState(runPerformanceAction, IDLE);
  const idle = props.action === "end_idle_sessions";
  const previewed = idle && (state.preview ?? 0) > 0 && state.previewMinutes === minutes;
  const finished = state.message !== null && state.preview === undefined;

  if (!props.allowed) {
    return (
      <div className="space-y-1">
        <Button type="button" variant="secondary" disabled className="w-full sm:w-auto">{props.label}</Button>
        <p className="text-xs text-[var(--wh-foreground-muted)]">Needs the platform owner role. {props.status}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="secondary" className="w-full sm:w-auto" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {props.label}
      </Button>
      <p className="break-words text-xs text-[var(--wh-foreground-muted)]">{props.status}</p>
      {open ? (
        <form action={run} className="space-y-3 rounded-[var(--wh-radius-card)] border border-[var(--wh-border)] p-3" autoComplete="off">
          <input type="hidden" name="action" value={props.action} />
          {props.target ? <input type="hidden" name="target" value={props.target} /> : null}
          <dl className="space-y-1 text-sm">
            <div><dt className="inline font-semibold">What this does: </dt><dd className="inline">{props.what}</dd></div>
            <div><dt className="inline font-semibold">Can it be undone? </dt><dd className="inline">{props.reversible}</dd></div>
            <div><dt className="inline font-semibold">Expected effect: </dt><dd className="inline">{props.impact}</dd></div>
          </dl>
          {idle ? (
            <label className="block space-y-1 text-sm">
              <span className="font-semibold">Stuck for more than</span>
              <select name="minutes" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="block w-full rounded-[var(--wh-radius-input)] border border-[var(--wh-border)] bg-transparent px-3 py-2 sm:w-auto">
                {MINUTES.map((m) => <option key={m} value={m}>{m} minutes</option>)}
              </select>
            </label>
          ) : null}
          {props.stepUp && (!idle || previewed) ? (
            <label className="block space-y-1 text-sm">
              <span className="font-semibold">Confirm it is you: your password</span>
              <input type="password" name="password" required autoComplete="current-password" className="block w-full rounded-[var(--wh-radius-input)] border border-[var(--wh-border)] bg-transparent px-3 py-2 sm:max-w-xs" />
            </label>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {idle && !previewed ? (
              <Button type="submit" name="step" value="preview" disabled={pending} className="w-full sm:w-auto">{pending ? "Counting…" : "Show how many"}</Button>
            ) : (
              <Button type="submit" name="step" value="run" disabled={pending} className="w-full sm:w-auto">
                {pending ? "Working…" : idle ? `End ${state.preview} ${state.preview === 1 ? "connection" : "connections"}` : "Yes, run it"}
              </Button>
            )}
            <Button type="button" variant="quiet" onClick={() => setOpen(false)} className="w-full sm:w-auto">Cancel</Button>
          </div>
        </form>
      ) : null}
      <div aria-live="polite">
        {state.message ? <Alert tone={state.tone === "risk" ? "risk" : "info"}>{state.message}</Alert> : null}
        {finished ? <span className="sr-only">Finished</span> : null}
      </div>
    </div>
  );
}

function CopyButton({ label, sql, note }: CopyButtonProps) {
  const [copied, setCopied] = useState<"yes" | "no" | null>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sql);
      setCopied("yes");
    } catch {
      setCopied("no");
    }
  };
  return (
    <div className="space-y-2">
      <Button type="button" variant="secondary" onClick={copy} className="w-full sm:w-auto">{copied === "yes" ? "Copied" : label}</Button>
      <p className="break-words text-xs text-[var(--wh-foreground-muted)]">{note}</p>
      <details className="text-xs" open={copied === "no"}>
        <summary className="cursor-pointer">{copied === "no" ? "Copying was blocked: select and copy this" : "Show the SQL"}</summary>
        <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all rounded-[var(--wh-radius-card)] bg-[var(--wh-surface-muted)] p-2 font-mono">{sql}</pre>
      </details>
    </div>
  );
}

function TaskButton({ text, story }: { text: string; story: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="quiet"
        className="w-full sm:w-auto"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? "Task text copied" : `Create a task (${story})`}
      </Button>
    </div>
  );
}

/** The buttons under one tip: run, copy, and task text. */
export function TipActions({ runs, copies, task }: { runs: RunButtonProps[]; copies: CopyButtonProps[]; task: { text: string; story: string } }) {
  return (
    <div className="space-y-3 pt-2">
      {runs.map((r) => <RunButton key={`${r.action}:${r.target ?? ""}`} {...r} />)}
      {copies.map((c) => <CopyButton key={c.label} {...c} />)}
      <TaskButton {...task} />
    </div>
  );
}

/** Re-reads every figure now. Read only. */
export function RecheckButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button type="button" variant="secondary" disabled={pending} onClick={() => start(() => router.refresh())} className="w-full sm:w-auto">
      {pending ? "Checking…" : "Re-run the checks now"}
    </Button>
  );
}
