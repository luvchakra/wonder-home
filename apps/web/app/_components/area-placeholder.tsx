import { Card, CardHeader, CardTitle } from "@wonderhome/core/ui/card";

export type AreaPlaceholderProps = {
  title: string;
  lede: string;
  /**
   * Empty states explain what WonderHome can do next rather than saying "No data"
   * (design/UI-MOCKUP-IMPLEMENTATION-SPEC.md, interaction rule 7).
   */
  nextUp: string;
};

export function AreaPlaceholder({ title, lede, nextUp }: AreaPlaceholderProps) {
  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-[var(--wh-foreground-muted)]">{lede}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Nothing to show yet</CardTitle>
        </CardHeader>
        <p className="text-sm text-[var(--wh-foreground-muted)]">{nextUp}</p>
      </Card>
    </div>
  );
}
