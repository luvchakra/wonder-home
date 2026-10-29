import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProviderCard, type ProviderCardLabels } from "./provider-card";
import type { CardStatus } from "../_lib/connection-cards";

/** A stand-in for a Lucide icon — ProviderCard only needs a component that takes a className. */
const Icon = ({ className }: { className?: string }) => <svg className={className} />;

const LABELS: ProviderCardLabels = {
  connected: "Connected",
  connecting: "Connecting",
  notConnected: "Not connected",
  notConfigured: "Not configured",
  managed: "Set up by your administrator",
};

const CONNECT = <a data-testid="connect" href="/connect">Connect</a>;

function render(props: Partial<Parameters<typeof ProviderCard>[0]> & { status: CardStatus; connectable: boolean }) {
  return renderToStaticMarkup(
    <ProviderCard
      icon={Icon}
      name="Weather"
      labels={LABELS}
      {...props}
    >
      <p>Detail body</p>
    </ProviderCard>,
  );
}

describe("ProviderCard", () => {
  it("shows the badge for its status", () => {
    expect(render({ status: "connected", connectable: true })).toContain("Connected");
    expect(render({ status: "not_connected", connectable: true })).toContain("Not connected");
    expect(render({ status: "not_configured", connectable: false })).toContain("Not configured");
    expect(render({ status: "managed", connectable: false })).toContain("Set up by your administrator");
  });

  it("renders the Connect control on a user-connectable card", () => {
    const html = render({ status: "not_connected", connectable: true, action: CONNECT });
    expect(html).toContain("Connect");
    expect(html).toContain('href="/connect"');
  });

  it("never renders a Connect control on a deployment-level card, even when one is passed", () => {
    const html = render({ status: "managed", connectable: false, action: CONNECT });
    expect(html).not.toContain('data-testid="connect"');
    expect(html).not.toContain('href="/connect"');
  });

  it("always shows the connection's detail body", () => {
    expect(render({ status: "managed", connectable: false })).toContain("Detail body");
  });
});
