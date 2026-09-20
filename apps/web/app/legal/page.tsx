import Link from "next/link";

import { BrandMark, Wordmark } from "@wonderhome/core/ui/brand";
import { Card } from "@wonderhome/core/ui/card";

export const metadata = { title: "Terms and privacy" };

/**
 * Terms and privacy, stated honestly.
 *
 * Sign-up says "you agree to our Terms of Service and Privacy Policy", and
 * until now that sentence pointed nowhere. Publishing invented legal text
 * would be worse than the dangling reference, so this page says plainly what
 * has and has not been published, and describes what the software actually
 * does with a household's data today — which is the part a family can check
 * against the product and the source.
 */
export default function LegalPage() {
  return (
    <main className="min-h-dvh px-4 py-10 lg:px-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <Link href="/" aria-label="WonderHome home" className="inline-block">
          <Wordmark tagline size={32} />
        </Link>

        <header className="space-y-2">
          <h1 className="text-[length:var(--wh-text-title)] font-bold tracking-tight">Terms and privacy</h1>
          <p className="text-sm text-[var(--wh-foreground-muted)]">
            WonderHome is in active development. Formal terms of service and a privacy policy have
            not been published yet, and we would rather say so than show you a document that has
            not been written or reviewed.
          </p>
        </header>

        <Card className="space-y-4 p-5">
          <h2 className="text-base font-semibold tracking-tight">What the software does today</h2>
          <ul className="space-y-3 text-sm leading-relaxed text-[var(--wh-foreground-muted)]">
            <li>
              <strong className="font-semibold text-[var(--wh-foreground)]">Your household&apos;s data is not used to
              train models.</strong>{" "}
              Not by default, and no setting currently changes that.
            </li>
            <li>
              <strong className="font-semibold text-[var(--wh-foreground)]">Only your household can see it.</strong>{" "}
              Who may see what is decided by the server and enforced again by the database. A screen
              hiding something is presentation, never the thing keeping it private.
            </li>
            <li>
              <strong className="font-semibold text-[var(--wh-foreground)]">No provider is connected.</strong>{" "}
              Calendar, mail, school and payment connectors exist in the code but none is live, so
              nothing is being read from or written to an outside account.
            </li>
            <li>
              <strong className="font-semibold text-[var(--wh-foreground)]">Nothing spends money.</strong>{" "}
              No payment provider is configured. Paying a bill prepares an approval and stops.
            </li>
            <li>
              <strong className="font-semibold text-[var(--wh-foreground)]">Export and deletion are not built yet.</strong>{" "}
              They are listed in Settings as coming rather than as buttons that do nothing. Until
              they exist, ask and we will do it by hand.
            </li>
          </ul>
        </Card>

        <p className="text-sm text-[var(--wh-foreground-muted)]">
          The user guide explains the same ground in more detail, from inside the product:{" "}
          <Link href="/help" className="font-medium text-[var(--wh-primary)] underline-offset-2 hover:underline">
            Get Help
          </Link>
          .
        </p>

        <footer className="flex items-center gap-2 border-t border-[var(--wh-border)] pt-6 text-xs text-[var(--wh-foreground-subtle)]">
          <BrandMark size={16} />
          <Link href="/" className="hover:text-[var(--wh-foreground)]">Back to WonderHome</Link>
        </footer>
      </div>
    </main>
  );
}
