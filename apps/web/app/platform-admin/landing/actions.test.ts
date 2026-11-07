import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ staff: null as null | { profileId: string; role: string }, rpc: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@wonderhome/core/db/admin", () => ({ createAdminClient: () => ({ rpc: state.rpc }) }));
vi.mock("../../_lib/platform-staff", () => ({ platformStaff: vi.fn(async (capability: string) => (capability === "settings.manage" ? state.staff : null)) }));

const { saveLandingVariantAction } = await import("./actions");

const form = (variant: string) => {
  const data = new FormData();
  data.set("variant", variant);
  return data;
};
const idle = { tone: null, message: null } as const;

beforeEach(() => {
  state.staff = null;
  state.rpc = vi.fn(async () => ({ error: null }));
});

describe("the landing page setting", () => {
  it("is for platform staff only: anyone else changes nothing", async () => {
    expect(await saveLandingVariantAction(idle, form("classic"))).toMatchObject({ tone: "risk" });
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("saves through the audited function with who did it", async () => {
    state.staff = { profileId: "profile-1", role: "operator" };
    const result = await saveLandingVariantAction(idle, form("classic"));
    expect(state.rpc).toHaveBeenCalledWith("platform_setting_set", { p_key: "landing.variant", p_value: "classic", p_actor: "profile-1" });
    expect(result.tone).toBe("info");
  });

  it("refuses a value that is not New or Classic", async () => {
    state.staff = { profileId: "profile-1", role: "owner" };
    expect((await saveLandingVariantAction(idle, form("other"))).tone).toBe("risk");
    expect(state.rpc).not.toHaveBeenCalled();
  });
});
