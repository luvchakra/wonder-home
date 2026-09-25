import { CircleCheck, CloudRain, PawPrint, Shirt, Wrench } from "lucide-react";

import type { HomeAssessment } from "@wonderhome/core/home/assessment";
import { homeAgenda } from "@wonderhome/core/home/repository";
import type { Translate } from "@wonderhome/core/i18n/translate";
import { isHouseholdAdmin } from "@wonderhome/core/identity/households";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Card } from "@wonderhome/core/ui/card";
import {
  ExpandableMetricGrid,
  MetricDetailEmpty,
  type ExpandableMetric,
} from "@wonderhome/core/ui/expandable-metric-card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { EmptyState, ErrorState } from "@wonderhome/core/ui/states";

import { AddAssetButton, RaiseServiceRequestButton } from "../../_components/home-forms";
import { AgendaExpandableRow } from "../../_components/agenda-expandable-row";
import { requireSession } from "../../_lib/session";
import { upkeepFormLabels } from "../../_lib/upkeep-form-labels";

export const metadata = { title: "Home & Upkeep" };
export const dynamic = "force-dynamic";

/**
 * What a metric card's chevron opens onto: the real assessments behind its
 * count, reusing the exact rows the sections below already render (never a
 * second, thinner list invented for the panel) — capped at 4 with a plain
 * note for the rest, since "view all" is this same page, not another one.
 */
function agendaDetail(items: readonly HomeAssessment[], timezone: string, emptyText: string, t: Translate) {
  if (items.length === 0) return <MetricDetailEmpty>{emptyText}</MetricDetailEmpty>;
  return (
    <div className="space-y-2">
      <ul className="space-y-1">
        {items.slice(0, 4).map((item) => (
          <AgendaExpandableRow key={item.subjectKey} item={item} timezone={timezone} />
        ))}
      </ul>
      {items.length > 4 ? (
        <p className="px-1 text-xs text-[var(--wh-foreground-subtle)]">{t("upkeep.detail.moreBelow", { count: items.length - 4 })}</p>
      ) : null}
    </div>
  );
}

/**
 * Home & upkeep (module 13). The screen shows what needs a person and
 * nothing else — no inventory, no progress bars. When the house is working,
 * this page says so in one line, and that is the intended state most days.
 */
export default async function HomeUpkeepPage() {
  const session = await requireSession("/household/home");
  const { supabase, membership, view, viewer, secondary, locale } = session;
  const { t } = locale;
  const shell = {
    active: "more" as const,
    viewer,
    secondary,
    pathname: "/household/home",
    back: { href: "/more", label: t("common.back") },
    title: t("nav.item.upkeep"),
  };

  if (view.tone === "child") {
    return (
      <AppShell {...shell}>
        <EmptyState icon={Wrench} tone="home" title={t("upkeep.notAvailable.title")} description={t("upkeep.notAvailable.body")} />
      </AppShell>
    );
  }

  let agenda;
  try {
    agenda = await homeAgenda(supabase, membership.household.id);
  } catch {
    return (
      <AppShell {...shell}>
        <ErrorState title={t("upkeep.error.title")} description={t("upkeep.error.body")} retryHref="/household/home" />
      </AppShell>
    );
  }

  const sections = [
    { key: "maintenance", title: t("upkeep.section.maintenance"), items: agenda.maintenance },
    { key: "services", title: t("upkeep.section.services"), items: agenda.services },
    { key: "laundry", title: t("upkeep.section.laundry"), items: agenda.laundry },
    { key: "pets", title: t("upkeep.section.pets"), items: agenda.pets },
  ].filter((section) => section.items.length > 0);
  const needsYou = sections.reduce((total, section) => total + section.items.length, 0);
  const handledCount = Math.max(0, agenda.checked - needsYou);
  const admin = isHouseholdAdmin(membership);
  const timezone = membership.household.timezone;
  const needsYouItems = sections.flatMap((section) => section.items);
  const weatherChangesPlans =
    agenda.weather.status === "ready" && (!agenda.weather.drying.outdoorViable || agenda.weather.drying.hoursMultiplier > 1);
  const formLabels = upkeepFormLabels(t);

  const metrics: ExpandableMetric[] = [
    {
      label: t("upkeep.metric.needYou"),
      value: needsYou,
      icon: <IconTile icon={Wrench} tone="attention" size="sm" />,
      details: agendaDetail(needsYouItems, timezone, t("upkeep.detail.needYouEmpty"), t),
    },
    {
      label: t("upkeep.metric.handled"),
      value: handledCount,
      icon: <IconTile icon={CircleCheck} tone="handled" size="sm" />,
      details: (
        <MetricDetailEmpty>
          {handledCount === 0
            ? t("upkeep.detail.handledEmpty")
            : t("upkeep.detail.handled", { handled: handledCount, count: agenda.checked })}
        </MetricDetailEmpty>
      ),
    },
    {
      label: t("upkeep.section.laundry"),
      value: agenda.laundry.length,
      icon: <IconTile icon={Shirt} tone="care" size="sm" />,
      details: agendaDetail(agenda.laundry, timezone, t("upkeep.detail.laundryEmpty"), t),
    },
    {
      label: t("upkeep.section.pets"),
      value: agenda.pets.length,
      icon: <IconTile icon={PawPrint} tone="care" size="sm" />,
      details: agendaDetail(agenda.pets, timezone, t("upkeep.detail.petsEmpty"), t),
    },
  ];

  return (
    <AppShell {...shell}>
      <div className="space-y-5">
        <header className="wh-rise flex flex-wrap items-end justify-between gap-3">
          <div className="hidden lg:block">
            <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">{t("nav.item.upkeep")}</h1>
            <p className="text-sm text-[var(--wh-foreground-muted)]">{t("upkeep.lede", { household: membership.household.name })}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {admin ? <AddAssetButton householdId={membership.household.id} labels={formLabels} /> : null}
            <RaiseServiceRequestButton householdId={membership.household.id} labels={formLabels} />
          </div>
        </header>

        <ExpandableMetricGrid pairs metrics={metrics} />

        {/* Weather speaks only when it changes a decision (story 17-007): a
            fine day, an outage or weather switched off says nothing here. */}
        {weatherChangesPlans ? (
          <Card className="flex items-start gap-3 p-4">
            <IconTile icon={CloudRain} tone="money" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium break-words">
                {agenda.weather.place ? t("upkeep.weatherIn", { place: agenda.weather.place }) : t("upkeep.weather")}
              </p>
              <p className="text-sm text-[var(--wh-foreground-muted)]">{agenda.weather.drying.reason}{agenda.laundry.length > 0 ? ` ${t("upkeep.weatherLaundry")}` : ""}</p>
            </div>
          </Card>
        ) : null}

        {sections.length === 0 ? (
          <EmptyState
            icon={CircleCheck}
            tone="handled"
            title={t("upkeep.empty.title")}
            description={agenda.checked === 0 ? t("upkeep.empty.bodyNew") : t("upkeep.empty.bodyQuiet")}
          />
        ) : (
          sections.map((section) => (
            <section key={section.key}>
              <SectionHeader title={section.title} count={section.items.length} />
              <Card className="p-2">
                <ul className="divide-y divide-[var(--wh-border)]">
                  {section.items.map((item) => (
                    <AgendaExpandableRow key={item.subjectKey} item={item} timezone={timezone} />
                  ))}
                </ul>
              </Card>
            </section>
          ))
        )}

        <QuoteCard>{t("upkeep.quote")}</QuoteCard>
      </div>
    </AppShell>
  );
}
