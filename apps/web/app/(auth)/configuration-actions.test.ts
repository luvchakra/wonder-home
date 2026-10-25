import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  isAdmin: true,
  setAutonomyForOutcomes: vi.fn(async (_supabase: unknown, _input: Record<string, unknown>) => 2),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@wonderhome/core/db/server", () => ({ createClient: async () => ({}) }));
vi.mock("@wonderhome/core/identity/households", () => ({
  listMembers: async () => [],
  requireHouseholdAdmin: async () => {
    if (!state.isAdmin) {
      const { ApiError } = await import("@wonderhome/core/api/errors");
      throw ApiError.forbidden("Only an administrator can change this.");
    }
    return { memberId: "44444444-4444-4444-8444-444444444444", household: { ownerMemberId: null } };
  },
}));
vi.mock("@wonderhome/core/household/configuration-repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@wonderhome/core/household/configuration-repository")>()),
  setAutonomyForOutcomes: state.setAutonomyForOutcomes,
}));

const { setGroupAutonomyAction } = await import("./configuration-actions");

const HOUSEHOLD = "33333333-3333-4333-8333-333333333333";

function choice(fields: Record<string, string>): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries({ householdId: HOUSEHOLD, outcomeKeys: "laundry.ready,home.cleaning", aiMode: "approve", ...fields })) form.set(name, value);
  return form;
}

describe("setGroupAutonomyAction", () => {
  beforeEach(() => {
    state.isAdmin = true;
    state.setAutonomyForOutcomes.mockClear();
  });

  it("sets the chosen mode on every outcome in the group and reports how many changed", async () => {
    const result = await setGroupAutonomyAction({}, choice({}));

    expect(state.setAutonomyForOutcomes).toHaveBeenCalledTimes(1);
    expect(state.setAutonomyForOutcomes.mock.calls[0]![1]).toMatchObject({
      householdId: HOUSEHOLD,
      outcomeKeys: ["laundry.ready", "home.cleaning"],
      aiMode: "approve",
    });
    expect(result).toEqual({ notice: "Updated 2 responsibilities." });
  });

  it("refuses a mode that is not one of the four choices, and changes nothing", async () => {
    const result = await setGroupAutonomyAction({}, choice({ aiMode: "always" }));

    expect(state.setAutonomyForOutcomes).not.toHaveBeenCalled();
    expect(result.error).toBeTruthy();
  });

  it("refuses a malformed outcome key, and changes nothing", async () => {
    const result = await setGroupAutonomyAction({}, choice({ outcomeKeys: "Laundry Ready" }));

    expect(state.setAutonomyForOutcomes).not.toHaveBeenCalled();
    expect(result.error).toBe("That is not a valid outcome key.");
  });

  it("refuses when the person is not an administrator, and changes nothing", async () => {
    state.isAdmin = false;
    const result = await setGroupAutonomyAction({}, choice({}));

    expect(state.setAutonomyForOutcomes).not.toHaveBeenCalled();
    expect(result.error).toBe("Only an administrator can change this.");
  });
});
