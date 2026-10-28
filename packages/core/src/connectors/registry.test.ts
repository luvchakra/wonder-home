import { describe, expect, it } from "vitest";

import { connectorCatalog, connectorsWithCapability, getConnectorType, publicParamKeys, secretParamKeys } from "./registry";

describe("connector registry", () => {
  it("has a browser-automation type with url/username/password and portal-fetch", () => {
    const t = getConnectorType("browser-automation");
    expect(t).not.toBeNull();
    expect(t!.creation.mode).toBe("params");
    expect(secretParamKeys(t!)).toEqual(["password"]);
    expect(publicParamKeys(t!)).toEqual(["url", "username"]);
    expect(t!.capabilities).toContain("portal-fetch");
  });

  it("has a whatsapp type that is a link flow with no params form", () => {
    const t = getConnectorType("whatsapp");
    expect(t!.creation.mode).toBe("link");
    expect(secretParamKeys(t!)).toEqual([]);
    expect(publicParamKeys(t!)).toEqual([]);
    expect(t!.capabilities).toContain("homesend-intake");
  });

  it("filters the catalog by capability", () => {
    const portal = connectorsWithCapability("portal-fetch").map((t) => t.id);
    expect(portal).toContain("browser-automation");
    expect(portal).not.toContain("whatsapp");
  });

  it("returns null for an unknown type, and every catalog id is a valid slug", () => {
    expect(getConnectorType("nope")).toBeNull();
    for (const t of connectorCatalog()) expect(t.id).toMatch(/^[a-z][a-z0-9-]{1,40}$/);
  });
});
