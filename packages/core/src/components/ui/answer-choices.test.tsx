import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AnswerChoices } from "./answer-choices";

/**
 * The answers to pick under HomeTalk's question (rule 20). Expected first:
 * one answer is a radio group of 44 px chips; several are checkboxes with one
 * Send and "Not now" beside it; once answered, every one is disabled; no
 * label is ever cut.
 */
const noop = () => undefined;
const DAYS = [
  { label: "Today", say: "today" },
  { label: "Tomorrow", say: "tomorrow" },
  { label: "Another day…", say: null },
];

describe("AnswerChoices", () => {
  it("one answer: a labelled radio group, one chip per choice, the first in the tab order", () => {
    const html = renderToStaticMarkup(<AnswerChoices legend="Answers to pick" sendLabel="Send" name="c1" mode="single" choices={DAYS} onPick={noop} onSend={noop} />);
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="Answers to pick"');
    expect(html.match(/role="radio"/g)).toHaveLength(3);
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    expect(html).toContain("min-h-11");
    for (const label of ["Today", "Tomorrow", "Another day…"]) expect(html).toContain(`>${label}</button>`);
    expect(html).not.toMatch(/truncate|text-ellipsis|whitespace-nowrap/);
    expect(html).not.toContain(`disabled=""`);
  });

  it("answered: every chip is disabled", () => {
    const html = renderToStaticMarkup(<AnswerChoices legend="Answers to pick" sendLabel="Send" name="c1" mode="single" choices={DAYS} disabled onPick={noop} onSend={noop} />);
    expect(html.match(/disabled=""/g)).toHaveLength(3);
    expect(html).toContain('aria-disabled="true"');
  });

  it("several answers: checkboxes, all ticked to start, one Send, and Not now beside it", () => {
    const html = renderToStaticMarkup(
      <AnswerChoices
        legend="Answers to pick"
        sendLabel="Send"
        name="c2"
        mode="multi"
        choices={[{ label: "Maths worksheet", say: "Maths worksheet" }, { label: "Diwali dinner", say: "Diwali dinner" }]}
        also={[{ label: "Not now", say: "not now" }]}
        onPick={noop}
        onSend={noop}
      />,
    );
    expect(html.match(/type="checkbox"/g)).toHaveLength(2);
    expect(html.match(/checked=""/g)).toHaveLength(2);
    expect(html).toContain(">Send</button>");
    expect(html).toContain(">Not now</button>");
    expect(html).toContain("<legend");
  });

  it("several answers, answered: the checkboxes, Send and Not now are disabled", () => {
    const html = renderToStaticMarkup(
      <AnswerChoices legend="Answers to pick" sendLabel="Send" name="c3" mode="multi" choices={[{ label: "A", say: "A" }]} also={[{ label: "Not now", say: "not now" }]} disabled onPick={noop} onSend={noop} />,
    );
    expect(html.match(/disabled=""/g)).toHaveLength(3);
  });
});
