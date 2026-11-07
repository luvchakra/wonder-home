import { ArrowRight, Bell, CalendarDays, GraduationCap, HeartPulse, Inbox, Lock, MessageCircleHeart, ShieldCheck, ShoppingBasket, Smartphone, Wallet } from "lucide-react";
import Link from "next/link";
import type { ComponentType } from "react";

import { installBannerLabels } from "@wonderhome/core/pwa/install-labels";
import { InstallBanner } from "@wonderhome/core/shell/install-banner";
import { Wordmark } from "@wonderhome/core/ui/brand";
import { ButtonLink } from "@wonderhome/core/ui/button";
import { HomeIllustration } from "@wonderhome/core/ui/home-illustration";
import { IconTile, type IconTone } from "@wonderhome/core/ui/icon-tile";
import { LeafDecor } from "@wonderhome/core/ui/leaf-decor";
import { ScriptAccent } from "@wonderhome/core/ui/script-accent";

import { visitorLocale } from "../_lib/entry-locale";

type Icon = ComponentType<{ className?: string }>;

const FEATURES: { id: string; icon: Icon; tone: IconTone }[] = [
  { id: "talk", icon: MessageCircleHeart, tone: "people" },
  { id: "send", icon: Inbox, tone: "primary" },
  { id: "calendar", icon: CalendarDays, tone: "home" },
  { id: "school", icon: GraduationCap, tone: "school" },
  { id: "food", icon: ShoppingBasket, tone: "meals" },
  { id: "bills", icon: Wallet, tone: "money" },
  { id: "health", icon: HeartPulse, tone: "care" },
  { id: "reminders", icon: Bell, tone: "ai" },
];

/**
 * The new landing (owner, 2026-11-07): one page, in the visitor's language,
 * all server-rendered. No client JavaScript of its own: the FAQ is native
 * <details>, and the page links by anchor. It describes only what WonderHome
 * does today, and has no invented testimonials, prices or numbers.
 */
export async function NewLanding() {
  const { t, language, dir } = await visitorLocale();
  const steps = [1, 2, 3] as const;
  const questions = [1, 2, 3, 4, 5] as const;
  const trust = [1, 2, 3] as const;
  const trustIcons: Icon[] = [Lock, ShieldCheck, Smartphone];

  return (
    <div lang={language} dir={dir} className="min-h-dvh overflow-x-clip text-[var(--wh-foreground)]">
      <a href="#wh-main" className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-[var(--wh-radius-sm)] focus:bg-[var(--wh-surface)] focus:px-4 focus:py-2 focus:shadow-[var(--wh-shadow-card)]">
        {t("landing.skip")}
      </a>

      <InstallBanner labels={installBannerLabels(t, language)} />

      <header className="sticky top-0 z-40 border-b border-[var(--wh-border)] bg-[var(--wh-surface)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-[var(--wh-content-wide)] items-center justify-between gap-3 px-4 py-3 lg:px-8">
          <Link href="/" aria-label="WonderHome" className="shrink-0">
            <Wordmark size={32} className="[&_span]:whitespace-nowrap" />
          </Link>
          <nav aria-label="Page" className="hidden items-center gap-6 text-sm font-medium text-[var(--wh-foreground-muted)] md:flex">
            <a href="#how" className="hover:text-[var(--wh-foreground)]">{t("landing.nav.how")}</a>
            <a href="#features" className="hover:text-[var(--wh-foreground)]">{t("landing.nav.features")}</a>
            <a href="#faq" className="hover:text-[var(--wh-foreground)]">{t("landing.nav.faq")}</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/sign-in" className="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-[var(--wh-primary)] hover:underline">
              {t("landing.nav.signIn")}
            </Link>
            <ButtonLink href="/sign-up" className="hidden min-h-11 rounded-[var(--wh-radius-pill)] px-5 sm:inline-flex">
              {t("landing.nav.start")}
            </ButtonLink>
          </div>
        </div>
      </header>

      <main id="wh-main">
        <section className="relative overflow-hidden" style={{ background: "var(--wh-gradient-hero)" }}>
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <LeafDecor corner="top-right" size={280} opacity={0.3} />
            <LeafDecor corner="bottom-left" size={200} opacity={0.2} />
          </div>
          <div className="relative mx-auto grid max-w-[var(--wh-content-wide)] items-center gap-10 px-4 pt-10 pb-14 lg:grid-cols-[1fr_1.1fr] lg:px-8 lg:pt-12 lg:pb-20">
            <div className="wh-rise max-w-xl">
              <p className="inline-flex rounded-[var(--wh-radius-pill)] border border-[var(--wh-border)] bg-[var(--wh-surface)]/80 px-3 py-1 text-xs font-semibold text-[var(--wh-primary)]">
                {t("landing.hero.eyebrow")}
              </p>
              <h1 className="mt-5 text-[length:var(--wh-text-display)] leading-[1.05] font-bold tracking-[-0.03em] text-balance">
                {t("landing.hero.title")}
              </h1>
              <p className="mt-5 max-w-md text-lg leading-relaxed text-[var(--wh-foreground-muted)]">{t("landing.hero.lede")}</p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <ButtonLink href="/sign-up" className="min-h-12 rounded-[var(--wh-radius-pill)] px-6 text-base shadow-[var(--wh-shadow-primary)]">
                  {t("landing.hero.cta")} <ArrowRight aria-hidden className="size-4 rtl:rotate-180" />
                </ButtonLink>
                <ButtonLink href="#how" variant="secondary" className="min-h-12 rounded-[var(--wh-radius-pill)] px-6 text-base">
                  {t("landing.hero.secondary")}
                </ButtonLink>
              </div>
              <p className="mt-4 text-xs text-[var(--wh-foreground-muted)]">{t("landing.hero.note")}</p>
              <ScriptAccent tone="people" size="md" heart className="mt-6 whitespace-pre-line">
                {t("landing.hero.script")}
              </ScriptAccent>
            </div>
            <div className="relative mx-auto hidden w-full max-w-lg sm:block lg:max-w-none">
              <HomeIllustration className="wh-rise w-full" />
            </div>
          </div>
        </section>

        <section id="how" className="scroll-mt-20 py-16 lg:py-24">
          <div className="mx-auto max-w-[var(--wh-content-wide)] px-4 lg:px-8">
            <h2 className="text-[length:var(--wh-text-display)] leading-[1.05] font-bold tracking-tight text-balance">{t("landing.how.title")}</h2>
            <p className="mt-3 max-w-xl text-[1.0625rem] text-[var(--wh-foreground-muted)]">{t("landing.how.lede")}</p>
            <ol className="mt-8 grid gap-4 md:grid-cols-3">
              {steps.map((n) => (
                <li key={n} className="rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)] p-5 shadow-[var(--wh-shadow-card)]">
                  <span aria-hidden className="grid size-9 place-items-center rounded-full bg-[var(--wh-primary-soft)] text-sm font-bold text-[var(--wh-primary)]">{n}</span>
                  <h3 className="mt-3 text-base font-semibold">{t(`landing.how.${n}.title`)}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--wh-foreground-muted)]">{t(`landing.how.${n}.body`)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="features" className="relative scroll-mt-20 overflow-hidden border-y border-[var(--wh-border)] bg-[var(--wh-surface)]/60 py-16 lg:py-24">
          <div className="mx-auto max-w-[var(--wh-content-wide)] px-4 lg:px-8">
            <h2 className="text-[length:var(--wh-text-display)] leading-[1.05] font-bold tracking-tight text-balance">{t("landing.features.title")}</h2>
            <p className="mt-3 max-w-xl text-[1.0625rem] text-[var(--wh-foreground-muted)]">{t("landing.features.lede")}</p>
            <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map(({ id, icon, tone }) => (
                <li key={id} className="rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)] p-5 shadow-[var(--wh-shadow-card)]">
                  <IconTile icon={icon} tone={tone} size="md" />
                  <h3 className="mt-3 text-base font-semibold">{t(`landing.features.${id}.title` as "landing.features.talk.title")}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--wh-foreground-muted)]">{t(`landing.features.${id}.body` as "landing.features.talk.body")}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="trust-title" className="py-16 lg:py-20">
          <div className="mx-auto max-w-[var(--wh-content-wide)] px-4 lg:px-8">
            <h2 id="trust-title" className="text-[length:var(--wh-text-title)] font-bold tracking-tight">{t("landing.trust.title")}</h2>
            <ul className="mt-6 grid gap-3 md:grid-cols-3">
              {trust.map((n) => {
                const Glyph = trustIcons[n - 1]!;
                return (
                  <li key={n} className="flex items-center gap-3 rounded-[var(--wh-radius-sm)] bg-[var(--wh-primary-soft)]/50 px-4 py-3 text-sm font-medium">
                    <Glyph aria-hidden className="size-5 shrink-0 text-[var(--wh-primary)]" />
                    {t(`landing.trust.${n}` as "landing.trust.1")}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section id="faq" className="scroll-mt-20 border-t border-[var(--wh-border)] bg-[var(--wh-surface)]/60 py-16 lg:py-20">
          <div className="mx-auto max-w-3xl px-4 lg:px-8">
            <h2 className="text-[length:var(--wh-text-title)] font-bold tracking-tight">{t("landing.faq.title")}</h2>
            <div className="mt-6 space-y-3">
              {questions.map((n) => (
                <details key={n} className="group rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-4">
                  <summary className="flex min-h-12 cursor-pointer items-center py-3 text-sm font-semibold">{t(`landing.faq.${n}.q` as "landing.faq.1.q")}</summary>
                  <p className="pb-4 text-sm leading-relaxed text-[var(--wh-foreground-muted)]">{t(`landing.faq.${n}.a` as "landing.faq.1.a")}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden py-16 lg:py-24" style={{ background: "var(--wh-gradient-hero)" }}>
          <div aria-hidden className="pointer-events-none absolute inset-0"><LeafDecor corner="bottom-right" size={220} opacity={0.25} /></div>
          <div className="relative mx-auto max-w-2xl px-4 text-center">
            <h2 className="text-[length:var(--wh-text-display)] leading-[1.05] font-bold tracking-tight text-balance">{t("landing.cta.title")}</h2>
            <p className="mt-3 text-[1.0625rem] text-[var(--wh-foreground-muted)]">{t("landing.cta.body")}</p>
            <ButtonLink href="/sign-up" className="mt-7 min-h-12 rounded-[var(--wh-radius-pill)] px-7 text-base shadow-[var(--wh-shadow-primary)]">
              {t("landing.cta.button")} <ArrowRight aria-hidden className="size-4 rtl:rotate-180" />
            </ButtonLink>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--wh-border)] py-8">
        <div className="mx-auto flex max-w-[var(--wh-content-wide)] flex-col items-start justify-between gap-4 px-4 text-sm text-[var(--wh-foreground-muted)] sm:flex-row sm:items-center lg:px-8">
          <p>{t("landing.footer.tagline")}</p>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-5">
            <Link href="/careers" className="inline-flex min-h-11 items-center hover:underline">{t("landing.footer.careers")}</Link>
            <Link href="/legal" className="inline-flex min-h-11 items-center hover:underline">{t("landing.footer.legal")}</Link>
            <Link href="/sign-in" className="inline-flex min-h-11 items-center hover:underline">{t("landing.footer.signIn")}</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
