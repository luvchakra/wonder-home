"use client";

import { BookOpen, CornerDownLeft, Search, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";

import type { Answer } from "@wonderhome/core/help/search";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";

type Exchange = { question: string; answer: Answer };

/**
 * Ask the guide.
 *
 * It searches the user guide and answers with the passage it found, plus a
 * link to the section it came from — which is why every answer can be
 * checked. It is not a language model and does not pretend to be one: the
 * heading says it searches the guide, and when nothing matches it says so
 * rather than producing a confident-sounding paragraph about a feature
 * WonderHome does not have.
 */
export function GuideAssistant({
  ask,
  suggestions,
}: {
  ask: (question: string) => Promise<Answer>;
  suggestions: readonly string[];
}) {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<Exchange[]>([]);
  const [pending, startTransition] = useTransition();

  function submit(asked: string) {
    const trimmed = asked.trim();
    if (trimmed.length === 0) return;

    setQuestion("");
    startTransition(async () => {
      const answer = await ask(trimmed);
      setHistory((previous) => [...previous, { question: trimmed, answer }]);
    });
  }

  return (
    <Card className="space-y-4 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <IconTile icon={Sparkles} tone="ai" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold tracking-tight">Ask the guide</h2>
          <p className="mt-0.5 text-xs text-[var(--wh-foreground-muted)]">
            Searches this guide and answers with a link to the section it came from. Not a language
            model — so it will say when it does not know rather than invent an answer.
          </p>
        </div>
      </div>

      {history.length > 0 ? (
        <ol className="space-y-3">
          {history.map((exchange, index) => (
            <li key={`${exchange.question}-${index}`} className="space-y-2">
              <p className="ml-auto w-fit max-w-[85%] rounded-[var(--wh-radius-sm)] bg-[var(--wh-primary)] px-3 py-2 text-sm text-[var(--wh-primary-foreground)]">
                {exchange.question}
              </p>
              <div className="w-fit max-w-[95%] rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] px-3 py-2.5">
                <p className="text-sm leading-relaxed">{exchange.answer.reply}</p>
                {exchange.answer.confident ? (
                  <a
                    href={`#${exchange.answer.sectionId}`}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--wh-primary)] underline-offset-2 hover:underline"
                  >
                    <BookOpen aria-hidden className="size-3.5" />
                    Read: {exchange.answer.sectionTitle}
                  </a>
                ) : null}
                {exchange.answer.alsoSee.length > 0 ? (
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--wh-foreground-muted)]">
                    <span>Also:</span>
                    {exchange.answer.alsoSee.map((also) => (
                      <a key={also.id} href={`#${also.id}`} className="underline-offset-2 hover:underline">
                        {also.title}
                      </a>
                    ))}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit(question);
        }}
        className="relative"
      >
        <label htmlFor="guide-question" className="sr-only">
          Ask a question about WonderHome
        </label>
        <Search aria-hidden className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--wh-foreground-subtle)]" />
        <input
          id="guide-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask anything about WonderHome…"
          className="block min-h-11 w-full rounded-[var(--wh-radius-pill)] border border-[var(--wh-border)] bg-[var(--wh-surface)] py-2 pr-12 pl-9 text-base focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--wh-primary)]"
        />
        <button
          type="submit"
          disabled={pending || question.trim().length === 0}
          aria-label="Ask"
          className="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-[var(--wh-primary)] text-[var(--wh-primary-foreground)] transition-opacity disabled:opacity-40"
        >
          <CornerDownLeft aria-hidden className="size-4" />
        </button>
      </form>

      <p aria-live="polite" className="sr-only">
        {pending ? "Searching the guide" : history.length > 0 ? "Answer ready" : ""}
      </p>

      {history.length === 0 ? (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => submit(suggestion)}
              className="rounded-[var(--wh-radius-pill)] border border-[var(--wh-border)] px-3 py-1.5 text-xs font-medium text-[var(--wh-foreground-muted)] transition-colors hover:bg-[var(--wh-surface-muted)] hover:text-[var(--wh-foreground)]"
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
