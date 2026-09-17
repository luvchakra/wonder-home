import { CircleCheck, Sparkles, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../../lib/cn";
import { IconTile, type IconTone } from "./icon-tile";
import { Badge } from "./pill";

/**
 * One thing WonderHome believes about the household, with where it came from.
 *
 * The claim is a sentence a family can agree or disagree with. The source is
 * always shown: a belief with no provenance cannot be corrected, only argued
 * with.
 */
export type CertificationItemProps = {
  claim: string;
  status: "learned" | "confirmed" | "needs_review" | "corrected" | "removed";
  source: string;
  risk: "low" | "medium" | "high" | "critical";
  /** Review controls: Confirm, Correct, Remove. */
  controls?: ReactNode;
  className?: string;
};

const STATUS: Record<
  CertificationItemProps["status"],
  { label: string; tone: IconTone; badge: "handled" | "attention" | "neutral" | "risk"; icon: typeof CircleCheck }
> = {
  confirmed: { label: "Confirmed", tone: "handled", badge: "handled", icon: CircleCheck },
  learned: { label: "Learned", tone: "ai", badge: "neutral", icon: Sparkles },
  needs_review: { label: "Needs review", tone: "attention", badge: "attention", icon: TriangleAlert },
  corrected: { label: "Corrected", tone: "neutral", badge: "neutral", icon: CircleCheck },
  removed: { label: "Removed", tone: "neutral", badge: "neutral", icon: CircleCheck },
};

export function CertificationItem({ claim, status, source, risk, controls, className }: CertificationItemProps) {
  const presentation = STATUS[status];

  return (
    <li className={cn("flex gap-3 py-3", className)}>
      <IconTile icon={presentation.icon} tone={presentation.tone} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug">{claim}</p>
        <p className="mt-0.5 text-xs text-[var(--wh-foreground-subtle)]">
          From {source}
          {risk === "critical" || risk === "high" ? " · matters a lot if wrong" : ""}
        </p>
        {controls ? <div className="mt-2 flex flex-wrap gap-1.5">{controls}</div> : null}
      </div>
      <Badge tone={presentation.badge} className="shrink-0 self-start">
        {presentation.label}
      </Badge>
    </li>
  );
}
