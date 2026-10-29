import { describe, expect, it } from "vitest";

import { connectionCardShape, isDeploymentLevelKind } from "./connection-cards";

describe("isDeploymentLevelKind", () => {
  it("names weather, payments and smart home as deployment-level", () => {
    expect(isDeploymentLevelKind("weather")).toBe(true);
    expect(isDeploymentLevelKind("payments")).toBe(true);
    expect(isDeploymentLevelKind("payment")).toBe(true);
    expect(isDeploymentLevelKind("smart_home")).toBe(true);
  });

  it("leaves the connections a member owns user-connectable", () => {
    for (const kind of ["school", "calendar", "email", "commerce", "messaging"]) {
      expect(isDeploymentLevelKind(kind)).toBe(false);
    }
  });
});

describe("connectionCardShape", () => {
  it("a deployment-level connection is never connectable", () => {
    const on = connectionCardShape({ deploymentLevel: true, configured: true, connectionStatus: null });
    const off = connectionCardShape({ deploymentLevel: true, configured: false, connectionStatus: null });
    expect(on.connectable).toBe(false);
    expect(off.connectable).toBe(false);
  });

  it("reads a configured deployment-level connection as managed, an unconfigured one as not configured", () => {
    expect(connectionCardShape({ deploymentLevel: true, configured: true, connectionStatus: null }).status).toBe("managed");
    expect(connectionCardShape({ deploymentLevel: true, configured: false, connectionStatus: null }).status).toBe("not_configured");
  });

  it("a connectable connection reads from its own integration status", () => {
    expect(connectionCardShape({ deploymentLevel: false, configured: true, connectionStatus: "connected" })).toEqual({ connectable: true, status: "connected" });
    expect(connectionCardShape({ deploymentLevel: false, configured: true, connectionStatus: "degraded" })).toEqual({ connectable: true, status: "connected" });
    expect(connectionCardShape({ deploymentLevel: false, configured: true, connectionStatus: "connecting" })).toEqual({ connectable: true, status: "connecting" });
    expect(connectionCardShape({ deploymentLevel: false, configured: true, connectionStatus: null }).status).toBe("not_connected");
    expect(connectionCardShape({ deploymentLevel: false, configured: true, connectionStatus: "error" }).status).toBe("not_connected");
  });

  it("a connectable connection whose provider has no credentials is not configured", () => {
    expect(connectionCardShape({ deploymentLevel: false, configured: false, connectionStatus: null })).toEqual({ connectable: true, status: "not_configured" });
  });
});
