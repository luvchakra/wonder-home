import { CircleHelp, Eye, ListChecks, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../../lib/cn";
import { Badge } from "./pill";

/**
 * What WonderHome is about to do, laid out before it does it (requirements
 * §48): what it understood, what it plans, the impact, and the controls.
 *
 * The same card serves the conversation (an AI action preview) and the approval
 * queue (an approval card). A pending proposal and an executed one look
 * different on purpose — the state badge and the presence of controls — so
 * nobody mistakes "will do" for "did".
 */
export type ActionPreviewProps = {
  state: "prepared" | "needs_approval" | "approved" | "rejected" | "executed" | "unchanged" | "refused";
  understood: string;
  plan: readonly string[];
  impact: string;
  reversible?: boolean;
  /** Confirm / Change / Cancel, rendered by the caller so it owns the handlers. */
  controls?: ReactNode;
  className?: string;
  labels?: ActionPreviewLabels;
};

const TONE: Record<ActionPreviewProps["state"], "attention" | "handled" | "neutral" | "risk"> = {
  prepared: "neutral",
  needs_approval: "attention",
  approved: "handled",
  rejected: "neutral",
  executed: "handled",
  unchanged: "neutral",
  refused: "risk",
};

/** The preview's own words (story 22-004); English unless a screen passes the viewer's. */
export type ActionPreviewLabels = {
  title: string;
  state: Record<ActionPreviewProps["state"], string>;
  understood: string;
  plan: string;
  did: string;
  found: string;
  willDo: string;
  impact: string;
  reversible: string;
  irreversible: string;
};

export const ACTION_PREVIEW_LABELS: ActionPreviewLabels = {
  title: "Action preview",
  state: {
    prepared: "Prepared, not done",
    needs_approval: "Waiting for your OK",
    approved: "Approved",
    rejected: "Left alone",
    executed: "Done",
    // The step ran and found nothing to write. Never "Done" (Wave 4 §12).
    unchanged: "Nothing to change",
    refused: "Not allowed",
  },
  understood: "What I understood",
  plan: "What I plan to do",
  did: "What I did",
  found: "What I found",
  willDo: "What I will do",
  impact: "Impact",
  reversible: "Can be undone.",
  irreversible: "Cannot be undone once it happens.",
};

export function ActionPreview({ state, understood, plan, impact, reversible, controls, className, labels = ACTION_PREVIEW_LABELS }: ActionPreviewProps) {
  const badge = { label: labels.state[state], tone: TONE[state] };

  return (
    <section
      aria-label={labels.title}
      className={cn(
        "rounded-[var(--wh-radius)] border bg-[var(--wh-surface)] shadow-[var(--wh-shadow-card)]",
        state === "needs_approval" ? "border-[var(--wh-attention)]/40" : "border-[var(--wh-border)]",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b border-[var(--wh-border)] px-4 py-2.5">
        <span className="text-xs font-semibold tracking-wide text-[var(--wh-foreground-muted)] uppercase">
          {labels.title}
        </span>
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </header>

      <dl className="space-y-3 px-4 py-3.5">
        <Row icon={CircleHelp} label={labels.understood}>
          {understood}
        </Row>
        <Row icon={ListChecks} label={state === "executed" ? labels.did : state === "unchanged" ? labels.found : state === "approved" ? labels.willDo : labels.plan}>
          <ul className="list-disc space-y-0.5 pl-4">
            {plan.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </Row>
        <Row icon={Eye} label={labels.impact}>
          {impact}
          {typeof reversible === "boolean" ? (
            <span className="mt-1 flex items-center gap-1 text-xs text-[var(--wh-foreground-subtle)]">
              <ShieldCheck aria-hidden className="size-3.5" />
              {reversible ? labels.reversible : labels.irreversible}
            </span>
          ) : null}
        </Row>
      </dl>

      {controls ? (
        <footer className="flex flex-wrap gap-2 border-t border-[var(--wh-border)] px-4 py-3">{controls}</footer>
      ) : null}
    </section>
  );
}

function Row({ icon: Icon, label, children }: { icon: typeof Eye; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--wh-primary)]" />
      <div className="min-w-0">
        <dt className="text-[0.6875rem] font-semibold tracking-wide text-[var(--wh-foreground-subtle)] uppercase">
          {label}
        </dt>
        <dd className="mt-0.5 text-sm leading-relaxed">{children}</dd>
      </div>
    </div>
  );
}
