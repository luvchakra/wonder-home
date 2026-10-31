import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { COUNTER_FROM, TextareaField, fitToContent, supportsFieldSizing } from "./textarea-field";

describe("TextareaField", () => {
  it("renders a labelled textarea that sizes to its content, capped so Save stays reachable", () => {
    const html = renderToStaticMarkup(<TextareaField label="Notes (optional)" name="detail" />);
    expect(html).toContain('<label for="detail"');
    expect(html).toContain("<textarea");
    expect(html).toContain('id="detail"');
    expect(html).toContain('name="detail"');
    expect(html).toContain('rows="2"');
    expect(html).toContain("field-sizing-content");
    expect(html).toContain("max-h-[40vh]");
    expect(html).toContain("whitespace-pre-wrap");
  });

  it("shows saved text as written, newlines kept", () => {
    const html = renderToStaticMarkup(<TextareaField label="Notes" name="detail" defaultValue={"1. Food\n2. Water"} />);
    expect(html).toContain("1. Food\n2. Water");
  });

  it("passes a controlled value and onChange through", () => {
    const onChange = vi.fn();
    const html = renderToStaticMarkup(<TextareaField label="Notes" name="n" value="hello" onChange={onChange} />);
    expect(html).toContain(">hello</textarea>");
  });

  it("respects maxLength and counts only near it", () => {
    const quiet = renderToStaticMarkup(<TextareaField label="Notes" name="n" maxLength={100} defaultValue="short" />);
    expect(quiet).toContain('maxLength="100"');
    expect(quiet).not.toContain("/ 100");
    const near = renderToStaticMarkup(<TextareaField label="Notes" name="n" maxLength={100} defaultValue={"x".repeat(100 * COUNTER_FROM)} />);
    expect(near).toContain("90 / 100");
  });

  it("wires hint and error to the field", () => {
    const html = renderToStaticMarkup(<TextareaField label="Notes" name="n" hint="Anything useful" error="Too long" />);
    expect(html).toContain('aria-describedby="n-hint n-error"');
    expect(html).toContain('aria-invalid="true"');
  });
});

describe("auto-grow fallback", () => {
  it("fitToContent sets the height to the scroll height", () => {
    const el = { style: { height: "" }, scrollHeight: 96 } as unknown as HTMLTextAreaElement;
    fitToContent(el);
    expect(el.style.height).toBe("96px");
  });

  it("reports no field-sizing support where CSS is absent", () => {
    expect(supportsFieldSizing()).toBe(false);
  });
});
