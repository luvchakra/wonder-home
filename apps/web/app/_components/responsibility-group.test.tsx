import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../(auth)/configuration-actions", () => ({
  acceptRebalanceAction: vi.fn(),
  removeResponsibilityAction: vi.fn(),
  saveResponsibilityAction: vi.fn(),
  setGroupAutonomyAction: vi.fn(),
}));

const { ResponsibilityGroup } = await import("./responsibility-controls");

const LABELS = {
  title: "How much WonderHome does on its own",
  options: {
    prepare: { heading: "WonderHome prepares, and waits for your OK", short: "WonderHome asks first", how: "it gets everything ready." },
    execute: { heading: "WonderHome does it, and tells you afterwards", short: "WonderHome handles it", how: "it acts and reports back." },
  },
  mixed: "Mixed — choose one",
  needsOwner: "Give every responsibility here an owner first.",
};

type Mode = "prepare" | "execute";

function render({ editable = true, currentMode = null as Mode | null } = {}) {
  return renderToStaticMarkup(
    <ResponsibilityGroup
      title="HOME"
      count={3}
      outcomeKeys={["home.cleaning", "home.maintenance"]}
      currentMode={currentMode}
      unowned={false}
      editable={editable}
      householdId="33333333-3333-4333-8333-333333333333"
      labels={LABELS}
    >
      <p>CHILD ROW</p>
    </ResponsibilityGroup>,
  );
}

describe("ResponsibilityGroup", () => {
  it("shows the label and its count, with a collapsed toggle for the list", () => {
    const html = render();
    expect(html).toContain('HOME <span class="whitespace-nowrap">· 3</span>');
    expect(html).toMatch(/aria-expanded="false" aria-controls="group-home" aria-label="HOME · 3"/);
  });

  it("keeps the label, the dropdown and the list toggle in one row, in that order", () => {
    const html = render({ currentMode: "prepare" });
    const label = html.indexOf('HOME <span class="whitespace-nowrap">· 3</span>');
    const dropdown = html.indexOf('aria-label="How much WonderHome does on its own: WonderHome prepares, and waits for your OK"');
    const toggle = html.indexOf('aria-label="HOME · 3"');
    expect(label).toBeGreaterThan(-1);
    expect(dropdown).toBeGreaterThan(label);
    expect(toggle).toBeGreaterThan(dropdown);
  });

  it("starts with the responsibilities hidden", () => {
    expect(render()).not.toContain("CHILD ROW");
  });

  it("carries the dropdown on the card while collapsed, showing the group's choice in full and nothing under it", () => {
    const html = render({ currentMode: "prepare" });
    expect(html).toContain('aria-label="How much WonderHome does on its own: WonderHome prepares, and waits for your OK"');
    // Shown short, like each row's badge, so it fits beside the label on a phone.
    expect(html).toContain("<span>WonderHome asks first</span>");
    // The "what it does" line lives only in the opened choices, not under the closed dropdown.
    expect(html).not.toContain("It gets everything ready.");
    // The two choices open from the button; closed, they are not in the page.
    expect(html).not.toContain('name="aiMode"');
  });

  it("asks the question when the group's modes differ", () => {
    const html = render({ currentMode: null });
    expect(html).toContain('aria-label="How much WonderHome does on its own: How much WonderHome does on its own"');
    expect(html).toContain("<span>Mixed — choose one</span>");
  });

  it("sends the whole group and the household with the choice", () => {
    const html = render({ currentMode: "execute" });
    expect(html).toContain('name="outcomeKeys" value="home.cleaning,home.maintenance"');
    expect(html).toContain('name="householdId" value="33333333-3333-4333-8333-333333333333"');
  });

  it("shows someone who cannot change it the group's mode, with no dropdown", () => {
    const html = render({ editable: false, currentMode: "prepare" });
    expect(html).not.toContain("<form");
    expect(html).toContain("WonderHome asks first");
  });
});
