import { BookOpen, LifeBuoy, MessageCircleQuestion } from "lucide-react";
import Link from "next/link";

import { FAQ, guideByGroup } from "@wonderhome/core/help/guide";
import { SUGGESTED_QUESTIONS } from "@wonderhome/core/help/search";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Wordmark } from "@wonderhome/core/ui/brand";
import { LeafDecor } from "@wonderhome/core/ui/leaf-decor";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { PillLink } from "@wonderhome/core/ui/pill";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";

import { GuideAssistant } from "../_components/guide-assistant";
import { optionalSession } from "../_lib/session";
import { askTheGuide } from "./help-actions";

export const metadata = { title: "Get help" };
export const dynamic = "force-dynamic";

/**
 * Get help: the user guide, the questions people actually ask, and a way to
 * search both.
 *
 * Everything here describes what WonderHome does today. Where something is
 * not built, the guide says so and says what happens instead — a guide that
 * describes the roadmap makes working software feel broken.
 *
 * **Readable signed out.** Somebody deciding whether to trust a product with
 * their home should be able to read what it will and will not do first, and
 * somebody who cannot get in is exactly the person who needs the help page.
 * A guide behind a login answers neither. So the session is optional: signed
 * in it sits in the app shell, signed out it gets its own frame and a way in
 * at the end. Nothing in the guide is about a particular household, so there
 * is nothing here to protect.
 */
export default async function HelpPage() {
  const session = await optionalSession();
  const groups = guideByGroup();

  const body = (
      <div className="space-y-6">
        <header className="wh-rise">
          <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">Get help</h1>
          <p className="text-sm text-[var(--wh-foreground-muted)]">
            How WonderHome works, what it will never do without asking, and the answers to the
            questions families ask first.
          </p>
        </header>

        <GuideAssistant ask={askTheGuide} suggestions={SUGGESTED_QUESTIONS} />

        {/* Contents, so a long guide stays navigable on a phone. */}
        <nav aria-label="Guide contents">
          <SectionHeader title="In this guide" />
          <Card className="p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {groups.map(({ group, sections }) => (
                <div key={group}>
                  <p className="text-[0.6875rem] font-semibold tracking-[0.1em] text-[var(--wh-foreground-subtle)] uppercase">
                    {group}
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {sections.map((section) => (
                      <li key={section.id}>
                        <a
                          href={`#${section.id}`}
                          className="text-sm text-[var(--wh-foreground-muted)] underline-offset-2 hover:text-[var(--wh-primary)] hover:underline"
                        >
                          {section.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Card>
        </nav>

        <section>
          <SectionHeader title="Common questions" count={FAQ.length} />
          <Card className="p-2">
            <ul className="divide-y divide-[var(--wh-border)]">
              {FAQ.map((entry) => (
                <li key={entry.question} className="px-2 py-3">
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-start gap-3">
                      <IconTile icon={MessageCircleQuestion} tone="ai" size="sm" />
                      <span className="min-w-0 flex-1 text-sm font-medium">{entry.question}</span>
                      <span aria-hidden className="text-[var(--wh-foreground-subtle)] transition-transform group-open:rotate-45">
                        +
                      </span>
                    </summary>
                    <div className="mt-2 pl-11">
                      <p className="text-sm leading-relaxed text-[var(--wh-foreground-muted)]">{entry.answer}</p>
                      <a
                        href={`#${entry.section}`}
                        className="mt-1.5 inline-block text-xs font-semibold text-[var(--wh-primary)] underline-offset-2 hover:underline"
                      >
                        Read more in the guide
                      </a>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          </Card>
        </section>

        {groups.map(({ group, sections }) => (
          <section key={group}>
            <SectionHeader title={group} />
            <div className="space-y-3">
              {sections.map((section) => (
                <Card key={section.id} id={section.id} className="scroll-mt-24 p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <IconTile icon={BookOpen} tone="home" />
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-semibold tracking-tight">{section.title}</h3>
                      <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{section.summary}</p>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2.5">
                    {section.body.map((paragraph) => (
                      <p key={paragraph.slice(0, 40)} className="text-sm leading-relaxed text-[var(--wh-foreground-muted)]">
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          </section>
        ))}

        {/* The two calls below reach into a household, so a signed-out reader
            is offered the way in rather than a link that would bounce them to
            sign-in and lose their place in the guide. */}
        <Card className="flex items-start gap-3 bg-[var(--wh-primary-soft)]/50 p-4">
          <LifeBuoy aria-hidden className="mt-0.5 size-5 shrink-0 text-[var(--wh-primary)]" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{session ? "Still stuck?" : "Want this for your home?"}</p>
            <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">
              {session
                ? "Ask WonderHome directly — it can act on your household, which this guide cannot."
                : "The guide describes what WonderHome does. Signing in is where it starts doing it."}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {session ? (
                <PillLink href="/ai" tone="primary">Open HomeTalk</PillLink>
              ) : (
                <>
                  <PillLink href="/sign-up" tone="primary">Get started</PillLink>
                  <PillLink href="/sign-in" tone="quiet">Sign in</PillLink>
                </>
              )}
            </div>
          </div>
        </Card>

        {session ? (
          <p className="text-center text-xs text-[var(--wh-foreground-subtle)]">
            Something here wrong or missing?{" "}
            <Link href="/certification" className="font-medium text-[var(--wh-primary)] underline-offset-2 hover:underline">
              Check what WonderHome believes
            </Link>{" "}
            about your household and correct it.
          </p>
        ) : null}

        <QuoteCard>Every home is different. Yours should feel like it.</QuoteCard>
      </div>
  );

  if (session) {
    return (
      <AppShell
        active="more"
        viewer={session.viewer}
        secondary={session.secondary}
        pathname="/help"
        back={{ href: "/more", label: "Back" }}
        title="Get help"
      >
        {body}
      </AppShell>
    );
  }

  return (
    <main className="relative min-h-dvh overflow-hidden px-4 py-10 lg:px-8">
      <LeafDecor corner="top-right" size={280} opacity={0.22} />
      <div className="relative mx-auto max-w-3xl space-y-6">
        <Link href="/" aria-label="WonderHome home" className="inline-block">
          <Wordmark tagline size={32} />
        </Link>
        {body}
      </div>
    </main>
  );
}
