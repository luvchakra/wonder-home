import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ChatMessage, ChatTimeRoom } from "./ai-message";
import { PreviewInfo } from "./preview-info";

/**
 * A finished turn's action preview behind an "i" beside its time (the owner,
 * 2026-10-26). Expected first: the "i" is a named button, closed until asked,
 * with no card in the conversation; it sits just before the time, and the
 * time's room on the last line grows to hold it.
 */
const PREVIEW = { state: "executed" as const, understood: "Add milk", plan: ["Add 2 L milk to the shopping list"], impact: "You asked for it.", reversible: true };

describe("PreviewInfo", () => {
  it("is one named button with a 44 px target, and no card until it is opened", () => {
    const html = renderToStaticMarkup(<PreviewInfo label="Details of what WonderHome did" preview={PREVIEW} />);
    expect(html).toContain('aria-label="Details of what WonderHome did"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("before:-inset-3.5");
    expect(html).not.toContain("Add 2 L milk");
    expect(html).not.toContain("Can be undone");
  });

  it("sits just before the time in a reply's corner", () => {
    const html = renderToStaticMarkup(
      <ChatMessage role="assistant" sentAt={{ label: "9:22 pm", dateTime: "2026-10-26T15:52:00Z" }} timeLead={<PreviewInfo label="Details" preview={PREVIEW} />}>
        Added milk.
      </ChatMessage>,
    );
    expect(html.indexOf('aria-label="Details"')).toBeLessThan(html.indexOf("<time"));
    expect(html).toContain("ps-[2.0625rem]");
  });

  it("the time's room is wider only when there is an i", () => {
    expect(renderToStaticMarkup(<ChatTimeRoom label="9:22 pm" />)).toContain("ps-2.5");
    expect(renderToStaticMarkup(<ChatTimeRoom label="9:22 pm" lead />)).toContain("ps-[2.0625rem]");
  });
});
