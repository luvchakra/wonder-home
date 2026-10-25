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
    observe: { heading: "WonderHome will notify only", how: "it notices a problem and tells you." },
    prepare: { heading: "WonderHome does the groundwork, and waits for you", how: "it gets everything ready." },
    approve: { heading: "WonderHome will ask before acting", how: "it asks first." },
    execute: { heading: "WonderHome does it, and tells you afterwards", how: "it acts and reports back." },
  },
  needsOwner: "Give every responsibility here an owner first.",
};

type Mode = "observe" | "prepare" | "approve" | "execute";

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
  it("shows the label and its count as a collapsed header", () => {
    const html = render();
    expect(html).toContain("HOME · 3");
    expect(html).toMatch(/aria-expanded="false"[^>]*>.*HOME · 3/);
  });

  it("starts with the responsibilities hidden", () => {
    expect(render()).not.toContain("CHILD ROW");
  });

  it("carries the dropdown on the card while collapsed, showing the group's choice in full", () => {
    const html = render({ currentMode: "prepare" });
    expect(html).toContain('aria-label="How much WonderHome does on its own: WonderHome does the groundwork, and waits for you"');
    // What the choice lets WonderHome do, as a sentence.
    expect(html).toContain("It gets everything ready.");
    // The four choices open from the button; closed, they are not in the page.
    expect(html).not.toContain('name="aiMode"');
  });

  it("asks the question when the group's modes differ", () => {
    const html = render({ currentMode: null });
    expect(html).toContain('aria-label="How much WonderHome does on its own: How much WonderHome does on its own"');
  });

  it("sends the whole group and the household with the choice", () => {
    const html = render({ currentMode: "observe" });
    expect(html).toContain('name="outcomeKeys" value="home.cleaning,home.maintenance"');
    expect(html).toContain('name="householdId" value="33333333-3333-4333-8333-333333333333"');
  });

  it("shows someone who cannot change it the group's mode, with no dropdown", () => {
    const html = render({ editable: false, currentMode: "approve" });
    expect(html).not.toContain("<form");
    expect(html).toContain("WonderHome will ask before acting");
  });
});
