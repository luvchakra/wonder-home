import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { HealthFormLabels } from "../_lib/health-form-labels";

vi.mock("../(auth)/health-actions", () => ({
  setHealthPrivacyScopeAction: vi.fn(),
  setHealthAiAssistanceAction: vi.fn(),
  grantHealthConsentAction: vi.fn(),
  revokeHealthConsentAction: vi.fn(),
}));

const { PrivacyScopeForm } = await import("./health-forms");

const LABELS = {
  scopes: {
    private: "Only me",
    selected_family: "People I choose",
    household_operational: "The whole household",
  },
  privacy: {
    label: "Who can see your health data",
    hints: {
      private: "Only you can see it.",
      selected_family: "Only the people you pick can see it.",
      household_operational: "Everyone in the household can see it.",
    },
  },
} as unknown as HealthFormLabels;

function render(currentScope: "private" | "selected_family" | "household_operational") {
  return renderToStaticMarkup(
    <PrivacyScopeForm
      householdId="11111111-1111-4111-8111-111111111111"
      memberId="22222222-2222-4222-8222-222222222222"
      currentScope={currentScope}
      labels={LABELS}
    />,
  );
}

describe("PrivacyScopeForm", () => {
  // The bug (the owner, 2026-10-29): picking any option snapped back to "Only
  // me". The control must render the *saved* scope, not a fixed default, so a
  // reload after save shows what was stored.
  it.each([
    ["private", "Only me", "Only you can see it."],
    ["selected_family", "People I choose", "Only the people you pick can see it."],
    ["household_operational", "The whole household", "Everyone in the household can see it."],
  ] as const)("reflects the stored %s scope on load", (scope, _option, hint) => {
    const html = render(scope);
    // The matching option is the selected one — React marks it in SSR.
    expect(html).toMatch(new RegExp(`<option value="${scope}" selected=""`));
    // The hint tracks the shown scope, not a hardcoded default.
    expect(html).toContain(hint);
  });

  it("does not fall back to an uncontrolled default that a form reset could revert", () => {
    // "The whole household" saved must never render with "Only me" preselected.
    const html = render("household_operational");
    expect(html).not.toMatch(/<option value="private" selected=""/);
  });

  it("carries the household and member with the choice", () => {
    const html = render("private");
    expect(html).toContain('name="householdId" value="11111111-1111-4111-8111-111111111111"');
    expect(html).toContain('name="memberId" value="22222222-2222-4222-8222-222222222222"');
  });
});
