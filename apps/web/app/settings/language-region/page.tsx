import { CalendarClock, ChevronRight, Coins, Globe2, Languages, Ruler, Users } from "lucide-react";
import Link from "next/link";
import type { ComponentType } from "react";

import { describeTimezone, languageInfo } from "@wonderhome/core/i18n/locales";
import { currencyLabel, regionName } from "@wonderhome/core/i18n/options";
import { isHouseholdAdmin } from "@wonderhome/core/identity/households";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Card } from "@wonderhome/core/ui/card";
import { HomeIllustration } from "@wonderhome/core/ui/home-illustration";
import { IconTile, type IconTone } from "@wonderhome/core/ui/icon-tile";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";

import { requireSession } from "../../_lib/session";

export const metadata = { title: "Language & Region" };
export const dynamic = "force-dynamic";

type Row = { icon: ComponentType<{ className?: string }>; tone: IconTone; label: string; value: string; href: string; note?: string };

/**
 * Settings & Profile → Language & Region (story 22-002): the permanent home
 * of every preference the optional setup asks, so nothing chosen there is
 * ever only choosable there. Personal choices sit under the person;
 * the household's are marked as the household's, and a member who is not
 * an Admin can read them but is told who changes them.
 */
export default async function LanguageRegionPage() {
  const session = await requireSession("/settings/language-region");
  const { membership, viewer, secondary, locale } = session;
  const { t, preferences, format } = locale;
  const admin = isHouseholdAdmin(membership);
  const householdNote = admin ? t("settings.householdChoice") : t("l10n.householdSet");

  const sections: { title: string; rows: Row[] }[] = [
    {
      title: t("settings.section.language"),
      rows: [{ icon: Languages, tone: "primary", label: t("field.language"), value: languageInfo(preferences.language).nativeName, href: "/settings/language-region/language", note: t("settings.personalChoice") }],
    },
    {
      title: t("settings.section.region"),
      rows: [
        { icon: Globe2, tone: "home", label: t("field.region"), value: `${regionName(preferences.region, preferences.language)} (${preferences.timezone})`, href: "/settings/language-region/region", note: householdNote },
        { icon: Coins, tone: "money", label: t("field.currency"), value: currencyLabel(preferences.currency, preferences.language), href: "/settings/language-region/currency", note: householdNote },
      ],
    },
    {
      title: t("settings.section.dateTime"),
      rows: [
        {
          icon: CalendarClock,
          tone: "school",
          label: `${t("field.timezone")} · ${t("field.dateFormat")} · ${t("field.timeFormat")}`,
          value: `${describeTimezone(preferences.timezone)} · ${format.numericDate(new Date())} · ${preferences.timeFormat === "12h" ? t("time.12h") : t("time.24h")}`,
          href: "/settings/language-region/datetime",
        },
      ],
    },
    {
      title: t("settings.section.measurement"),
      rows: [{ icon: Ruler, tone: "care", label: t("field.units"), value: preferences.measurement === "metric" ? `${t("units.metric")} (${t("units.metricHint")})` : `${t("units.imperial")} (${t("units.imperialHint")})`, href: "/settings/language-region/datetime#units", note: t("settings.personalChoice") }],
    },
    {
      title: t("settings.section.household"),
      rows: [{ icon: Users, tone: "people", label: t("settings.memberLanguages"), value: t("settings.memberLanguages.lede"), href: "/settings/language-region/members" }],
    },
  ];

  return (
    <AppShell active="more" viewer={viewer} secondary={secondary} pathname="/settings" back={{ href: "/settings", label: t("common.back") }} title={t("settings.languageRegion")}>
      <div className="space-y-6">
        <p className="text-[0.9375rem] text-[var(--wh-foreground-muted)]">{t("settings.languageRegion.lede")}</p>

        {sections.map((section) => (
          <section key={section.title}>
            <SectionHeader title={section.title} />
            <Card className="p-2">
              <ul className="divide-y divide-[var(--wh-border)]">
                {section.rows.map((row) => (
                  <li key={row.href + row.label}>
                    <Link href={row.href} className="flex min-h-14 items-center gap-3 rounded-[var(--wh-radius-sm)] px-2 py-2.5 hover:bg-[var(--wh-surface-muted)]">
                      <IconTile icon={row.icon} tone={row.tone} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{row.label}</span>
                        <span className="block text-sm text-[var(--wh-foreground-muted)]">{row.value}</span>
                        {row.note ? <span className="block text-xs text-[var(--wh-foreground-subtle)]">{row.note}</span> : null}
                      </span>
                      <ChevronRight aria-hidden className="size-4 shrink-0 text-[var(--wh-foreground-subtle)] rtl:rotate-180" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        ))}

        <Card className="overflow-hidden p-0">
          <div style={{ background: "var(--wh-gradient-hero)" }}>
            <HomeIllustration className="mx-auto block h-auto w-full max-w-sm" />
          </div>
          <div className="space-y-1 p-4">
            <p className="font-semibold">{t("settings.personal.title")}</p>
            <p className="text-sm text-[var(--wh-foreground-muted)]">{t("settings.personal.body")}</p>
          </div>
        </Card>

        <QuoteCard>Your home. Your rules.</QuoteCard>
      </div>
    </AppShell>
  );
}
