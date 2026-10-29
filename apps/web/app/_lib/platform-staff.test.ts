import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePlatformAdmin = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@wonderhome/core/db/server", () => ({ createClient: async () => ({}) }));
vi.mock("@wonderhome/core/platform/admin", async (orig) => ({
  ...(await orig<typeof import("@wonderhome/core/platform/admin")>()),
  requirePlatformAdmin,
}));

import { isPlatformStaff, platformStaff } from "./platform-staff";

describe("isPlatformStaff (the avatar menu's Platform admin row)", () => {
  beforeEach(() => {
    requirePlatformAdmin.mockReset();
  });

  it("is true for platform staff", async () => {
    requirePlatformAdmin.mockResolvedValue({ profileId: "p", role: "support" });
    expect(await isPlatformStaff()).toBe(true);
  });

  it("is false for a household Admin, a member or a child with no platform_admins row", async () => {
    requirePlatformAdmin.mockImplementation(async () => { throw new Error("not found"); });
    expect(await platformStaff("operations.read")).toBeNull();
    expect(await isPlatformStaff()).toBe(false);
  });

  it("is false when signed out", async () => {
    requirePlatformAdmin.mockImplementation(async () => { throw new Error("unauthenticated"); });
    expect(await isPlatformStaff()).toBe(false);
  });
});

describe("no leakage to people who are not staff", () => {
  const root = new URL("../../../../packages/core/src/components/shell/", import.meta.url);
  it("the client menu holds neither the URL nor the label, only what the server sends", () => {
    const menu = readFileSync(new URL("viewer-menu-content.tsx", root), "utf8");
    expect(menu).not.toContain("/platform-admin");
    expect(menu).not.toContain("Platform admin");
    expect(menu).toContain("viewer.platformAdmin ?");
  });

  it("the session adds the field only for staff", () => {
    const session = readFileSync(new URL("session.ts", import.meta.url), "utf8");
    expect(session).toContain("...(staff ? { platformAdmin:");
  });
});
