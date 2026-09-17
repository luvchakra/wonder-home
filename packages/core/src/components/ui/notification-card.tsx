import { Bell, CircleCheck, Lightbulb, TriangleAlert } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

import { cn } from "../../lib/cn";
import { IconTile, type IconTone } from "./icon-tile";
import { Badge } from "./pill";

/**
 * One notification, as a thread rather than an alert.
 *
 * Its type decides the glyph, its state decides how loudly it sits on the
 * page, and the action is on the card — the lifecycle is
 * generated → delivered → seen → acted → resolved, and a card that has been
 * acted on says so instead of asking again.
 */
export type NotificationCardProps = {
  type: "action" | "decision" | "risk" | "completion";
  status: "generated" | "delivered" | "seen" | "acted" | "resolved" | "expired";
  title: string;
  body: string;
  /** Already formatted, e.g. "8:30 AM" or "Yesterday". */
  when: string;
  /** Domain glyph when one applies; the type glyph otherwise. */
  icon?: ComponentType<{ className?: string }>;
  tone?: IconTone;
  action?: ReactNode;
  className?: string;
};

const TYPE: Record<NotificationCardProps["type"], { icon: ComponentType<{ className?: string }>; tone: IconTone }> = {
  action: { icon: Bell, tone: "attention" },
  decision: { icon: Lightbulb, tone: "ai" },
  risk: { icon: TriangleAlert, tone: "risk" },
  completion: { icon: CircleCheck, tone: "handled" },
};

export function NotificationCard({ type, status, title, body, when, icon, tone, action, className }: NotificationCardProps) {
  const presentation = { icon: icon ?? TYPE[type].icon, tone: tone ?? TYPE[type].tone };
  const settled = status === "acted" || status === "resolved" || status === "expired";
  const unread = status === "generated" || status === "delivered";

  return (
    <article
      className={cn(
        "flex gap-3 rounded-[var(--wh-radius)] border bg-[var(--wh-surface)] p-3.5",
        unread ? "border-[var(--wh-primary-soft)] shadow-[var(--wh-shadow-card)]" : "border-[var(--wh-border)]",
        settled && "opacity-75",
        className,
      )}
    >
      <IconTile icon={presentation.icon} tone={presentation.tone} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold leading-snug">{title}</h3>
          <span className="shrink-0 text-[0.6875rem] text-[var(--wh-foreground-subtle)]">{when}</span>
        </div>
        <p className="mt-0.5 text-xs leading-relaxed text-[var(--wh-foreground-muted)]">{body}</p>
        <div className="mt-2 flex items-center gap-2">
          {settled ? (
            <Badge tone={status === "expired" ? "neutral" : "handled"}>
              {status === "resolved" ? "Resolved" : status === "acted" ? "Done" : "Expired"}
            </Badge>
          ) : (
            action
          )}
          {unread ? (
            <span aria-hidden className="ml-auto size-2 rounded-full bg-[var(--wh-primary)]" />
          ) : null}
        </div>
      </div>
    </article>
  );
}
