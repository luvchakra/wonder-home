import Link from "next/link";

import { englishInstallBannerLabels } from "@wonderhome/core/pwa/install-labels";
import { InstallBanner } from "@wonderhome/core/shell/install-banner";
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
    <>
      <InstallBanner labels={englishInstallBannerLabels()} />
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
                <strong className="font-semibold text-[var(--wh-foreground)]">The assistant uses an AI provider.</strong>{" "}
                The assistant sends it what it needs to understand you and word an answer, leaving out
                any kind of information an Admin has not allowed in Settings → AI Assistant. Calendar,
                mail, school and payment connectors exist in the code but none is live, so nothing is
                read from or written to those accounts.
              </li>
              <li>
                <strong className="font-semibold text-[var(--wh-foreground)]">Nothing spends money.</strong>{" "}
                No payment provider is configured. Paying a bill prepares an approval and stops.
              </li>
              <li>
                <strong className="font-semibold text-[var(--wh-foreground)]">You can take your data with you, or have it deleted.</strong>{" "}
                Settings → Privacy & security downloads a copy after you confirm your password, and a
                deletion request waits 30 days, so you can call it off.
              </li>
            </ul>
          </Card>

          <Card id="your-information" className="scroll-mt-6 space-y-4 p-5">
            <h2 className="text-base font-semibold tracking-tight">Your personal information</h2>
            <p className="text-sm leading-relaxed text-[var(--wh-foreground-muted)]">
              You are trusting us with things that matter: where your family lives, when your children were born,
              their faces. We know that, and we look after them the way we would want our own family&apos;s looked after.
            </p>
            <ul className="space-y-3 text-sm leading-relaxed text-[var(--wh-foreground-muted)]">
              <li>
                <strong className="font-semibold text-[var(--wh-foreground)]">It stays inside your home.</strong>{" "}
                Only the people in your household can see your family&apos;s details, and only what their role allows.
                Your home address is seen by the adults, never by helpers or children.
              </li>
              <li>
                <strong className="font-semibold text-[var(--wh-foreground)]">It is locked up.</strong>{" "}
                Everything travels over an encrypted connection and is stored encrypted. Photos are kept in private
                storage and shown through links that stop working within the hour.
              </li>
              <li>
                <strong className="font-semibold text-[var(--wh-foreground)]">We only ask for what helps.</strong>{" "}
                Almost every detail is optional. Leave out anything you would rather not share.
              </li>
              <li>
                <strong className="font-semibold text-[var(--wh-foreground)]">We never sell it.</strong>{" "}
                Your information is never sold, never used for advertising, and never used to train AI models.
                When you look up an address or a school, what you type goes to Google Maps, along with your home&apos;s
                location when it is finding schools near you. Nothing else about your family goes with it.
              </li>
              <li>
                <strong className="font-semibold text-[var(--wh-foreground)]">You stay in charge.</strong>{" "}
                You can correct anything, download a copy of everything, or ask us to delete it all from
                Settings → Privacy & security.
              </li>
            </ul>
            <p className="text-sm leading-relaxed text-[var(--wh-foreground-muted)]">
              We build WonderHome around the principles of the privacy laws that protect families where we work: India&apos;s{" "}
              <a href="https://www.meity.gov.in/data-protection-framework" target="_blank" rel="noopener noreferrer" className="font-medium text-[var(--wh-primary)] underline-offset-2 hover:underline">
                Digital Personal Data Protection Act, 2023
              </a>{" "}
              and Europe&apos;s{" "}
              <a href="https://eur-lex.europa.eu/eli/reg/2016/679/oj" target="_blank" rel="noopener noreferrer" className="font-medium text-[var(--wh-primary)] underline-offset-2 hover:underline">
                General Data Protection Regulation (GDPR)
              </a>
              : ask only for what is needed, use it only for what you asked, keep it safe, and let you see, correct
              and erase it. WonderHome has not yet been through a formal audit against either, and we will say so
              here until it has.
            </p>
          </Card>

          <p className="text-sm text-[var(--wh-foreground-muted)]">
            Members can read the user guide in the app, under More → Get Help:{" "}
            <Link href="/sign-in?next=%2Fhelp" className="font-medium text-[var(--wh-primary)] underline-offset-2 hover:underline">
              sign in to read it
            </Link>
            .
          </p>

          <footer className="flex items-center gap-2 border-t border-[var(--wh-border)] pt-6 text-xs text-[var(--wh-foreground-subtle)]">
            <BrandMark size={16} />
            <Link href="/" className="hover:text-[var(--wh-foreground)]">Back to WonderHome</Link>
          </footer>
        </div>
      </main>
    </>
  );
}
