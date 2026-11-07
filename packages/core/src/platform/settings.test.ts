import { beforeEach, describe, expect, it, vi } from "vitest";

import { forgetPlatformData } from "../lib/platform-cache";
import { landingVariant, saveLandingVariant } from "./settings";

const reader = (rows: { key: string; value: string }[] | null, error: unknown = null) => {
  const select = vi.fn(() => ({ limit: async () => ({ data: rows, error }) }));
  return { client: { from: vi.fn(() => ({ select })) } as never, select };
};

beforeEach(() => forgetPlatformData("platform_settings"));

describe("landingVariant", () => {
  it("is New when nothing is set, or the value is not one we know", async () => {
    expect(await landingVariant(reader([]).client)).toBe("new");
    forgetPlatformData("platform_settings");
    expect(await landingVariant(reader([{ key: "landing.variant", value: "bogus" }]).client)).toBe("new");
  });

  it("is Classic when staff chose it", async () => {
    expect(await landingVariant(reader([{ key: "landing.variant", value: "classic" }]).client)).toBe("classic");
  });

  it("falls back to New on a read error, and does not keep that answer", async () => {
    expect(await landingVariant(reader(null, { code: "x" }).client)).toBe("new");
    await Promise.resolve();
    expect(await landingVariant(reader([{ key: "landing.variant", value: "classic" }]).client)).toBe("classic");
  });

  it("reads once within the cache TTL", async () => {
    const r = reader([{ key: "landing.variant", value: "classic" }]);
    await landingVariant(r.client);
    await landingVariant(r.client);
    expect(r.select).toHaveBeenCalledTimes(1);
  });
});

describe("saveLandingVariant", () => {
  it("writes through the audited function with who did it, and shows the change at once", async () => {
    const rpc = vi.fn(async () => ({ error: null }));
    expect(await landingVariant(reader([{ key: "landing.variant", value: "new" }]).client)).toBe("new");
    expect(await saveLandingVariant({ rpc } as never, "profile-1", "classic")).toBe(true);
    expect(rpc).toHaveBeenCalledWith("platform_setting_set", { p_key: "landing.variant", p_value: "classic", p_actor: "profile-1" });
    expect(await landingVariant(reader([{ key: "landing.variant", value: "classic" }]).client)).toBe("classic");
  });

  it("refuses any other value and reports a failed write", async () => {
    const rpc = vi.fn(async () => ({ error: { code: "x" } }));
    expect(await saveLandingVariant({ rpc } as never, "p", "weird")).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    expect(await saveLandingVariant({ rpc } as never, "p", "new")).toBe(false);
  });
});
