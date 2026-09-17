import { Card, CardHeader, CardTitle } from "@wonderhome/core/ui/card";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";

export type AreaPlaceholderProps = {
  title: string;
  lede: string;
  /**
   * Empty states explain what WonderHome can do next rather than saying "No data"
   * (design/UI-MOCKUP-IMPLEMENTATION-SPEC.md, interaction rule 7).
   */
  nextUp: string;
  /** The closing line the mockups end a screen with. */
  quote?: string;
};

export function AreaPlaceholder({ title, lede, nextUp, quote }: AreaPlaceholderProps) {
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-[1.375rem] font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-[var(--wh-foreground-muted)]">{lede}</p>
      </header>

      <Card className="p-5">
        <CardHeader>
          <CardTitle>Nothing to show yet</CardTitle>
        </CardHeader>
        <p className="text-sm text-[var(--wh-foreground-muted)]">{nextUp}</p>
      </Card>

      {quote ? <QuoteCard>{quote}</QuoteCard> : null}
    </div>
  );
}
