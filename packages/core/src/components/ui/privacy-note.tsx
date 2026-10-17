import { ShieldCheck } from "lucide-react";

import { cn } from "../../lib/cn";

/**
 * One quiet line under a form that asks for personal details — an address,
 * a date of birth, a photo: that we know they are trusting us with them, and
 * a link to how we look after them. Small and calm, never a banner, and one
 * per screen. The link opens in a new tab so a half-filled form is never lost.
 */
export function PrivacyNote({ line, more, href = "/legal#your-information", className }: { line: string; more: string; href?: string; className?: string }) {
  return (
    <p className={cn("flex items-start gap-1.5 text-xs leading-relaxed text-[var(--wh-foreground-subtle)]", className)}>
      <ShieldCheck aria-hidden className="mt-0.5 size-3.5 shrink-0 text-[var(--wh-handled)]" />
      <span>
        {line}{" "}
        <a href={href} target="_blank" rel="noopener" className="font-medium text-[var(--wh-primary)] underline-offset-2 hover:underline">
          {more}
        </a>
      </span>
    </p>
  );
}
