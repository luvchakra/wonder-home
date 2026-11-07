import type { ReactNode } from "react";

import { Card } from "@wonderhome/core/ui/card";

/**
 * The top of every platform-admin page, as WonderWorks' admin has it: a title,
 * one human sentence under it (rule 7), and the page's own actions on the right.
 */
export function PageTitle({ title, subtitle, actions }: { title: string; subtitle: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <h1 className="text-[length:var(--wh-text-title)] font-bold tracking-tight">{title}</h1>
        <p className="max-w-prose text-sm text-[var(--wh-foreground-muted)]">{subtitle}</p>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

/** A titled card of one part of a page (WonderWorks' `Panel`). */
export function Panel({ title, description, action, children, id }: { title: string; description?: ReactNode; action?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <Card className="space-y-3" id={id}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          {description ? <p className="text-sm text-[var(--wh-foreground-muted)]">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

/** The page body's width and rhythm, the same on every section. */
export function PageBody({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-dvh px-4 py-8 lg:px-8 lg:py-10">
      <div className="mx-auto max-w-5xl space-y-6">{children}</div>
    </main>
  );
}
