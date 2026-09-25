import { CircleCheck, Sparkles, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { ExpandableRow } from "./expandable-row";
import { IconTile, type IconTone } from "./icon-tile";
import { Badge } from "./pill";

/**
 * One thing WonderHome believes about the household, with where it came from.
 *
 * The claim is a sentence a family can agree or disagree with. It opens like
 * every other row in the app (rule 4) to the full picture — source, category,
 * risk, when it was last checked — with the confirm/correct/remove controls
 * behind the same chevron, so the collapsed list stays scannable and nothing
 * here is a guess about confidence: a count and a date, not a vibe.
 */
export type CertificationItemProps = {
  claim: string;
  status: "learned" | "confirmed" | "needs_review" | "corrected" | "removed";
  /** Where this came from, in a few words — "setup", "something you said". */
  sourceLabel: string;
  category: string;
  risk: "low" | "medium" | "high" | "critical";
  /** Preformatted, since only the page knows the household's timezone. Null when never reviewed. */
  lastReviewed: string | null;
  /** When WonderHome first learned it, preformatted. */
  learnedAt?: string | null;
  /** How sure WonderHome is, in words — never a number it cannot explain. */
  confidence?: string | null;
  /** Why it needs a look right now, when it does — the alert's own explanation. */
  reason?: string;
  /** Review controls: Confirm, Correct, Remove. */
  controls?: ReactNode;
  /** Overrides the status word on the badge — "Needs fixing" rather than "Needs review" when the alert says what kind of look it needs. */
  badgeLabel?: string;
  /** The row's own words in the reader's language (story 22-004); English otherwise. */
  labels?: CertificationItemLabels;
};

/** `from` carries `{source}` and `{category}`, filled in here. */
export type CertificationItemLabels = {
  from: string;
  source: string;
  category: string;
  learned: string;
  confidence: string;
  matters: string;
  lastChecked: string;
  never: string;
  status: Record<CertificationItemProps["status"], string>;
  risk: Record<CertificationItemProps["risk"], string>;
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

const RISK_LABEL: Record<CertificationItemProps["risk"], string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};
const RISK_BADGE: Record<CertificationItemProps["risk"], "handled" | "attention" | "neutral" | "risk"> = {
  low: "neutral",
  medium: "attention",
  high: "risk",
  critical: "risk",
};

const ENGLISH: CertificationItemLabels = {
  from: "From {source} · {category}",
  source: "Source",
  category: "Category",
  learned: "When learned",
  confidence: "Confidence",
  matters: "How much it matters",
  lastChecked: "Last checked",
  never: "Never",
  status: { confirmed: "Confirmed", learned: "Learned", needs_review: "Needs review", corrected: "Corrected", removed: "Removed" },
  risk: RISK_LABEL,
};

function Fact({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-[var(--wh-foreground-subtle)] uppercase">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

export function CertificationItem({
  claim,
  status,
  sourceLabel,
  category,
  risk,
  lastReviewed,
  learnedAt,
  confidence,
  reason,
  controls,
  badgeLabel,
  labels = ENGLISH,
}: CertificationItemProps) {
  const presentation = STATUS[status];
  const from = labels.from.replace("{source}", () => sourceLabel).replace("{category}", () => category);

  return (
    <ExpandableRow
      summary={
        <>
          <IconTile icon={presentation.icon} tone={presentation.tone} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium leading-snug">{claim}</span>
            <span className="block text-xs text-[var(--wh-foreground-subtle)]">{from}</span>
          </span>
          <Badge tone={presentation.badge} className="shrink-0">
            {badgeLabel ?? labels.status[status] ?? presentation.label}
          </Badge>
        </>
      }
    >
      <div className="space-y-3">
        {reason ? <p className="text-sm text-[var(--wh-foreground-muted)]">{reason}</p> : null}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          <Fact label={labels.source} value={sourceLabel} />
          <Fact label={labels.category} value={category} />
          <Fact label={labels.learned} value={learnedAt ?? null} />
          <Fact label={labels.confidence} value={confidence ?? null} />
          <div>
            <dt className="text-xs font-medium tracking-wide text-[var(--wh-foreground-subtle)] uppercase">{labels.matters}</dt>
            <dd className="text-sm">
              <Badge tone={RISK_BADGE[risk]}>{labels.risk[risk]}</Badge>
            </dd>
          </div>
          <Fact label={labels.lastChecked} value={lastReviewed ?? labels.never} />
        </dl>
        {controls ? <div className="flex flex-wrap gap-1.5">{controls}</div> : null}
      </div>
    </ExpandableRow>
  );
}
