import type { ComponentType, ReactNode } from "react";

import { CollapsibleSection } from "@wonderhome/core/ui/collapsible-section";
import type { IconTone } from "@wonderhome/core/ui/icon-tile";
import { Badge, type BadgeTone } from "@wonderhome/core/ui/pill";

import type { CardStatus } from "../_lib/connection-cards";

/** The status words a card's badge needs, already translated. */
export type ProviderCardLabels = {
  connected: string;
  connecting: string;
  notConnected: string;
  notConfigured: string;
  /** Deployment-level and switched on: "Set up by your administrator". */
  managed: string;
};

const STATUS_BADGE: Record<CardStatus, { key: keyof ProviderCardLabels; tone: BadgeTone }> = {
  connected: { key: "connected", tone: "handled" },
  connecting: { key: "connecting", tone: "attention" },
  not_connected: { key: "notConnected", tone: "neutral" },
  not_configured: { key: "notConfigured", tone: "neutral" },
  managed: { key: "managed", tone: "handled" },
};

export type ProviderCardProps = {
  id?: string;
  icon: ComponentType<{ className?: string }>;
  tone?: IconTone;
  /** The connection's name — never truncated (principle 11). */
  name: ReactNode;
  /** One line of what this connection does, visible while the card is folded. */
  purpose?: ReactNode;
  status: CardStatus;
  /**
   * May a member connect or disconnect this one? A deployment-level connection
   * is not connectable, and this card refuses to render `action` for it, so no
   * deployment-level card ever shows a Connect button.
   */
  connectable: boolean;
  labels: ProviderCardLabels;
  /** Connect/Disconnect control, rendered only on a connectable card. */
  action?: ReactNode;
  /** A small count beside the name, e.g. how many devices reported. */
  count?: number;
  defaultOpen?: boolean;
  as?: "h2" | "h3";
  /** The expanded detail — everything about this one connection. */
  children?: ReactNode;
};

/**
 * One connection as a chevron card (owner, 2026-10-29): collapsed it is a
 * tinted tile, the name and a status badge; expanded, the whole detail for
 * that connection, with the Connect or Disconnect control for the ones a member
 * owns. It is built on the shared `CollapsibleSection` fold, so the page reads
 * as one list of cards.
 */
export function ProviderCard({
  id,
  icon,
  tone,
  name,
  purpose,
  status,
  connectable,
  labels,
  action,
  count,
  defaultOpen,
  as,
  children,
}: ProviderCardProps) {
  const badge = STATUS_BADGE[status];
  return (
    <CollapsibleSection
      id={id}
      icon={icon}
      tone={tone}
      as={as}
      count={count}
      defaultOpen={defaultOpen}
      title={
        <span className="flex flex-1 flex-wrap items-center gap-2">
          <span className="break-words">{name}</span>
          <Badge tone={badge.tone}>{labels[badge.key]}</Badge>
        </span>
      }
      intro={purpose}
    >
      {children}
      {connectable && action ? <div className="pt-1">{action}</div> : null}
    </CollapsibleSection>
  );
}
