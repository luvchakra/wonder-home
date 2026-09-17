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
  state: "prepared" | "needs_approval" | "approved" | "rejected" | "executed" | "refused";
  understood: string;
  plan: readonly string[];
  impact: string;
  reversible?: boolean;
  /** Confirm / Change / Cancel, rendered by the caller so it owns the handlers. */
  controls?: ReactNode;
  className?: string;
};

const STATE: Record<ActionPreviewProps["state"], { label: string; tone: "attention" | "handled" | "neutral" | "risk" }> = {
  prepared: { label: "Prepared, not done", tone: "neutral" },
  needs_approval: { label: "Waiting for your OK", tone: "attention" },
  approved: { label: "Approved", tone: "handled" },
  rejected: { label: "Left alone", tone: "neutral" },
  executed: { label: "Done", tone: "handled" },
  refused: { label: "Not allowed", tone: "risk" },
};

export function ActionPreview({ state, understood, plan, impact, reversible, controls, className }: ActionPreviewProps) {
  const badge = STATE[state];

  return (
    <section
      aria-label="Action preview"
      className={cn(
        "rounded-[var(--wh-radius)] border bg-[var(--wh-surface)] shadow-[var(--wh-shadow-card)]",
        state === "needs_approval" ? "border-[var(--wh-attention)]/40" : "border-[var(--wh-border)]",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b border-[var(--wh-border)] px-4 py-2.5">
        <span className="text-xs font-semibold tracking-wide text-[var(--wh-foreground-muted)] uppercase">
          Action preview
        </span>
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </header>

      <dl className="space-y-3 px-4 py-3.5">
        <Row icon={CircleHelp} label="What I understood">
          {understood}
        </Row>
        <Row icon={ListChecks} label={state === "executed" ? "What I did" : state === "approved" ? "What I will do" : "What I plan to do"}>
          <ul className="list-disc space-y-0.5 pl-4">
            {plan.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </Row>
        <Row icon={Eye} label="Impact">
          {impact}
          {typeof reversible === "boolean" ? (
            <span className="mt-1 flex items-center gap-1 text-xs text-[var(--wh-foreground-subtle)]">
              <ShieldCheck aria-hidden className="size-3.5" />
              {reversible ? "Can be undone." : "Cannot be undone once it happens."}
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
