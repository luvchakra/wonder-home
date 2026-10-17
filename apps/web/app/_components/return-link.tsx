import { ArrowLeft } from "lucide-react";
import Link from "next/link";

/**
 * "Back to where you were", for someone sent to a settings page to fix one
 * thing (HomeTalk's Gemini Live, say). The page's own save also sends them
 * back; this is the way back without changing anything.
 */
export function ReturnLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--wh-radius-pill)] bg-[var(--wh-primary-soft)] px-4 text-sm font-semibold text-[var(--wh-primary)] hover:bg-[var(--wh-info-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]"
    >
      <ArrowLeft aria-hidden className="size-4 rtl:rotate-180" /> {label}
    </Link>
  );
}

/** What the way back is called: HomeTalk by name, anywhere else as "where you were". */
export function returnLabelKey(returnTo: string): "settingsPage.returnTo.hometalk" | "settingsPage.returnTo.previous" {
  return returnTo === "/ai" || returnTo.startsWith("/ai?") ? "settingsPage.returnTo.hometalk" : "settingsPage.returnTo.previous";
}
