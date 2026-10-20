import { Armchair, Car, CircleCheck, CalendarClock, CloudRain, Hammer, Lamp, MonitorSmartphone, Package, PawPrint, Phone, Refrigerator, Shirt, Wrench } from "lucide-react";
import type { ComponentType } from "react";

import type { HomeAssessment } from "@wonderhome/core/home/assessment";
import { coverageOn, nextServiceDue, type AssetCategory, type HomeAsset } from "@wonderhome/core/home/assets";
import { homeAgenda, listAssetServiceEvents } from "@wonderhome/core/home/repository";
import type { ServiceRequest } from "@wonderhome/core/home/services";
import { assetHeadline, comingUp, splitRequests, type UpkeepDate } from "@wonderhome/core/home/upkeep-view";
import type { Translate } from "@wonderhome/core/i18n/translate";
import { isHouseholdAdmin } from "@wonderhome/core/identity/households";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Card } from "@wonderhome/core/ui/card";
import { ExpandableMetricGrid, MetricDetailEmpty, type ExpandableMetric } from "@wonderhome/core/ui/expandable-metric-card";
import { ExpandableRow } from "@wonderhome/core/ui/expandable-row";
import { IconTile, type IconTone } from "@wonderhome/core/ui/icon-tile";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { SegmentedControl } from "@wonderhome/core/ui/segmented-control";
import { EmptyState, ErrorState } from "@wonderhome/core/ui/states";

import {
  AddAssetButton,
  EditAssetButton,
  EditRequestButton,
  RaiseServiceRequestButton,
  RecordServiceButton,
  RequestStatusControl,
  type RequestValues,
} from "../../_components/home-forms";
import { AgendaExpandableRow } from "../../_components/agenda-expandable-row";
import { requireSession } from "../../_lib/session";
import { upkeepFormLabels } from "../../_lib/upkeep-form-labels";

export const metadata = { title: "Home & Upkeep" };
export const dynamic = "force-dynamic";

type Tab = "overview" | "things" | "requests";

const CATEGORY_ICON: Record<AssetCategory, ComponentType<{ className?: string }>> = {
  appliance: Refrigerator,
  fixture: Lamp,
  vehicle: Car,
  electronics: MonitorSmartphone,
  furniture: Armchair,
  other: Package,
};

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
      {items.length > 4 ? <p className="px-1 text-xs text-[var(--wh-foreground-subtle)]">{t("upkeep.detail.moreBelow", { count: items.length - 4 })}</p> : null}
    </div>
  );
}

const dayOf = (value: Date) => value.toISOString().slice(0, 10);

/**
 * Home & upkeep (module 13), laid out like the other modules (the owner,
 * 2026-10-21): an Overview that leads with what needs a person, then what is
 * coming up; Things, every appliance and fixture the household keeps, each
 * changeable, serviceable and retirable; and Requests, every service request,
 * moved on or taken back. Normal upkeep stays silent — the Overview says so in
 * one line when nothing needs anyone.
 */
export default async function HomeUpkeepPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [{ tab }, session] = await Promise.all([searchParams, requireSession("/household/home")]);
  const { supabase, membership, view, viewer, secondary, locale } = session;
  const { t, format } = locale;
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

  const householdId = membership.household.id;
  const now = new Date();
  // One wave: the agenda (which carries the rows it assessed) and the service history.
  let agenda, events;
  try {
    [agenda, events] = await Promise.all([homeAgenda(supabase, householdId, { now }), listAssetServiceEvents(supabase, householdId).catch(() => [])]);
  } catch {
    return (
      <AppShell {...shell}>
        <ErrorState title={t("upkeep.error.title")} description={t("upkeep.error.body")} retryHref="/household/home" />
      </AppShell>
    );
  }

  const active: Tab = tab === "things" || tab === "requests" ? tab : "overview";
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
  const weatherChangesPlans = agenda.weather.status === "ready" && (!agenda.weather.drying.outdoorViable || agenda.weather.drying.hoursMultiplier > 1);
  const formLabels = upkeepFormLabels(t);

  const { assets, requests } = agenda;
  const inUse = assets.filter((asset) => asset.status === "active");
  const retired = assets.filter((asset) => asset.status === "retired");
  const { open, settled } = splitRequests(requests);
  const flagged = new Set(agenda.maintenance.map((item) => item.subjectKey.replace(/^asset\./, "")));
  const upcoming = comingUp(inUse, now, 60, flagged);
  const assetName = new Map(assets.map((asset) => [asset.id, asset.name]));
  const date = (value: string | Date) => format.date(typeof value === "string" ? value : dayOf(value));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);

  const datedLine = (item: UpkeepDate) => {
    const overdue = item.on.getTime() < now.getTime() - 86_400_000;
    if (item.kind === "service") return t(overdue ? "upkeep.reason.serviceOverdue" : "upkeep.reason.serviceDue", { date: date(item.on) });
    return t(item.kind === "warranty" ? "upkeep.reason.warranty" : "upkeep.reason.amc", { date: date(item.on) });
  };
  const assetLine = (asset: HomeAsset) => {
    const headline = assetHeadline(asset, now);
    const parts = [formLabels.categories[asset.category], asset.location, headline ? datedLine(headline) : t("upkeep.reason.undated")].filter(Boolean);
    return parts.join(" · ");
  };
  const requestValues = (request: ServiceRequest): RequestValues => ({
    id: request.id,
    subject: request.subject,
    providerName: request.providerName,
    providerContact: request.providerContact,
    status: request.status,
    scheduledOn: request.scheduledFor ? dayOf(request.scheduledFor) : null,
    nextAction: request.nextAction,
  });
  const requestLine = (request: ServiceRequest) =>
    [
      formLabels.statuses[request.status],
      request.providerName ? t("upkeep.request.with", { provider: request.providerName }) : null,
      request.scheduledFor ? t("upkeep.request.visit", { date: date(request.scheduledFor) }) : null,
    ]
      .filter(Boolean)
      .join(" · ");

  const metrics: ExpandableMetric[] = [
    { label: t("upkeep.metric.needYou"), value: needsYou, icon: <IconTile icon={Wrench} tone="attention" size="sm" />, details: agendaDetail(needsYouItems, timezone, t("upkeep.detail.needYouEmpty"), t) },
    {
      label: t("upkeep.metric.handled"),
      value: handledCount,
      icon: <IconTile icon={CircleCheck} tone="handled" size="sm" />,
      details: <MetricDetailEmpty>{handledCount === 0 ? t("upkeep.detail.handledEmpty") : t("upkeep.detail.handled", { handled: handledCount, count: agenda.checked })}</MetricDetailEmpty>,
    },
    { label: t("upkeep.section.laundry"), value: agenda.laundry.length, icon: <IconTile icon={Shirt} tone="care" size="sm" />, details: agendaDetail(agenda.laundry, timezone, t("upkeep.detail.laundryEmpty"), t) },
    { label: t("upkeep.section.pets"), value: agenda.pets.length, icon: <IconTile icon={PawPrint} tone="care" size="sm" />, details: agendaDetail(agenda.pets, timezone, t("upkeep.detail.petsEmpty"), t) },
  ];

  const statusTone = (request: ServiceRequest): IconTone =>
    request.status === "completed" ? "handled" : request.status === "cancelled" ? "neutral" : request.nextActionBy === "household" ? "attention" : "home";

  const assetRow = (asset: HomeAsset) => {
    const Icon = CATEGORY_ICON[asset.category] ?? Package;
    const due = nextServiceDue(asset, [], now);
    const cover = coverageOn(asset, now);
    const history = events.filter((event) => event.assetId === asset.id).slice(0, 3);
    const mayChange = admin || asset.responsibleMemberId === membership.memberId;
    return (
      <ExpandableRow
        key={asset.id}
        summary={
          <>
            <IconTile icon={Icon} tone={asset.status === "retired" ? "neutral" : "home"} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium break-words">{asset.name}</span>
              <span className="block text-xs text-[var(--wh-foreground-subtle)]">{assetLine(asset)}</span>
            </span>
          </>
        }
      >
        <div className="space-y-3 px-2 pb-2 text-sm">
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-[var(--wh-foreground-subtle)]">{t("upkeep.detail.service")}</dt>
              <dd>{asset.serviceIntervalDays ? t("upkeep.detail.every", { count: asset.serviceIntervalDays }) : t("upkeep.reason.noService")}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--wh-foreground-subtle)]">{t("upkeep.detail.lastServiced")}</dt>
              <dd>{asset.lastServicedOn ? date(asset.lastServicedOn) : t("upkeep.detail.never")}</dd>
            </div>
            {due ? (
              <div>
                <dt className="text-xs text-[var(--wh-foreground-subtle)]">{t("upkeep.detail.nextDue")}</dt>
                <dd>{date(due)}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs text-[var(--wh-foreground-subtle)]">{t("upkeep.detail.cover")}</dt>
              <dd>
                {cover.kind === "none" || !cover.expiresOn
                  ? t("upkeep.detail.noCover")
                  : t(cover.kind === "warranty" ? "upkeep.reason.warranty" : "upkeep.reason.amc", { date: date(cover.expiresOn) })}
              </dd>
            </div>
          </dl>
          {history.length > 0 ? (
            <div>
              <p className="text-xs font-semibold text-[var(--wh-foreground-muted)]">{t("upkeep.detail.history")}</p>
              <ul className="mt-1 space-y-0.5 text-xs text-[var(--wh-foreground-muted)]">
                {history.map((event) => (
                  <li key={event.id}>
                    {formLabels.serviceKinds[event.kind as keyof typeof formLabels.serviceKinds] ?? event.kind} · {date(event.occurredOn)}
                    {event.providerName ? ` · ${event.providerName}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {mayChange ? (
            <div className="flex flex-wrap items-center gap-2">
              {asset.status === "active" ? <RecordServiceButton householdId={householdId} assetId={asset.id} today={today} labels={formLabels} /> : null}
              <EditAssetButton
                householdId={householdId}
                labels={formLabels}
                editLabel={t("upkeep.edit", { name: asset.name })}
                asset={{
                  id: asset.id,
                  name: asset.name,
                  category: asset.category,
                  location: asset.location,
                  serviceIntervalDays: asset.serviceIntervalDays,
                  lastServicedOn: asset.lastServicedOn,
                  warrantyExpiresOn: asset.warrantyExpiresOn,
                  amcExpiresOn: asset.amcExpiresOn,
                  status: asset.status,
                }}
              />
            </div>
          ) : null}
        </div>
      </ExpandableRow>
    );
  };

  const requestRow = (request: ServiceRequest) => (
    <ExpandableRow
      key={request.id}
      summary={
        <>
          <IconTile icon={request.status === "completed" ? CircleCheck : Hammer} tone={statusTone(request)} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium break-words">{request.subject}</span>
            <span className="block text-xs text-[var(--wh-foreground-subtle)]">{requestLine(request)}</span>
          </span>
        </>
      }
    >
      <div className="space-y-3 px-2 pb-2 text-sm">
        {request.assetId && assetName.has(request.assetId) ? <p className="text-xs text-[var(--wh-foreground-muted)]">{t("upkeep.request.for", { name: assetName.get(request.assetId)! })}</p> : null}
        {request.nextAction ? (
          <p>
            <span className="text-xs text-[var(--wh-foreground-subtle)]">{t(request.nextActionBy === "provider" ? "upkeep.request.theirMove" : "upkeep.request.yourMove")}</span>
            <span className="block">{request.nextAction}</span>
          </p>
        ) : null}
        {request.providerContact ? (
          <a
            href={/^[+\d\s()-]{6,}$/.test(request.providerContact) ? `tel:${request.providerContact.replace(/[^+\d]/g, "")}` : `mailto:${request.providerContact}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--wh-primary)] underline-offset-2 hover:underline"
          >
            <Phone aria-hidden className="size-3.5" /> {request.providerContact}
          </a>
        ) : null}
        <p className="text-xs text-[var(--wh-foreground-subtle)]">{t("upkeep.request.updated", { date: date(request.updatedAt) })}</p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1">
            <RequestStatusControl householdId={householdId} request={requestValues(request)} labels={formLabels} />
          </div>
          <EditRequestButton householdId={householdId} request={requestValues(request)} labels={formLabels} editLabel={t("upkeep.edit", { name: request.subject })} />
        </div>
      </div>
    </ExpandableRow>
  );

  return (
    <AppShell {...shell}>
      <div className="space-y-5">
        <header className="wh-rise space-y-3">
          <div>
            <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">{t("nav.item.upkeep")}</h1>
            <p className="text-sm text-[var(--wh-foreground-muted)]">{t("upkeep.lede", { household: membership.household.name })}</p>
          </div>
          {/* The two ways in, reachable whatever is already listed (rule 12). */}
          <div className="flex flex-wrap gap-2">
            {admin ? <AddAssetButton householdId={householdId} labels={formLabels} /> : null}
            <RaiseServiceRequestButton householdId={householdId} labels={formLabels} />
          </div>
        </header>

        <SegmentedControl
          label={t("upkeep.view")}
          active={active}
          segments={[
            { key: "overview", label: t("upkeep.tab.overview"), href: "/household/home", count: needsYou },
            { key: "things", label: t("upkeep.tab.things"), href: "/household/home?tab=things", count: inUse.length },
            { key: "requests", label: t("upkeep.tab.requests"), href: "/household/home?tab=requests", count: open.length },
          ]}
        />

        {active === "overview" ? (
          <>
            <ExpandableMetricGrid pairs metrics={metrics} />

            {/* Weather speaks only when it changes a decision (story 17-007). */}
            {weatherChangesPlans ? (
              <Card className="flex items-start gap-3 p-4">
                <IconTile icon={CloudRain} tone="money" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium break-words">{agenda.weather.place ? t("upkeep.weatherIn", { place: agenda.weather.place }) : t("upkeep.weather")}</p>
                  <p className="text-sm text-[var(--wh-foreground-muted)]">
                    {agenda.weather.drying.reason}
                    {agenda.laundry.length > 0 ? ` ${t("upkeep.weatherLaundry")}` : ""}
                  </p>
                </div>
              </Card>
            ) : null}

            {sections.length === 0 ? (
              <EmptyState icon={CircleCheck} tone="handled" title={t("upkeep.empty.title")} description={agenda.checked === 0 ? t("upkeep.empty.bodyNew") : t("upkeep.empty.bodyQuiet")} />
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

            {upcoming.length > 0 ? (
              <section>
                <SectionHeader title={t("upkeep.comingUp")} count={upcoming.length} />
                <Card className="p-2">
                  <ul className="divide-y divide-[var(--wh-border)]">
                    {upcoming.map((item) => (
                      <li key={`${item.assetId}-${item.kind}`} className="flex items-center gap-3 px-2 py-2.5">
                        <IconTile icon={item.kind === "service" ? CalendarClock : CircleCheck} tone={item.kind === "service" ? "home" : "money"} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium break-words">{item.name}</span>
                          <span className="block text-xs text-[var(--wh-foreground-subtle)]">{datedLine(item)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </section>
            ) : null}
          </>
        ) : null}

        {active === "things" ? (
          <>
            {inUse.length === 0 ? (
              <EmptyState icon={Refrigerator} tone="home" title={t("upkeep.things.empty.title")} description={admin ? t("upkeep.things.empty.body") : t("upkeep.things.empty.bodyMember")} />
            ) : (
              <section>
                <SectionHeader title={t("upkeep.things.title")} count={inUse.length} />
                <Card className="p-2">
                  <ul className="divide-y divide-[var(--wh-border)]">{inUse.map(assetRow)}</ul>
                </Card>
              </section>
            )}
            {retired.length > 0 ? (
              <section>
                <SectionHeader title={t("upkeep.things.retired")} count={retired.length} />
                <Card className="p-2">
                  <ul className="divide-y divide-[var(--wh-border)]">{retired.map(assetRow)}</ul>
                </Card>
              </section>
            ) : null}
          </>
        ) : null}

        {active === "requests" ? (
          <>
            {open.length === 0 ? (
              <EmptyState icon={Hammer} tone="home" title={t("upkeep.requests.empty.title")} description={t("upkeep.requests.empty.body")} />
            ) : (
              <section>
                <SectionHeader title={t("upkeep.requests.open")} count={open.length} />
                <Card className="p-2">
                  <ul className="divide-y divide-[var(--wh-border)]">{open.map(requestRow)}</ul>
                </Card>
              </section>
            )}
            {settled.length > 0 ? (
              <section>
                <SectionHeader title={t("upkeep.requests.settled")} count={settled.length} />
                <Card className="p-2">
                  <ul className="divide-y divide-[var(--wh-border)]">{settled.slice(0, 20).map(requestRow)}</ul>
                </Card>
                {settled.length > 20 ? <p className="mt-2 px-1 text-xs text-[var(--wh-foreground-subtle)]">{t("upkeep.requests.older", { count: settled.length - 20 })}</p> : null}
              </section>
            ) : null}
          </>
        ) : null}

        <QuoteCard>{t("upkeep.quote")}</QuoteCard>
      </div>
    </AppShell>
  );
}
