import Link from "next/link";
import type { ReactNode } from "react";

import { Card } from "@wonderhome/core/ui/card";

export type AuthLayoutProps = {
  title: string;
  lede: string;
  children: ReactNode;
  footer?: { prompt: string; href: string; label: string };
};

/** The signed-out frame: centred, calm, no navigation to distract from one task. */
export function AuthLayout({ title, lede, children, footer }: AuthLayoutProps) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <header className="space-y-1 text-center">
        <p className="text-sm font-medium text-[var(--wh-primary)]">WonderHome</p>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-[var(--wh-foreground-muted)]">{lede}</p>
      </header>

      <Card className="p-5">{children}</Card>

      {footer ? (
        <p className="text-center text-sm text-[var(--wh-foreground-muted)]">
          {footer.prompt}{" "}
          <Link href={footer.href} className="font-medium text-[var(--wh-primary)] underline">
            {footer.label}
          </Link>
        </p>
      ) : null}
    </main>
  );
}
