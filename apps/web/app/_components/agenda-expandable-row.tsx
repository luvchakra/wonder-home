import type { HomeAssessment } from "@wonderhome/core/home/assessment";
import { ExpandableRow } from "@wonderhome/core/ui/expandable-row";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Badge, PillLink } from "@wonderhome/core/ui/pill";

import { formatDate } from "../_lib/session";
import { actionLabelFor, presentationFor } from "./agenda-row";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  on_track: "On track",
  at_risk: "At risk",
  blocked: "Blocked",
  met: "Done",
  missed: "Missed",
  cancelled: "Cancelled",
};

const RISK_TONE = { none: "handled", low: "neutral", medium: "attention", high: "risk" } as const;
const RISK_LABEL: Record<string, string> = { none: "None", low: "Low", medium: "Medium", high: "High" };

function Fact({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-[var(--wh-foreground-subtle)] uppercase">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

/**
 * Any domain's assessment as a chevron row — full actionable detail lives
 * behind the arrow, not squeezed into the summary line. Domain-neutral (it
 * only depends on the shared `HomeAssessment` shape), so Home & Upkeep and
 * Groceries' "Smart insights" both use this one component rather than each
 * inventing its own.
 */
export function AgendaExpandableRow({ item, timezone, href }: { item: HomeAssessment; timezone: string; href?: string }) {
  const presentation = presentationFor(item.subjectKey);
  const label = item.action ? actionLabelFor(item.action.action) : null;
  const statusLabel = STATUS_LABEL[item.status] ?? item.status.replace(/_/g, " ");

  return (
    <ExpandableRow
      summary={
        <>
          <IconTile icon={presentation.icon} tone={presentation.tone} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{item.title}</span>
            <span className="block truncate text-xs text-[var(--wh-foreground-subtle)]">{item.reason}</span>
          </span>
          {label ? (
            <span className="shrink-0">
              <PillLink href={href ?? presentation.href} tone={item.riskLevel === "high" ? "primary" : "soft"}>
                {label}
              </PillLink>
            </span>
          ) : null}
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-[var(--wh-foreground-muted)]">{item.reason}</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          <div>
            <dt className="text-xs font-medium tracking-wide text-[var(--wh-foreground-subtle)] uppercase">Status</dt>
            <dd className="text-sm">
              <Badge tone={item.status === "missed" || item.status === "blocked" ? "risk" : item.status === "met" ? "handled" : item.status === "at_risk" ? "attention" : "neutral"}>
                {statusLabel}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium tracking-wide text-[var(--wh-foreground-subtle)] uppercase">Risk</dt>
            <dd className="text-sm">
              <Badge tone={RISK_TONE[item.riskLevel]}>{RISK_LABEL[item.riskLevel] ?? item.riskLevel}</Badge>
            </dd>
          </div>
          <Fact label="Due" value={item.dueOn ? formatDate(timezone, new Date(item.dueOn), "long") : null} />
          <Fact label="What to do" value={label} />
        </dl>
      </div>
    </ExpandableRow>
  );
}
