import type { ReactNode } from "react";

import type { FeatureLine } from "@wonderhome/core/billing/plan-shared";
import { Badge } from "@wonderhome/core/ui/pill";

/**
 * One plan as a member reads it: name, early-access badge, price, the
 * arithmetic behind a yearly price, a sentence, and what it includes.
 *
 * The member plan list (`PlanForm`) and the platform-admin preview both render
 * this, so what staff edit is what members see (owner, 2026-11-07). An editor
 * passes `slots` to put inputs where the words are; nothing else differs.
 */
export type PlanCardData = {
  name: string;
  description: string | null;
  /** "₹299 a month", already in words. */
  priceText?: string | null;
  /** "₹239.16 a month · save 20%". */
  priceNote?: string | null;
  /** Priced, with payments not open yet: members read "Free during early access". */
  earlyAccessLabel?: string | null;
  features?: readonly FeatureLine[];
};

export type PlanCardSlots = {
  name?: ReactNode;
  description?: ReactNode;
  price?: ReactNode;
  /** Replaces one feature's line; `null` hides it. */
  feature?: (line: FeatureLine) => ReactNode;
};

export function PlanCard({ plan, slots, showOff = false }: { plan: PlanCardData; slots?: PlanCardSlots; showOff?: boolean }) {
  const features = (plan.features ?? []).filter((line) => showOff || line.enabled);
  return (
    <div className="min-w-0 flex-1">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
        {slots?.name ?? plan.name}
        {plan.earlyAccessLabel ? <Badge tone="handled" className="whitespace-nowrap">{plan.earlyAccessLabel}</Badge> : null}
      </p>
      {slots?.price ??
        (plan.priceText ? (
          <p className="mt-0.5 text-sm">
            <span className="font-semibold">{plan.priceText}</span>
            {plan.priceNote ? <span className="ml-1.5 text-xs text-[var(--wh-foreground-muted)]">{plan.priceNote}</span> : null}
          </p>
        ) : null)}
      {slots?.description ?? (plan.description ? <p className="mt-0.5 text-xs text-[var(--wh-foreground-muted)]">{plan.description}</p> : null)}
      {features.length > 0 ? (
        <ul className="mt-2 grid gap-x-4 gap-y-0.5 text-xs sm:grid-cols-2">
          {features.map((line) => (
            <li key={line.featureKey} className="flex items-baseline justify-between gap-2">
              {slots?.feature ? (
                slots.feature(line)
              ) : (
                <>
                  <span className="min-w-0 break-words">{line.label}</span>
                  <span className="shrink-0 text-[var(--wh-foreground-muted)]">{line.value}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
