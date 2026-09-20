import Link from "next/link";
import type { ReactNode } from "react";

import { parseReply, type Inline } from "../../conversation/reply-format";
import { cn } from "../../lib/cn";

/**
 * An assistant reply, rendered.
 *
 * Paragraphs, a bullet list, bold, and links to screens in this app — and
 * nothing else, because `parseReply` produces nothing else. A link is a real
 * `Link`, so "see Bills" is one tap from the answer to the bill. The text is
 * never treated as markup: whatever a model wrote is text until the parser
 * says it is a list, an emphasis or a vetted path.
 */
export function ReplyText({ text, className }: { text: string; className?: string }) {
  const blocks = parseReply(text);
  return (
    <div className={cn("space-y-2", className)}>
      {blocks.map((block, index) =>
        block.kind === "paragraph" ? (
          <p key={index}>{renderInlines(block.inlines)}</p>
        ) : (
          <ul key={index} className="space-y-1 pl-4 [list-style:disc]">
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex} className="marker:text-[var(--wh-foreground-subtle)]">
                {renderInlines(item)}
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}

function renderInlines(inlines: Inline[]): ReactNode {
  return inlines.map((inline, index) => {
    switch (inline.kind) {
      case "bold":
        return <strong key={index} className="font-semibold">{inline.text}</strong>;
      case "link":
        return (
          <Link
            key={index}
            href={inline.href}
            className="font-semibold text-[var(--wh-primary)] underline decoration-[var(--wh-primary)]/40 underline-offset-2 hover:text-[var(--wh-primary-hover)]"
          >
            {inline.label}
          </Link>
        );
      default:
        return <span key={index}>{inline.text}</span>;
    }
  });
}
