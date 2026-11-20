import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  staff: null as null | { profileId: string; role: "support" | "operator" | "owner" },
  password: "ok" as "ok" | "wrong" | "limited" | "unavailable" | "reauth",
  rpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@wonderhome/core/db/admin", () => ({ createAdminClient: () => ({ rpc: state.rpc }) }));
vi.mock("../_lib/platform-staff", () => ({
  platformStaff: vi.fn(async (capability: string) => {
    if (!state.staff) return null;
    const { platformCan } = await import("@wonderhome/core/platform/admin");
    return platformCan(state.staff, capability) ? state.staff : null;
  }),
}));
vi.mock("../_lib/platform-step-up", () => ({ confirmStaffPassword: vi.fn(async () => state.password) }));

const { saveRazorpayAction } = await import("./razorpay-actions");

const IDLE = { tone: null, message: null, field: null };
const SECRET = "TestOnlyRazorpaySecret24";
const form = (id?: string, secret?: string, password?: string) => {
  const data = new FormData();
  if (id !== undefined) data.set("razorpay_key_id", id);
  if (secret !== undefined) data.set("razorpay_key_secret", secret);
  if (password !== undefined) data.set("razorpay_password", password);
  return data;
};

beforeEach(() => {
  state.staff = { profileId: "p-owner", role: "owner" };
  state.password = "ok";
  state.rpc = vi.fn(async (name: string, args: { p_value: string }) => ({ data: name === "platform_config_secret_set" ? args.p_value.slice(-4) : null, error: null }));
});

describe("the Razorpay card's one Save", () => {
  it("saves the key id and the 24-character secret together, trimmed, and says the last four", async () => {
    const result = await saveRazorpayAction(IDLE, form(" rzp_test_AbC123xyz987Q ", `${SECRET}\n`, "pw"));
    expect(result).toMatchObject({ tone: "info" });
    expect(result.message).toContain("Key id rzp_test_AbC123xyz987Q saved.");
    expect(result.message).toContain("Key secret saved · ends in et24.");
    expect(state.rpc).toHaveBeenCalledWith("platform_config_set", { p_key: "RAZORPAY_KEY_ID", p_value: "rzp_test_AbC123xyz987Q", p_actor: "p-owner" });
    expect(state.rpc).toHaveBeenCalledWith("platform_config_secret_set", { p_key: "RAZORPAY_KEY_SECRET", p_value: SECRET, p_actor: "p-owner" });
  });

  it("saves a key id alone without a step-up, and keeps the saved secret", async () => {
    state.password = "wrong";
    expect(await saveRazorpayAction(IDLE, form("rzp_live_AbC123xyz987Q", ""))).toMatchObject({ tone: "info" });
    expect(state.rpc).toHaveBeenCalledTimes(1);
  });

  it("writes nothing when either value is wrong, and points at the box", async () => {
    expect(await saveRazorpayAction(IDLE, form("rzp_test_AbC123xyz987Q", "rzp_test_AbC123xyz987Q", "pw"))).toMatchObject({ tone: "risk", field: "keySecret" });
    expect(await saveRazorpayAction(IDLE, form(SECRET, SECRET, "pw"))).toMatchObject({ tone: "risk", field: "keyId" });
    expect(await saveRazorpayAction(IDLE, form("", ""))).toMatchObject({ tone: "risk" });
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("needs the step-up for the secret and says what's wrong", async () => {
    state.password = "wrong";
    expect(await saveRazorpayAction(IDLE, form("", SECRET, "nope"))).toEqual({ tone: "risk", field: "password", message: "That isn't your WonderHome password. Nothing was changed." });
    state.password = "reauth";
    expect((await saveRazorpayAction(IDLE, form("", SECRET))).message).toContain("Confirm with Google");
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("is the owner's alone", async () => {
    state.staff = { profileId: "p-op", role: "operator" };
    expect(await saveRazorpayAction(IDLE, form("rzp_test_AbC123xyz987Q", SECRET, "pw"))).toMatchObject({ tone: "risk", message: "Only the owner can change the Razorpay keys." });
    expect(state.rpc).not.toHaveBeenCalled();
  });
});
