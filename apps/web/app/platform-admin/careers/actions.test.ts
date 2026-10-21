import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  staff: null as null | { profileId: string; role: string },
  rpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@wonderhome/core/db/admin", () => ({ createAdminClient: () => ({ rpc: state.rpc }) }));
vi.mock("../../_lib/careers", () => ({ careersStaff: vi.fn(async () => state.staff) }));

const { clearCareersKeyAction, saveCareersKeyAction, testCareersConnectionAction } = await import("./actions");

const KEY = "wjcs_live_0123456789abcdefWXYZ";
const form = (key: string) => {
  const data = new FormData();
  data.set("key", key);
  return data;
};

beforeEach(() => {
  state.staff = null;
  state.rpc = vi.fn(async (name: string) => ({ data: name === "careers_key_set" ? "WXYZ" : null, error: null }));
  vi.unstubAllGlobals();
});

describe("the WonderJobs key setting", () => {
  it("is for platform admins only: anyone else changes nothing", async () => {
    expect(await saveCareersKeyAction({ tone: null, message: null }, form(KEY))).toMatchObject({ tone: "risk", message: "Only a platform admin can change this." });
    expect(await clearCareersKeyAction()).toMatchObject({ tone: "risk" });
    expect(await testCareersConnectionAction()).toMatchObject({ tone: "risk" });
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("saves through the audited, encrypted store with who did it, and answers with the mask only", async () => {
    state.staff = { profileId: "profile-1", role: "owner" };
    const result = await saveCareersKeyAction({ tone: null, message: null }, form(KEY));
    expect(state.rpc).toHaveBeenCalledWith("careers_key_set", { p_key: KEY, p_actor: "profile-1" });
    expect(result.message).toContain("wjcs_••••••••WXYZ");
    expect(JSON.stringify(result)).not.toContain("0123456789abcdef");
  });

  it("refuses what isn't a career-site key", async () => {
    state.staff = { profileId: "profile-1", role: "owner" };
    expect((await saveCareersKeyAction({ tone: null, message: null }, form("sk-live-123"))).message).toContain("starts with wjcs_");
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("clears through the audited store with who did it", async () => {
    state.staff = { profileId: "profile-2", role: "operator" };
    expect(await clearCareersKeyAction()).toMatchObject({ tone: "info", message: "Key cleared." });
    expect(state.rpc).toHaveBeenCalledWith("careers_key_clear", { p_actor: "profile-2" });
  });

  it("tests the saved key: Connected with the count, Wrong key, or Unavailable", async () => {
    state.staff = { profileId: "profile-1", role: "owner" };
    state.rpc = vi.fn(async () => ({ data: KEY, error: null }));
    const respond = (status: number, body: unknown) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
    respond(200, { site: { name: "WonderHome careers", retentionMonths: 12 }, jobs: [{ id: "j", title: "t", location: "", workMode: "remote", currency: "INR", description: "", skills: [], company: "", updatedAt: "" }] });
    expect((await testCareersConnectionAction()).message).toBe("Connected to WonderHome careers: 1 open job.");
    respond(401, { error: "revoked" });
    expect((await testCareersConnectionAction()).message).toContain("Wrong key");
    respond(503, {});
    expect((await testCareersConnectionAction()).message).toContain("Unavailable");
  });
});
