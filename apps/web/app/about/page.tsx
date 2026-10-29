import { ChevronRight, FileText, LifeBuoy, ScrollText, Sparkles } from "lucide-react";
import Link from "next/link";

import { RELEASE_NOTES } from "@wonderhome/core/help/release-notes";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile, type IconTone } from "@wonderhome/core/ui/icon-tile";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";

import packageJson from "../../package.json";
import { requireSession } from "../_lib/session";

export const metadata = { title: "About WonderHome" };
export const dynamic = "force-dynamic";

/**
 * About WonderHome (the owner, 2026-10-21: "add about instead, with details
 * on app version and how it came into picture").
 *
 * The version is what this deployment really is: the newest release-notes
 * entry the owner confirmed live, the commit Vercel built (when there is one)
 * and the app's package version once it means something. The story is told
 * only from the product's own direction documents — the mission line, the
 * product principle, HomeTalk at the heart — never an invented history.
 */
export default async function AboutPage() {
  const session = await requireSession("/about");
  const { viewer, secondary, locale } = session;
  const { t, format } = locale;

  const latest = RELEASE_NOTES[0] ?? null;
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null;
  // The one release number: apps/web/package.json, shown as MAJOR.MINOR (1.0.0 -> "1.0"). 0.0.0 is the old placeholder.
  const [major, minor] = packageJson.version.split(".");
  const version = packageJson.version !== "0.0.0" ? `${major}.${minor}` : null;
  const versionLines = [
    version ? t("about.version.app", { version }) : null,
    latest ? t("about.version.release", { date: format.date(latest.date, "long") }) : null,
    commit ? t("about.version.build", { commit }) : null,
  ].filter((line): line is string => line !== null);

  const links: { href: string; icon: typeof LifeBuoy; tone: IconTone; title: string; hint: string }[] = [
    { href: "/help", icon: LifeBuoy, tone: "primary", title: t("about.links.help"), hint: t("about.links.helpHint") },
    { href: "/help#release-notes", icon: ScrollText, tone: "ai", title: t("about.links.notes"), hint: t("about.links.notesHint") },
    { href: "/legal", icon: FileText, tone: "neutral", title: t("about.links.legal"), hint: t("about.links.legalHint") },
  ];

  return (
    <AppShell active="more" viewer={viewer} secondary={secondary} pathname="/about" back={{ href: "/more", label: t("common.back") }} title={t("about.title")}>
      <div className="space-y-6">
        <header className="wh-rise">
          <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">{t("about.title")}</h1>
          <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{t("about.lede")}</p>
        </header>

        <section>
          <SectionHeader title={t("about.version.title")} />
          <Card className="flex items-start gap-3">
            <IconTile icon={Sparkles} tone="ai" />
            <div className="min-w-0 flex-1 space-y-1 text-sm">
              <p className="font-semibold">WonderHome</p>
              {versionLines.map((line) => (
                <p key={line} className="text-[var(--wh-foreground-muted)]">
                  {line}
                </p>
              ))}
              {latest ? (
                <Link href="/help#release-notes" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-[var(--wh-primary)]">
                  {t("about.version.notes")}
                  <ChevronRight aria-hidden className="size-4" />
                </Link>
              ) : null}
            </div>
          </Card>
        </section>

        <section>
          <SectionHeader title={t("about.story.title")} />
          <Card className="space-y-3 text-sm leading-relaxed">
            <p>{t("about.story.1")}</p>
            <p className="text-[var(--wh-foreground-muted)]">{t("about.story.2")}</p>
            <p className="text-[var(--wh-foreground-muted)]">{t("about.story.3")}</p>
          </Card>
        </section>

        <section>
          <SectionHeader title={t("about.links.title")} />
          <Card className="p-2">
            <ul className="divide-y divide-[var(--wh-border)]">
              {links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="flex min-h-14 items-center gap-3 rounded-[var(--wh-radius-sm)] px-2 py-2 transition-colors hover:bg-[var(--wh-surface-muted)]">
                    <IconTile icon={link.icon} tone={link.tone} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{link.title}</span>
                      <span className="block text-xs text-[var(--wh-foreground-subtle)]">{link.hint}</span>
                    </span>
                    <ChevronRight aria-hidden className="size-4 text-[var(--wh-foreground-subtle)]" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </section>

        <QuoteCard>{t("about.quote")}</QuoteCard>
      </div>
    </AppShell>
  );
}
