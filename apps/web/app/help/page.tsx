import { BookOpen, LifeBuoy, MessageCircleQuestion, Sparkles } from "lucide-react";
import Link from "next/link";

import { guideByGroup, localizedFaq } from "@wonderhome/core/help/guide";
import { localizedReleaseNotes } from "@wonderhome/core/help/release-notes";
import { suggestedQuestions } from "@wonderhome/core/help/search";
import { helpWords } from "@wonderhome/core/help/words";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Card } from "@wonderhome/core/ui/card";
import { ExpandableRow } from "@wonderhome/core/ui/expandable-row";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { PillLink } from "@wonderhome/core/ui/pill";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";

import { GuideAssistant } from "../_components/guide-assistant";
import { requireSession } from "../_lib/session";
import { askTheGuide } from "./help-actions";

// Members only, and never indexed: the guide describes a household's own
// product and is not a public page.
export const metadata = { title: "Get help", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Get help: the user guide, the questions people actually ask, and a way to
 * search both.
 *
 * Everything here describes what WonderHome does today. Where something is
 * not built, the guide says so and says what happens instead — a guide that
 * describes the roadmap makes working software feel broken.
 *
 * **Members only.** The route gate (`security/route-policy.ts`) and
 * `requireSession` both send a signed-out visitor to sign-in and back here
 * afterwards; the search action refuses a caller with no session; the guide's
 * words live outside the catalogs that reach the browser (`help/words.ts`);
 * and the response is never cached publicly or indexed (next.config.ts).
 * What stays public for somebody who cannot get in is the sign-in, sign-up
 * and password-reset screens themselves, contact on the landing page, and
 * the terms and privacy page (`security/route-policy.ts` has the list and
 * why each stays public).
 *
 * **In the reader's language** (story 22-004). The guide, the FAQ, the search
 * box and its answers are in the viewer's own language. Section ids — the
 * anchors — are the same in every language.
 */
export default async function HelpPage() {
  const session = await requireSession("/help");
  const { t, preferences, format } = session.locale;
  const language = preferences.language;
  const hw = helpWords(language);
  const groups = guideByGroup(hw);
  const faq = localizedFaq(hw);
  const releases = localizedReleaseNotes(hw);
  const [correctBefore, correctAfter] = hw("help.page.correct", { link: "{link}" }).split("{link}");

  const body = (
      <div className="space-y-6">
        <header className="wh-rise">
          <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">{hw("help.page.title")}</h1>
          <p className="text-sm text-[var(--wh-foreground-muted)]">{hw("help.page.lede")}</p>
        </header>

        <GuideAssistant
          ask={askTheGuide.bind(null, language)}
          suggestions={suggestedQuestions(hw)}
          labels={{
            title: hw("help.ask.title"),
            lede: hw("help.ask.lede"),
            label: hw("help.ask.label"),
            placeholder: hw("help.ask.placeholder"),
            submit: hw("help.ask.submit"),
            searching: hw("help.ask.searching"),
            ready: hw("help.ask.ready"),
            read: hw("help.ask.read"),
            also: hw("help.ask.also"),
          }}
        />

        {/* Contents, so a long guide stays navigable on a phone. */}
        <nav aria-label={hw("help.page.contents")}>
          <SectionHeader title={hw("help.page.inThisGuide")} />
          <Card className="p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {groups.map(({ group, title, sections }) => (
                <div key={group}>
                  <p className="text-[0.6875rem] font-semibold tracking-[0.1em] text-[var(--wh-foreground-subtle)] uppercase">
                    {title}
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
            <a
              href="#release-notes"
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--wh-primary)] underline-offset-2 hover:underline"
            >
              <Sparkles aria-hidden className="size-4" /> {hw("help.release.title")}
            </a>
          </Card>
        </nav>

        <section>
          <SectionHeader title={hw("help.page.commonQuestions")} count={faq.length} />
          <Card className="p-2">
            <ul className="divide-y divide-[var(--wh-border)]">
              {faq.map((entry) => (
                <li key={entry.id} className="px-2 py-3">
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
                        {hw("help.page.readMore")}
                      </a>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          </Card>
        </section>

        {groups.map(({ group, title, sections }) => (
          <section key={group}>
            <SectionHeader title={title} />
            <div className="space-y-3">
              {sections.map((section) => (
                <Card key={section.id} id={section.id} className="scroll-mt-24 p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <IconTile icon={BookOpen} tone="home" />
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-semibold tracking-tight">{section.title}</h3>
                      <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{section.summary}</p>
                      <p className="mt-1 text-xs text-[var(--wh-foreground-subtle)]">
                        {hw("help.page.updated", { date: format.numericDate(section.updated) })}
                      </p>
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

        {/* The record of what reached the household, newest first; each release opens to its list (rule 21). */}
        <section id="release-notes" className="scroll-mt-24">
          <SectionHeader title={hw("help.release.title")} />
          <p className="mb-2 text-sm text-[var(--wh-foreground-muted)]">{hw("help.release.lede")}</p>
          <Card className="p-2">
            <ul className="space-y-1">
              {releases.map((release) => (
                <ExpandableRow
                  key={release.id}
                  summary={
                    <>
                      <IconTile icon={Sparkles} tone="ai" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{release.title}</span>
                        <span className="block text-xs text-[var(--wh-foreground-subtle)]">
                          {hw("help.release.liveSince", { date: format.date(release.date, "full") })}
                        </span>
                      </span>
                    </>
                  }
                >
                  <ul className="list-disc space-y-2 pl-5 text-sm sm:pl-14 leading-relaxed text-[var(--wh-foreground-muted)] marker:text-[var(--wh-foreground-subtle)]">
                    {release.items.map((item) => (
                      <li key={item.slice(0, 40)}>{item}</li>
                    ))}
                  </ul>
                </ExpandableRow>
              ))}
            </ul>
          </Card>
        </section>

        <Card className="flex items-start gap-3 bg-[var(--wh-primary-soft)]/50 p-4">
          <LifeBuoy aria-hidden className="mt-0.5 size-5 shrink-0 text-[var(--wh-primary)]" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {hw("help.page.stuck.title")}
            </p>
            <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">
              {hw("help.page.stuck.body")}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <PillLink href="/ai" tone="primary">{hw("help.page.stuck.open")}</PillLink>
            </div>
          </div>
        </Card>

        <p className="text-center text-xs text-[var(--wh-foreground-subtle)]">
          {correctBefore}
          <Link href="/certification" className="font-medium text-[var(--wh-primary)] underline-offset-2 hover:underline">
            {hw("help.page.correct.link")}
          </Link>
          {correctAfter}
        </p>

        <QuoteCard>{hw("help.page.quote")}</QuoteCard>
      </div>
  );

  return (
    <AppShell
      active="more"
      viewer={session.viewer}
      secondary={session.secondary}
      pathname="/help"
      back={{ href: "/more", label: t("common.back") }}
      title={hw("help.page.title")}
    >
      {body}
    </AppShell>
  );
}
