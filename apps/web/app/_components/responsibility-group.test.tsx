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
    observe: { heading: "WonderHome will notify only", how: "It notices a problem and tells you." },
    prepare: { heading: "WonderHome does the groundwork, and waits for you", how: "It gets everything ready." },
    approve: { heading: "WonderHome will ask before acting", how: "It asks first." },
    execute: { heading: "WonderHome does it, and tells you afterwards", how: "It acts and reports back." },
  },
};

function render(editable: boolean) {
  return renderToStaticMarkup(
    <ResponsibilityGroup title="HOME" count={3} outcomeKeys={["home.cleaning", "home.maintenance"]} currentMode={null} editable={editable} householdId="33333333-3333-4333-8333-333333333333" labels={LABELS}>
      <p>CHILD ROW</p>
    </ResponsibilityGroup>,
  );
}

describe("ResponsibilityGroup", () => {
  it("shows the label and its count as a collapsed header", () => {
    const html = render(true);
    expect(html).toContain("HOME · 3");
    expect(html).toContain('aria-expanded="false"');
  });

  it("starts collapsed: the responsibilities and the dropdown are not in the page until opened", () => {
    const html = render(true);
    expect(html).not.toContain("CHILD ROW");
    expect(html).not.toContain("How much WonderHome does on its own");
    expect(html).not.toContain("WonderHome will ask before acting");
  });

  it("shows the same collapsed header to someone who cannot change it", () => {
    const html = render(false);
    expect(html).toContain("HOME · 3");
    expect(html).not.toContain("CHILD ROW");
  });
});
