import { Wallet } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CollapsibleSection } from "@wonderhome/core/ui/collapsible-section";

vi.mock("../(auth)/consent-actions", () => ({ saveRecordFirstAction: vi.fn() }));

const { RecordFirstPicker } = await import("./record-first-picker");

const LABELS = {
  title: "Money and health entries",
  detail: "Bills, receipts and health documents sent to HomeSend.",
  option: { confirmed: "Auto approved (recommended)", review: "Wait for review" },
  adminDecides: "An Admin decides this.",
};

/** Settings → AI Assistant's folding cards (the owner, 2026-11-21: "make these collapsible cards with chevron"). */
function card(open = false) {
  return renderToStaticMarkup(
    <CollapsibleSection id="money-health" as="h3" icon={Wallet} tone="money" title={LABELS.title} intro="Auto approved" defaultOpen={open}>
      <RecordFirstPicker householdId="h-1" setting="moneyHealth" value="confirmed" options={["confirmed", "review"]} manages folded labels={LABELS} />
    </CollapsibleSection>,
  );
}

describe("a folded settings card", () => {
  it("starts folded, its summary saying the title and what is set, with one chevron", () => {
    const html = card();
    expect(html).toMatch(/^<details id="money-health"(?![^>]*\bopen\b)/);
    const summary = html.slice(html.indexOf("<summary"), html.indexOf("</summary>"));
    expect(summary).toContain("Money and health entries");
    expect(summary).toContain("Auto approved");
    expect(summary.match(/lucide-chevron-down/g)).toHaveLength(1);
  });

  it("shows the title once: the picker inside keeps it only for screen readers, as the select's name", () => {
    const html = card(true);
    const body = html.slice(html.indexOf("</summary>"));
    expect(body).toContain('class="sr-only">Money and health entries</p>');
    expect(body).toMatch(/<select aria-labelledby="record-first-moneyHealth-title"/);
    // One tile, the card's: the picker draws none of its own.
    expect(html.match(/lucide-wallet/g)).toHaveLength(1);
    // One control for the setting (rules 14 and 23), with exactly the two choices.
    expect(body.match(/<select/g)).toHaveLength(1);
    expect(body.match(/<option/g)).toHaveLength(2);
  });
});
