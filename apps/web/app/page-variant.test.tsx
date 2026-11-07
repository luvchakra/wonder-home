import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ variant: "new" as "new" | "classic", user: null as null | object }));

vi.mock("server-only", () => ({}));
vi.mock("@wonderhome/core/db/server", () => ({ createClient: async () => ({}), getVerifiedUser: async () => state.user }));
vi.mock("@wonderhome/core/platform/settings", () => ({ landingVariant: async () => state.variant }));
vi.mock("./_lib/entry-locale", () => ({ visitorLocale: async () => ({ t: (key: string) => key }) }));
vi.mock("./_lib/session", () => ({ buildSession: vi.fn(), membershipsOrClaimed: vi.fn(async () => []) }));
vi.mock("./_screens/child-home", () => ({ ChildHome: () => null }));
vi.mock("./_screens/home-dashboard", () => ({ HomeDashboard: () => null }));
vi.mock("./_screens/landing-classic", () => ({ ClassicLanding: function ClassicLanding() { return null; } }));
vi.mock("./_screens/landing-new", () => ({ NewLanding: function NewLanding() { return null; } }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { default: HomePage } = await import("./page");
const render = async () => ((await HomePage({ searchParams: Promise.resolve({}) })) as { type: { name: string } }).type.name;

describe("the signed-out home route", () => {
  it("shows the new landing by default and the classic one when staff switch to it", async () => {
    state.variant = "new";
    expect(await render()).toBe("NewLanding");
    state.variant = "classic";
    expect(await render()).toBe("ClassicLanding");
  });
});
