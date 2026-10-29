import type { ConnectorStatus } from "@wonderhome/core/integrations/connector";

/**
 * Connection cards on Settings → Connections (owner, 2026-10-29).
 *
 * The page is nothing but per-connection chevron cards, and a card is one of
 * two kinds:
 *
 * - **User-connectable** — a member connects and disconnects it themselves
 *   (School, WhatsApp, the named Connections, Shopping, Calendar, Email).
 *   Collapsed, the card shows a status badge; expanded, it shows that one
 *   connection's whole detail and a Connect or Disconnect control.
 * - **Deployment-level** — switched on by whoever runs this WonderHome, never
 *   by a member (Weather, Payments, smart home, and anything whose credentials
 *   are not set). It shows honest status and never a Connect button — the
 *   external-providers invariant (docs/external-providers.md): never offer a
 *   connect flow that isn't real.
 *
 * This module is the pure logic behind that split, kept out of the server
 * components so it can be tested on its own.
 */

/** Providers a member can never connect — the operator switches them on. */
export const DEPLOYMENT_LEVEL_KINDS = ["weather", "payments", "payment", "smart_home"] as const;

export function isDeploymentLevelKind(kind: string): boolean {
  return (DEPLOYMENT_LEVEL_KINDS as readonly string[]).includes(kind);
}

/** A card's state, in the word its collapsed badge uses. */
export type CardStatus = "connected" | "connecting" | "not_connected" | "not_configured" | "managed";

export type CardShapeInput = {
  /** True for weather / payments / smart home and any provider the operator owns. */
  deploymentLevel: boolean;
  /** Whether the deployment has switched this provider on (its env/credentials are set). */
  configured: boolean;
  /** The best status among this connection's integration rows, if any. */
  connectionStatus?: ConnectorStatus | null;
};

export type CardShape = {
  /** May a member connect or disconnect this? A deployment-level connection cannot. */
  connectable: boolean;
  status: CardStatus;
};

/**
 * The card shape for one connection. Deployment-level connections are never
 * connectable, so their card never offers a Connect button; a configured one
 * reads "managed" (set up by the administrator) and an unconfigured one
 * "not_configured". A user-connectable connection reads from its own
 * integration status.
 */
export function connectionCardShape({ deploymentLevel, configured, connectionStatus }: CardShapeInput): CardShape {
  if (deploymentLevel) {
    return { connectable: false, status: configured ? "managed" : "not_configured" };
  }
  if (!configured) {
    return { connectable: true, status: "not_configured" };
  }
  if (connectionStatus === "connected" || connectionStatus === "degraded") {
    return { connectable: true, status: "connected" };
  }
  if (connectionStatus === "connecting") {
    return { connectable: true, status: "connecting" };
  }
  return { connectable: true, status: "not_connected" };
}
